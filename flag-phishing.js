#!/usr/bin/env node
/**
 * Flags a list of HUMAN-APPROVED phishing candidates: leaves a warning
 * reply from @hive3 and casts a small downvote on each. Never discovers
 * targets on its own — always takes an explicit input file.
 *
 * Run with:
 *   HIVE3_POSTING_KEY=xxxx node flag-phishing.js approved-phishing-targets.json
 *
 * Input file format: JSON array of { "author": "...", "permlink": "..." }
 * (exactly what phishing-queue.html's "Export approved" button produces).
 */

const { Client, PrivateKey } = require('@hiveio/dhive');
const fs = require('fs');
const path = require('path');

const FLAGGER = 'hive3';
const WARNING_BODY =
  "⚠️ Heads up: this looks like a phishing/scam link (masked URL, claim/verify wording). Please don't click or enter your keys. Flagging for moderators to review. 🐝";
const DOWNVOTE_WEIGHT = -10; // 0.1%, matches the weight used for the stefany0720 case
const COMMENT_SPACING_MS = 13000;
const STATE_FILE = path.join(__dirname, 'flag-phishing-state.json');
// anyx.io dropped: HTTP 502s destabilized dhive's failover (same issue hit in server/hive-verify.js).
const NODES = ['https://api.hive.blog', 'https://api.deathwing.me', 'https://api.syncad.com', 'https://api.openhive.network'];

const inputFile = process.argv[2];
if (!inputFile) {
  console.error('Usage: HIVE3_POSTING_KEY=xxx node flag-phishing.js approved-phishing-targets.json');
  process.exit(1);
}
const POSTING_KEY = process.env.HIVE3_POSTING_KEY;
if (!POSTING_KEY) {
  console.error('Set HIVE3_POSTING_KEY env var (the @hive3 posting key) before running.');
  process.exit(1);
}

const targets = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
if (!Array.isArray(targets) || !targets.length) {
  console.error('Input file has no targets — nothing to do.');
  process.exit(0);
}

const key = PrivateKey.fromString(POSTING_KEY);
const client = new Client(NODES);

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { handled: {} }; }
}
function saveState(state) { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

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
        json_metadata: JSON.stringify({ app: 'hive3-phishing-flagger/1.0', tags: ['hive'] }),
      }, key);
      console.log('  -> comment posted');
      record.commented = true;
    } catch (err) { console.error(`  -> comment FAILED: ${err.message}`); }
  } else console.log('  -> already commented, skipping');

  if (!record.downvoted) {
    try {
      await client.broadcast.vote({ voter: FLAGGER, author: item.author, permlink: item.permlink, weight: DOWNVOTE_WEIGHT }, key);
      console.log('  -> downvote cast');
      record.downvoted = true;
    } catch (err) { console.error(`  -> downvote FAILED: ${err.message}`); }
  } else console.log('  -> already downvoted, skipping');

  state.handled[key_id] = record;
  saveState(state);
  await sleep(COMMENT_SPACING_MS);
}

(async () => {
  const state = loadState();
  console.log(`${targets.length} approved target(s) loaded from ${inputFile}.`);
  for (const item of targets) await flagOne(item, state);
  console.log('Done.');
})();
