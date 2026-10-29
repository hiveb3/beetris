#!/usr/bin/env node
/**
 * Watches for NEW @hive3 witness votes and pushes a phone notification via
 * ntfy.sh (same topic already used for witness-node monitoring) whenever a
 * dolphin-or-bigger account votes — minnow-sized votes stay silent so the
 * channel doesn't get noisy.
 *
 * HP tiers (rough, commonly used convention):
 *   dolphin >= 500 HP, orca >= 10,000 HP, whale >= 100,000 HP
 *
 * Run with:
 *   node watch-whale-votes.js
 * (no posting key needed — this only reads the chain and calls ntfy.sh)
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const WITNESS = 'hive3';
const OWN_ACCOUNTS = new Set(['caparadiso', 'pollenpatron']); // the user's own accounts — track but never notify for these
const NTFY_TOPIC = 'hive3-witness-amico-xk92j';
const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const STATE_FILE = path.join(__dirname, 'witness-voters-seen.json');
const NODE = 'https://api.hive.blog';

function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 });
    const req = https.request(NODE, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d).result); } catch (e) { reject(e); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function ntfy(message, title) {
  return new Promise((resolve) => {
    try {
      // HTTP header values must be ASCII — keep emoji out of the Title header,
      // they're fine in the body (not a header), which is where the message goes.
      const safeTitle = (title || 'Hive3 witness').replace(/[^\x20-\x7E]/g, '').trim() || 'Hive3 witness';
      const req = https.request(`https://ntfy.sh/${NTFY_TOPIC}`, {
        method: 'POST',
        headers: { 'Title': safeTitle, 'Priority': 'default', 'Tags': 'whale' },
      }, res => { res.on('data', () => {}); res.on('end', resolve); });
      req.on('error', () => resolve()); // best-effort, never crash the watcher over a notification failure
      req.write(message);
      req.end();
    } catch (e) {
      console.error('  -> ntfy failed:', e.message);
      resolve();
    }
  });
}

function loadSeen() {
  try { return new Set(JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))); } catch { return new Set(); }
}
function saveSeen(set) { fs.writeFileSync(STATE_FILE, JSON.stringify([...set], null, 2)); }

// HiveBuzz/community convention: powers of 10 in VESTS, not a fixed HP cutoff
// (HP-per-VEST drifts with inflation, VESTS thresholds don't).
// https://docs.hivebuzz.me/board/statistics
function tier(vests) {
  if (vests >= 1000000000) return { label: 'WHALE', emoji: '🐳' };
  if (vests >= 100000000) return { label: 'ORCA', emoji: '🐋' };
  if (vests >= 10000000) return { label: 'DOLPHIN', emoji: '🐬' };
  return null; // minnow or smaller
}

async function getVestsAndHP(account, globalProps) {
  const [acc] = await rpc('condenser_api.get_accounts', [[account]]);
  if (!acc) return { vests: 0, hp: 0 };
  const vests = parseFloat(acc.vesting_shares.split(' ')[0]);
  const totalVestingFundHive = parseFloat(globalProps.total_vesting_fund_hive.split(' ')[0]);
  const totalVestingShares = parseFloat(globalProps.total_vesting_shares.split(' ')[0]);
  const hp = vests * totalVestingFundHive / totalVestingShares;
  return { vests, hp };
}

let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const votesResult = await rpc('database_api.list_witness_votes', {
      start: [WITNESS, ''], limit: 1000, order: 'by_witness_account',
    });
    const voters = (votesResult?.votes || []).filter(v => v.witness === WITNESS).map(v => v.account);

    const seen = loadSeen();
    const newVoters = voters.filter(v => !seen.has(v));

    if (!newVoters.length) {
      console.log(`[${new Date().toISOString()}] no new voters (${voters.length} total)`);
    } else {
      console.log(`[${new Date().toISOString()}] ${newVoters.length} new voter(s): ${newVoters.join(', ')}`);
      const globalProps = await rpc('condenser_api.get_dynamic_global_properties', []);
      for (const voter of newVoters) {
        try {
          const { vests, hp } = await getVestsAndHP(voter, globalProps);
          const t = OWN_ACCOUNTS.has(voter) ? null : tier(vests);
          if (OWN_ACCOUNTS.has(voter)) {
            console.log(`  -> @${voter} is one of your own accounts, skipping notification`);
          } else if (t) {
            const msg = `${t.emoji} @${voter} (${t.label}, ~${Math.round(hp).toLocaleString()} HP) just voted @hive3 as witness!`;
            console.log('  ->', msg);
            await ntfy(msg, `New ${t.label} witness vote!`);
          } else {
            console.log(`  -> @${voter} voted (~${Math.round(hp)} HP, below dolphin threshold, staying quiet)`);
          }
          seen.add(voter);
          saveSeen(seen); // persist after each voter so a later failure doesn't re-process this one
        } catch (e) {
          console.error(`  -> failed processing @${voter}: ${e.message}`);
        }
      }
    }
    // always persist the full current set, even with no new voters, in case state file was missing
    saveSeen(new Set([...loadSeen(), ...voters]));
  } catch (err) {
    console.error(`[${new Date().toISOString()}] tick failed: ${err.message}`);
  } finally {
    running = false;
  }
}

console.log(`Watching @${WITNESS}'s witness voters for dolphin+ accounts, checking every ${CHECK_INTERVAL_MS / 60000}min.`);
tick();
setInterval(tick, CHECK_INTERVAL_MS);
