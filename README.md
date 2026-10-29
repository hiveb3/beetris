# BeeTris

A free browser block puzzle game with a Hive blockchain theme. Stack transactions, survive hardforks, dodge downvotes.

**Play:** https://hiveb3.github.io/beetris/

- No login, no install, works on desktop and mobile, 8 languages.
- All HIVE, HBD, HP and RC in the game are game points only. They are not real cryptocurrency, have no value and cannot be withdrawn. The game does not connect to any wallet or blockchain.
- Unofficial fan project, not affiliated with Hive.

Feedback and bug reports: [Issues](https://github.com/hiveb3/beetris/issues).

## Versions

The current version and release notes live in `version.js` (shown in the game footer). After adding a release there, run `node scripts/changelog.js` to regenerate [CHANGELOG.md](CHANGELOG.md).

## Versus play and Hive login (in progress)

`net/` holds the browser modules and `server/` a small reference server. They are built and tested but not switched on yet. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how they fit and the planned order.
