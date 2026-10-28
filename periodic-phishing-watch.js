#!/usr/bin/env node
/**
 * Hourly sentinel: queries HafSQL for CONFIRMED scam domains (same fixed
 * list as find-phishing-candidates.js — no heuristic guessing), flags any
 * post not already in flag-phishing-state.json, then sleeps an hour.
 *
 * Auto-flags without per-run human review because the domain list itself
 * is the human-reviewed gate: every domain in CONFIRMED_SCAM_DOMAINS was
 * already vetted (1867 posts checked with zero false positives). Adding a
 * NEW domain to that list is still a manual, deliberate edit — this script
 * never invents new domains on its own.
 *
 * Run with:
 *   HIVESQL_SERVER=vip.hivesql.io HIVESQL_DB=DBHive HIVESQL_USER=Hive-caparadiso \
 *   HIVESQL_PASSWORD=xxxx HIVE3_POSTING_KEY=xxxx node periodic-phishing-watch.js
 *
 * On the VPS, prefer running it via run-with-key.sh so the posting key is
 * decrypted automatically instead of passed in plaintext:
 *   pm2 start run-with-key.sh --name phishing-watch -- periodic-phishing-watch.js
 */

// Polyfill for Node < 22 (this VPS runs Node 18) — a dependency of mssql uses it.
if (!Promise.withResolvers) {
  Promise.withResolvers = function () {
    let resolve, reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  };
}

const sql = require('mssql');
const { Client, PrivateKey } = require('@hiveio/dhive');
const fs = require('fs');
const path = require('path');

const CONFIRMED_SCAM_DOMAINS = [
  'claim-hive.blog',
  't.co/8eD7gFzqKd',
];

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const LOOKBACK_DAYS = 2; // overlap window, wider than the interval, so nothing slips through a missed run
const FLAGGER = 'hive3';
const WARNING_BODY =
  "⚠️ Heads up: this looks like a phishing/scam link (masked URL, claim/verify wording). Please don't click or enter your keys. Flagging for moderators to review. 🐝";
const DOWNVOTE_WEIGHT = -10; // 0.1%
const COMMENT_SPACING_MS = 3500;
const STATE_FILE = path.join(__dirname, 'flag-phishing-state.json');
// anyx.io dropped: HTTP 502s destabilized dhive's failover (same issue hit in server/hive-verify.js).
const NODES = ['https://api.hive.blog', 'https://api.deathwing.me', 'https://api.syncad.com', 'https://api.openhive.network'];

const sqlConfig = {
  server: process.env.HIVESQL_SERVER,
  database: process.env.HIVESQL_DB,
  user: process.env.HIVESQL_USER,
  password: process.env.HIVESQL_PASSWORD,
  options: { encrypt: true, trustServerCertificate: true },
  requestTimeout: 280000,
  connectionTimeout: 30000,
};

const POSTING_KEY = process.env.HIVE3_POSTING_KEY;
if (!POSTING_KEY) {
  console.error('Set HIVE3_POSTING_KEY (directly, or run via run-with-key.sh).');
  process.exit(1);
}
const key = PrivateKey.fromString(POSTING_KEY);
const client = new Client(NODES);

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { handled: {} }; }
}
function saveState(state) { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function queryCandidates() {
  await sql.connect(sqlConfig);
  const request = new sql.Request();
  CONFIRMED_SCAM_DOMAINS.forEach((d, i) => request.input(`d${i}`, sql.NVarChar, `%${d}%`));
  const clauses = CONFIRMED_SCAM_DOMAINS.map((_, i) => `body LIKE @d${i}`).join(' OR ');
  const result = await request.query(`
    SELECT author, permlink, created
    FROM Comments
    WHERE created > DATEADD(day, -${LOOKBACK_DAYS}, GETDATE())
      AND (${clauses})
    ORDER BY created DESC
  `);
  await sql.close();
  return result.recordset.filter(r => r.author !== FLAGGER);
}

async function flagOne(item, state) {
  const key_id = `${item.author}/${item.permlink}`;
  const record = state.handled[key_id] || { commented: false, downvoted: false };
  console.log(`[${new Date().toISOString()}] Flagging ${key_id}`);

  if (!record.commented) {
    const replyPermlink = `re-${item.permlink}-flag`.slice(0, 255);
    try {
      await client.broadcast.comment({
        parent_author: item.author, parent_permlink: item.permlink,
        author: FLAGGER, permlink: replyPermlink, title: '', body: WARNING_BODY,
        json_metadata: JSON.stringify({ app: 'hive3-phishing-watch/1.0', tags: ['hive'] }),
      }, key);
      console.log('  -> comment posted');
      record.commented = true;
    } catch (err) { console.error(`  -> comment FAILED: ${err.message}`); }
  }

  if (!record.downvoted) {
    try {
      await client.broadcast.vote({ voter: FLAGGER, author: item.author, permlink: item.permlink, weight: DOWNVOTE_WEIGHT }, key);
      console.log('  -> downvote cast');
      record.downvoted = true;
    } catch (err) { console.error(`  -> downvote FAILED: ${err.message}`); }
  }

  state.handled[key_id] = record;
  saveState(state);
  await sleep(COMMENT_SPACING_MS);
}

let running = false;

async function tick() {
  if (running) { console.log(`[${new Date().toISOString()}] previous tick still running, skipping`); return; }
  running = true;
  try {
    const candidates = await queryCandidates();
    const state = loadState();
    const fresh = candidates.filter(r => {
      const rec = state.handled[`${r.author}/${r.permlink}`];
      return !rec || !rec.commented || !rec.downvoted;
    });
    if (!fresh.length) {
      console.log(`[${new Date().toISOString()}] no new confirmed-domain posts`);
    } else {
      console.log(`[${new Date().toISOString()}] ${fresh.length} new confirmed-domain post(s), flagging...`);
      for (const item of fresh) await flagOne(item, state);
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] tick failed: ${err.message}`);
  } finally {
    running = false;
  }
}

console.log(`Starting hourly phishing watch (${CONFIRMED_SCAM_DOMAINS.length} confirmed domain(s)). Ctrl+C to stop.`);
tick();
setInterval(tick, CHECK_INTERVAL_MS);
