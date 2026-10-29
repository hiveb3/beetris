#!/usr/bin/env node
/* BeeTris Soundtrack Contest payouts from @beetris.contest.
 *
 *   node scripts/contest-payout.js start  1st 2nd 3rd   -> sends the HBD 60/25/15, starts the HP power down
 *   node scripts/contest-payout.js weekly                -> sends the liquid HIVE received from the weekly
 *                                                           power-down instalment, 60/25/15 (run from cron)
 *   add --dry to any command to only print what it would do.
 *
 * Needs BEETRIS_CONTEST_ACTIVE_KEY in the environment (never hard-code it) and
 * `npm i @hiveio/dhive` (already a dependency of server/). Winners are saved to contest-winners.json.
 */
const fs = require('fs');
const path = require('path');
const { Client, PrivateKey } = require(require.resolve('@hiveio/dhive', { paths: [path.join(__dirname, '..', 'server'), __dirname] }));

const ACCOUNT = 'beetris.contest';
const SPLIT = [0.60, 0.25, 0.15];
const STATE = path.join(__dirname, '..', 'contest-winners.json');
const client = new Client(['https://api.hive.blog', 'https://api.deathwing.me', 'https://api.openhive.network']);
const dry = process.argv.includes('--dry');
const args = process.argv.slice(2).filter(a => a !== '--dry');

const amt = s => parseFloat(String(s).split(' ')[0]);
const fmt = (n, sym) => `${(Math.floor(n * 1000) / 1000).toFixed(3)} ${sym}`;
const key = () => {
  const k = process.env.BEETRIS_CONTEST_ACTIVE_KEY;
  if (!k && !dry) { console.error('Set BEETRIS_CONTEST_ACTIVE_KEY'); process.exit(1); }
  return k ? PrivateKey.fromString(k) : null;
};

async function account() { const [a] = await client.database.getAccounts([ACCOUNT]); if (!a) throw new Error('account not found'); return a; }

async function pay(winners, total, sym, memo) {
  const ops = winners.map((to, i) => ['transfer', { from: ACCOUNT, to, amount: fmt(total * SPLIT[i], sym), memo }]);
  ops.forEach(([, o]) => console.log(`${dry ? '[dry] ' : ''}${o.amount} -> @${o.to}`));
  if (!dry && ops.length) await client.broadcast.sendOperations(ops, key());
}

async function start(winners) {
  if (winners.length !== 3) throw new Error('give exactly 3 winners: 1st 2nd 3rd');
  fs.writeFileSync(STATE, JSON.stringify({ winners, started: new Date().toISOString() }, null, 1));
  const a = await account();
  const hbd = amt(a.hbd_balance);
  console.log(`HBD available: ${hbd}`);
  if (hbd >= 0.003) await pay(winners, hbd, 'HBD', 'BeeTris Soundtrack Contest prize (HBD) 🐝🏆');
  const vests = amt(a.vesting_shares) - amt(a.delegated_vesting_shares);
  console.log(`${dry ? '[dry] ' : ''}power down ${vests.toFixed(6)} VESTS (13 weekly instalments)`);
  if (!dry && vests > 0) await client.broadcast.sendOperations([['withdraw_vesting', { account: ACCOUNT, vesting_shares: `${vests.toFixed(6)} VESTS` }]], key());
}

async function weekly() {
  if (!fs.existsSync(STATE)) throw new Error('run "start" first');
  const { winners } = JSON.parse(fs.readFileSync(STATE));
  const a = await account();
  const hive = amt(a.balance) - 0.001; // leave dust
  console.log(`HIVE available: ${hive.toFixed(3)}`);
  if (hive >= 0.01) await pay(winners, hive, 'HIVE', 'BeeTris Soundtrack Contest prize (weekly HP instalment) 🐝🍯');
}

(async () => {
  const [cmd, ...rest] = args;
  if (cmd === 'start') await start(rest.map(u => u.replace(/^@/, '').toLowerCase()));
  else if (cmd === 'weekly') await weekly();
  else console.log('usage: contest-payout.js start <1st> <2nd> <3rd> | weekly   [--dry]');
})().catch(e => { console.error(e.message || e); process.exit(1); });
