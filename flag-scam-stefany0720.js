#!/usr/bin/env node
/**
 * Scans @stefany0720's recent posts/comments every 5 minutes.
 * For any one containing the masked scam link (t.co/8eD7gFzqKd, resolving
 * to claim-hive.blog) that hasn't been handled yet:
 *   - leaves a warning reply from @hive3
 *   - casts a 1% downvote from @hive3
 * Tracks already-handled permlinks in state.json so nothing is repeated.
 *
 * Run with: HIVE3_POSTING_KEY=xxxxx node flag-scam-stefany0720.js
 * Stop with: Ctrl+C, or `pm2 stop flag-scam-stefany0720` if run under pm2.
 */

const { Client, PrivateKey } = require('@hiveio/dhive');
const fs = require('fs');
const path = require('path');

const ACCOUNTS = ['stefany0720'];
const FLAGGER = 'hive3';
const SCAM_MARKERS = ['t.co/8eD7gFzqKd', 'claim-hive.blog'];
const WARNING_BODY =
  '⚠️ Heads up: the link here is masked and goes to claim-hive.blog — a phishing site, not official Hive. Don\'t click. 🐝';
const DOWNVOTE_WEIGHT = -10; // 0.1%
const SLOW_POLL_MS = 3 * 60 * 1000; // used while there's still a backlog to work through
const FAST_POLL_MS = 60 * 1000; // used once the backlog is light
const BACKLOG_THRESHOLD = 3; // switch to FAST_POLL_MS once a scan finds <= this many new matches
const STATE_FILE = path.join(__dirname, 'state.json');
// anyx.io dropped: HTTP 502s destabilized dhive's failover (same issue hit in server/hive-verify.js).
const NODES = [
  'https://api.hive.blog',
  'https://api.deathwing.me',
  'https://api.syncad.com',
  'https://api.openhive.network',
];

const POSTING_KEY = process.env.HIVE3_POSTING_KEY;
if (!POSTING_KEY) {
  console.error('Set HIVE3_POSTING_KEY env var (the @hive3 posting key) before running.');
  process.exit(1);
}
const key = PrivateKey.fromString(POSTING_KEY);
const client = new Client(NODES);

function loadState() {
  try {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    // migrate old array-based state format to the new per-permlink object format
    if (Array.isArray(state.handled)) {
      const migrated = {};
      for (const key_id of state.handled) migrated[key_id] = { commented: true, downvoted: true };
      state.handled = migrated;
    }
    return state;
  } catch {
    return { handled: {} };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function containsScamLink(body) {
  return SCAM_MARKERS.some((marker) => body.includes(marker));
}

const PAGE_SIZE = 20; // bridge.get_account_posts hard-caps limit at 20
const BACKFILL_DEPTH = 1000; // how far back to paginate per sort, per scan

async function fetchSort(account, sort) {
  const results = [];
  let cursor = null;
  while (results.length < BACKFILL_DEPTH) {
    const params = { sort, account, limit: PAGE_SIZE };
    if (cursor) Object.assign(params, cursor);
    let page;
    try {
      page = await client.call('bridge', 'get_account_posts', params);
    } catch (err) {
      // Stop paginating this sort on error (e.g. the cursor post no longer
      // exists), but keep whatever we already collected instead of losing
      // the whole scan.
      console.error(
        `[${new Date().toISOString()}] fetchSort(${account}, ${sort}) page failed, stopping pagination here: ${err.message || JSON.stringify(err)}`
      );
      break;
    }
    if (!page || page.length === 0) break;
    const items = cursor ? page.slice(1) : page; // drop the cursor post itself (already seen)
    results.push(...items);
    if (page.length < PAGE_SIZE) break; // reached the end of the account's history
    const last = page[page.length - 1];
    cursor = { start_author: last.author, start_permlink: last.permlink };
  }
  return results;
}

async function getAccountContent() {
  // bridge.get_account_posts covers both top-level posts and comments
  // depending on `sort`; "comments" catches replies, "posts" catches blog posts.
  // Paginated so older content (beyond the first page) is also caught.
  // Runs across every account in ACCOUNTS.
  const batches = await Promise.all(
    ACCOUNTS.flatMap((account) => [fetchSort(account, 'posts'), fetchSort(account, 'comments')])
  );
  return batches.flat();
}

const COMMENT_SPACING_MS = 3500; // Hive allows only 1 comment per account every 3s

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function flagPost(item, state) {
  const key_id = `${item.author}/${item.permlink}`;
  const record = state.handled[key_id] || { commented: false, downvoted: false };
  console.log(`[${new Date().toISOString()}] Flagging ${key_id}`);

  if (!record.commented) {
    // Deterministic (not time-based) so a retry after a false-failure
    // edits the same comment in place instead of creating a duplicate.
    const replyPermlink = `re-${item.permlink}-flag`.slice(0, 255);
    try {
      await client.broadcast.comment(
        {
          parent_author: item.author,
          parent_permlink: item.permlink,
          author: FLAGGER,
          permlink: replyPermlink,
          title: '',
          body: WARNING_BODY,
          json_metadata: JSON.stringify({ app: 'hive3-scam-flagger/1.0', tags: ['hive'] }),
        },
        key
      );
      console.log(`  -> comment posted (${replyPermlink})`);
      record.commented = true;
    } catch (err) {
      console.error(`  -> comment FAILED: ${err.message}`);
    }
  } else {
    console.log('  -> comment already posted, skipping');
  }

  if (!record.downvoted) {
    try {
      await client.broadcast.vote(
        {
          voter: FLAGGER,
          author: item.author,
          permlink: item.permlink,
          weight: DOWNVOTE_WEIGHT,
        },
        key
      );
      console.log('  -> downvote cast (1%)');
      record.downvoted = true;
    } catch (err) {
      console.error(`  -> downvote FAILED: ${err.message}`);
    }
  } else {
    console.log('  -> already downvoted, skipping');
  }

  state.handled[key_id] = record;
  saveState(state);

  // Respect Hive's per-account comment rate limit before the next item.
  await sleep(COMMENT_SPACING_MS);
}

let scanning = false;

async function scanOnce() {
  if (scanning) {
    console.log(`[${new Date().toISOString()}] previous scan still running, skipping this tick`);
    return;
  }
  scanning = true;
  try {
    const state = loadState();
    let items;
    try {
      items = await getAccountContent();
    } catch (err) {
      console.error(`[${new Date().toISOString()}] fetch failed: ${err.message}`);
      return;
    }

    const matches = items.filter((item) => {
      if (!containsScamLink(item.body || '')) return false;
      const record = state.handled[`${item.author}/${item.permlink}`];
      return !record || !record.commented || !record.downvoted;
    });

    if (matches.length === 0) {
      console.log(`[${new Date().toISOString()}] no new matching posts`);
      return 0;
    }

    console.log(`[${new Date().toISOString()}] ${matches.length} new match(es) to handle`);
    for (const item of matches) {
      await flagPost(item, state);
    }
    return matches.length;
  } finally {
    scanning = false;
  }
}

async function loop() {
  const backlog = await scanOnce();
  const nextDelay = backlog !== undefined && backlog <= BACKLOG_THRESHOLD ? FAST_POLL_MS : SLOW_POLL_MS;
  if (nextDelay === FAST_POLL_MS) {
    console.log(`[${new Date().toISOString()}] backlog is light (${backlog}), switching to ${FAST_POLL_MS / 1000}s polling`);
  }
  setTimeout(loop, nextDelay);
}

console.log(`Starting scam-link flagger for @${ACCOUNTS.join(', @')}. Ctrl+C to stop.`);
loop();
