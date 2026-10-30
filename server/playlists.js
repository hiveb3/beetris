// Per-player music playlists for verified Hive users: a list of track file names from music/tracks.json.
// Stored in playlists.json next to this file. Small on purpose: max 64 tracks per user, file names only.
const fs = require('fs');
const path = require('path');
const FILE = process.env.PLAYLISTS_FILE || path.join(__dirname, 'playlists.json');
let data = null;
function load() { if (!data) { try { data = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { data = {}; } } return data; }
function getPlaylist(username) { return load()[username] || null; }
function setPlaylist(username, tracks) {
  const clean = (Array.isArray(tracks) ? tracks : []).map(String).filter(f => /^[a-z0-9][a-z0-9._-]{0,80}\.(mp3|ogg|oga|opus|m4a)$/.test(f)).slice(0, 64);
  load()[username] = { tracks: [...new Set(clean)], at: new Date().toISOString() };
  fs.writeFileSync(FILE + '.tmp', JSON.stringify(data)); fs.renameSync(FILE + '.tmp', FILE);
  return data[username];
}
module.exports = { getPlaylist, setPlaylist };
