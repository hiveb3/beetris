// Regenerates CHANGELOG.md from version.js so the two never drift apart.
// Usage: node scripts/changelog.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'version.js'), 'utf8'), sandbox);
const releases = sandbox.window.HBP_RELEASES;

const lines = [
  '# Changelog',
  '',
  'All notable changes to BeeTris. Newest first.',
  'Versions follow vMAJOR.MINOR.PATCH: new features bump MINOR, bug fixes bump PATCH, and v1.0.0 will mark the end of beta.',
  '',
  '<!-- Generated from version.js by scripts/changelog.js. Edit version.js, not this file. -->',
  '',
];
for (const r of releases) {
  lines.push(`## v${r.version} (${r.date})`, '');
  for (const n of r.notes) lines.push(`- ${n}`);
  lines.push('');
}
fs.writeFileSync(path.join(root, 'CHANGELOG.md'), lines.join('\n'));
console.log(`CHANGELOG.md written with ${releases.length} releases, current v${releases[0].version}`);
