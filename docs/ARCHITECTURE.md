# BeeTris: architecture and the road to versus play and Hive login

This page explains how the pieces fit, what already exists, and the order to switch things on.
Nothing here involves money: HIVE, HBD, HP and RC in the game stay play points.

## The pieces

| Piece | File | Runs where | Status |
| --- | --- | --- | --- |
| Game | `index.html`, `i18n.js`, `version.js` | Browser, GitHub Pages | Live |
| Game API | `window.HBP` inside `index.html` | Browser | Live, used by nothing yet |
| Hive login | `net/hive-auth.js` | Browser | Built, not loaded by the page |
| Versus client | `net/multiplayer.js` | Browser | Built, not loaded by the page |
| Relay and login verifier | `server/relay.js`, `server/hive-verify.js` | A small Node host | Built and tested, not deployed |

GitHub Pages only serves static files, so anything that must be trusted (who a Hive player is, who won a match)
needs the small server. Everything else stays in the browser.

## Game API (`window.HBP`)

The modules never touch game internals. They use this surface:

- `HBP.on('start' | 'lines' | 'over', fn)`: events with `{seed}`, `{n, sealed, combo, hf}`, `{total, lines, hf, seconds}`.
- `HBP.start({seed, name})`: start a game with a fixed piece sequence (seeded mulberry32 PRNG).
- `HBP.receiveGarbage(n)`: push n garbage rows from an opponent.
- `HBP.snapshot()`: `{seed, lines, hf, total, board}` where `board` is 20 rows of 10 characters.
- `HBP.isPlaying()`, `HBP.version()`.
- `HBP.track(name)`: anonymous event count on the public site. Only `vs-join`, `vs-start`, `vs-win`, `vs-lose`,
  `hive-login`, `hive-login-fail` and `hive-score-post` are accepted; the modules never send names or scores.

## Hive login (`net/hive-auth.js` + `server/hive-verify.js`)

1. The browser asks the server for a one-time challenge (`GET /auth/challenge?user=alice`).
2. Hive Keychain signs it with the account's posting key (`requestSignBuffer`). The site never sees a key.
3. The browser sends the signature to `POST /auth/verify`. The server recovers the public key from the signature
   and checks it against the account's posting keys on chain. A challenge works once and expires in 5 minutes.
4. The server returns a session token. The relay uses it to stamp a verified Hive name on that player.

Without a server, `HBPAuth.login()` still asks Keychain to sign, but the session is `verified: false` and must be
shown like a guest nickname. HiveSigner and HiveAuth (QR login with a phone wallet) come next through the Aioha
library, behind the same `login()` call.

Optional on-chain record: `HBPAuth.postScore(stats)` broadcasts a `custom_json` with id `hive_block_producer`
using posting authority. It costs Resource Credits, not HIVE. The player must confirm first, because chain data is
public and permanent.

## Versus play (`net/multiplayer.js` + `server/relay.js`)

- Players join a room. When everyone is ready, the host picks a seed and every client calls `HBP.start({seed})`,
  so all players get the same pieces.
- Clearing 2, 3 or 4 lines sends 1, 2 or 4 garbage rows; a Consensus Seal clear and a combo of 2 or more add 1 each.
- Each client sends a board snapshot about 4 times per second for the opponent preview (`drawMini`).
- The relay only forwards messages inside a room, caps message size and rate, and is the only party allowed to
  attach a Hive name. Two tabs of one browser can play without any server through `BroadcastChannelTransport`.

Known limits of v1: the relay trusts each client's own report of line clears, so a modified client could cheat.
For casual play that is acceptable. For ranked play, the server would replay each player's inputs with the shared
seed and compute attacks itself; the seeded PRNG is the first step toward that.

## Suggested order

1. **Versus over the relay, guests only.** Deploy `server/` on a small Node host (Fly.io, Render or a VPS), add a
   "Versus" tab that creates or joins a room by short code, and show the opponent's mini board beside yours.
2. **Hive login.** Enable the "Log in with Hive" button with Keychain, show verified names in the lobby with a badge,
   and keep guest play exactly as it is.
3. **Shared leaderboard.** Store finished runs on the server (Cloudflare D1, SQLite or Postgres), with guests and
   Hive players on separate or flagged lists.
4. **Optional chain record.** After a run, a logged-in player may post the score with `postScore()`. The server can
   confirm the transaction on chain before showing it as "on-chain verified".
5. **Ranked play, later.** Server-side replay with the shared seed to make results cheat-resistant.

## Running the server locally

```
cd server
npm install
node test.js      # login and relay checks with a throwaway key
node relay.js     # listens on :8787; set ALLOWED_ORIGIN for your site
```
