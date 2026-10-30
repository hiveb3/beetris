# Changelog

All notable changes to BeeTris. Newest first.
Versions follow vMAJOR.MINOR.PATCH: new features bump MINOR, bug fixes bump PATCH, and v1.0.0 will mark the end of beta.

<!-- Generated from version.js by scripts/changelog.js. Edit version.js, not this file. -->

## v0.14.0 (2026-10-30)

- My playlist: in Controls, choose which tracks play. Logged in with Hive, your playlist is saved to your account and follows you to any device.
- New to Hive? The home screen now links to a free Ecency signup (ecency.com/signup/free), invited by @hive3.

## v0.13.0 (2026-10-29)

- Classical soundtrack: famous public-domain pieces (Liszt, Rimsky-Korsakov, Grieg, Beethoven, Vivaldi and more) play shuffled during the game, with a credit for each track.
- Press T for the next track. If the music can't load, the original 8-bit loop plays instead.

## v0.12.1 (2026-10-29)

- Global leaderboard: tap a player to congratulate them with a ready-made Wave on Ecency.

## v0.12.0 (2026-10-29)

- Gentler soft drop: holding down starts slow and speeds up with each hardfork, instead of racing from the first piece.
- Chain events are calmer: they come less often and show as a small notice at the top of the board instead of a big banner in the middle.
- The Rules page now explains what each chain event does (whale upvote, downvote, airdrop, missed block, swarm, spam), in all 8 languages.
- Home screen note updated: Hive login and on-chain records are live.

## v0.11.1 (2026-10-26)

- Rotation kicks now also try moving the piece down a row, fixing cases where a rotate felt completely dead once the stack got tall and cluttered at high speed.
- When a rotation truly has no room (every kick position is blocked), you now hear a clear error sound instead of silence, so it reads as "blocked" rather than "broken".

## v0.11.0 (2026-10-20)

- Phone controls redesigned as one symmetric deck: two thumb clusters of the same size, set in from the edges.
- Left thumb: a wide hard-drop bar above two big Left and Right keys. Right thumb: a big clockwise rotate, with counter-clockwise above and soft drop below on the inner side.
- Spare screen height now goes to bigger keys instead of an empty band under the board.

## v0.10.0 (2026-10-20)

- Phone controls rearranged: the left thumb moves and drops (Left and Right side by side, the hard drop centered above them with a clear gap), the right thumb rotates (big clockwise, small counter-clockwise at its upper left, a slim soft drop below).
- Every phone button now has a touch area of at least 44 by 44 pixels.
- Visit counts now group game overs by lines cleared and are ready for versus and Hive login events.

## v0.9.0 (2026-10-20)

- Consensus Seal reworked: when it lands it is used up and clears the top three rows of your stack, wherever you put it.
- Stronger flag bomb: it blasts the 3×3 area where it lands and clears those three columns all the way to the top.
- Records now show the game version of each run.

## v0.8.0 (2026-10-20)

- Phone controls rebuilt for the thumbs: a big clockwise rotate in the middle of a left-hand cross (move beside it, soft drop below, small counter-clockwise above), and only the hard drop on the right.
- Clearer specials: the flag bomb now clears its whole column, the Consensus Seal shows x/10 counters on every row it would touch, each special explains itself the first time, and the bee button lights up when you can afford one.
- On-screen goals (lines to the next hardfork, your best), no accidental restart right after a game over, a turn-your-phone notice, and groundwork for versus play and Hive login.

## v0.7.0 (2026-10-14)

- Phone controls regrouped by hand: rotate and move on the left, soft and hard drop on the right.
- Everything fits one screen: the home page switches between Play, Rules, Controls, Records and Version tabs, and long lists swipe sideways instead of scrolling.

## v0.6.0 (2026-10-13)

- New rare piece: the Consensus Seal, an H-shaped block from HF26 that fills and clears rows that are at least 70% full.
- Original 8-bit background music that speeds up with each hardfork, with its own on/off switch (N key) separate from sound effects (M key).
- Version number and this changelog in the home page footer.

## v0.5.0 (2026-10-10)

- Moved to its own repository and a new address: d-bot-2026.github.io/hive-block-producer.
- Search engine verification and updated share links for the new address.

## v0.4.0 (2026-10-09)

- Public launch: search engines may index the site, with share previews for LINE, Threads and Hive.
- New-player warm-up (slower pieces until the first clear) and a 10-second controls hint.
- Unofficial fan project notice.

## v0.3.0 (2026-10-08)

- Renamed to Hive Block Producer, with a home page, guest nickname and top-10 records on this device.
- Eight languages, English by default, and a notice that in-game HIVE, HBD and RC have no real value.
- Cookie-free visit counting with GoatCounter.

## v0.2.0 (2026-10-07)

- Phone controls split into a square move pad and round rotate keys to avoid mis-taps.
- Chinese and English interface.

## v0.1.0 (2026-10-07)

- First playable build: a Hive-themed block puzzle with HIVE and HBD tokens, Resource Credits, worker bees and flag bombs.
- Hardfork eras every 10 lines and random chain events such as whale upvotes, downvotes and airdrops.
