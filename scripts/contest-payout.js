#!/usr/bin/env node
/* BeeTris Soundtrack Contest payouts from @beetris.contest.
 *
 *   node scripts/contest-payout.js start 1st 2nd 3rd
 *     1. sends the liquid HBD 60/25/15 to the winners
 *     2. sets power-down routes straight to the winners (60/25/15, paid out as liquid HIVE)
 *     3. starts the power down of all HP: each of the 13 weekly instalments lands in the
 *        winners' wallets automatically, no further action or cron needed
 *   add --dry to only print what it would do.
 *
 * Needs BEETRIS_CONTEST_ACTIVE_KEY in the environment (never hard-code it) and @hiveio/dhive
 * (already a dependency of server/).
 */
const path = require('path');
const { Client, PrivateKey } = require(require.resolve('@hiveio/dhive', { paths: [path.join(__dirname, '..', 'server'), __dirname] }));

const ACCOUNT = 'beetris.contest';
const SPLIT = [0.60, 0.25, 0.15];
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
const send = async (ops, label) => {
  ops.forEach(([type, o]) => console.log(`${dry ? '[dry] ' : ''}${label}: ${type} ${JSON.stringify(o)}`));
  if (!dry && ops.length) await client.broadcast.sendOperations(ops, key());
};

async function start(winners) {
  if (winners.length !== 3) throw new Error('give exactly 3 winners: 1st 2nd 3rd');
  const [a] = await client.database.getAccounts([ACCOUNT]);
  if (!a) throw new Error('account not found');

  const hbd = amt(a.hbd_balance);
  console.log(`HBD available: ${hbd}`);
  if (hbd >= 0.003) await send(winners.map((to, i) => ['transfer', { from: ACCOUNT, to, amount: fmt(hbd * SPLIT[i], 'HBD'), memo: 'BeeTris Soundtrack Contest prize (HBD) 🐝🏆' }]), 'HBD prize');

  // percent is in basis points (10000 = 100%); auto_vest false = the winner receives liquid HIVE
  await send(winners.map((to, i) => ['set_withdraw_vesting_route', { from_account: ACCOUNT, to_account: to, percent: Math.round(SPLIT[i] * 10000), auto_vest: false }]), 'power-down route');

  const vests = amt(a.vesting_shares) - amt(a.delegated_vesting_shares);
  if (vests > 0) await send([['withdraw_vesting', { account: ACCOUNT, vesting_shares: `${vests.toFixed(6)} VESTS` }]], 'power down (13 weekly instalments)');
  console.log('Done. Check the routes on https://hivehub.dev/@' + ACCOUNT);
}

(async () => {
  const [cmd, ...rest] = args;
  if (cmd === 'start') await start(rest.map(u => u.replace(/^@/, '').toLowerCase()));
  else console.log('usage: contest-payout.js start <1st> <2nd> <3rd>   [--dry]');
})().catch(e => { console.error(e.message || e); process.exit(1); });
