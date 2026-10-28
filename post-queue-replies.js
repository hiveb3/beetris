#!/usr/bin/env node
/**
 * Posts the remaining drafted replies from final_queue.json (starting at
 * START_INDEX, after the ones already posted manually) as @hive3 comments.
 * Respects Hive's per-account comment rate limit (3s) and tracks state so
 * reruns don't double-post.
 *
 * Run with:
 *   HIVE3_POSTING_KEY=xxxx node post-queue-replies.js final_queue.json 15
 * or via the VPS wrapper:
 *   pm2 start run-with-key.sh --name post-queue -- post-queue-replies.js final_queue.json 15
 */

const { Client, PrivateKey } = require('@hiveio/dhive');
const fs = require('fs');
const path = require('path');

const FLAGGER = 'hive3';
const COMMENT_SPACING_MS = 5 * 60 * 1000; // 5 minutes between posts
const STATE_FILE = path.join(__dirname, 'post-queue-state.json');
// anyx.io dropped: HTTP 502s destabilized dhive's failover (same issue hit in server/hive-verify.js).
const NODES = ['https://api.hive.blog', 'https://api.deathwing.me', 'https://api.syncad.com', 'https://api.openhive.network'];

const inputFile = process.argv[2];
const startIndex = Number(process.argv[3] || 0);
if (!inputFile) {
  console.error('Usage: HIVE3_POSTING_KEY=xxx node post-queue-replies.js final_queue.json [startIndex]');
  process.exit(1);
}
const POSTING_KEY = process.env.HIVE3_POSTING_KEY;
if (!POSTING_KEY) {
  console.error('Set HIVE3_POSTING_KEY (directly, or run via run-with-key.sh).');
  process.exit(1);
}

const items = JSON.parse(fs.readFileSync(inputFile, 'utf8')).slice(startIndex);
console.log(`Loaded ${items.length} item(s) starting at index ${startIndex}.`);

const key = PrivateKey.fromString(POSTING_KEY);
const client = new Client(NODES);

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return { posted: {} }; }
}
function saveState(state) { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function postOne(item, state) {
  const key_id = `${item.author}/${item.permlink}`;
  if (state.posted[key_id]) {
    console.log(`[skip] already posted on ${item.author}/${item.permlink}`);
    return;
  }
  const replyPermlink = `re-${item.permlink}-${Date.now()}`.slice(0, 255);
  console.log(`[${new Date().toISOString()}] Replying to ${key_id}`);
  try {
    await client.broadcast.comment({
      parent_author: item.author,
      parent_permlink: item.permlink,
      author: FLAGGER,
      permlink: replyPermlink,
      title: '',
      body: item.reply,
      json_metadata: JSON.stringify({ app: 'hive3-queue-poster/1.0', tags: ['hive'] }),
    }, key);
    console.log(`  -> posted (${replyPermlink})`);
    state.posted[key_id] = true;
    saveState(state);
  } catch (err) {
    console.error(`  -> FAILED: ${err.message}`);
  }
  await sleep(COMMENT_SPACING_MS);
}

(async () => {
  const state = loadState();
  for (const item of items) await postOne(item, state);
  console.log('Done.');
})();
