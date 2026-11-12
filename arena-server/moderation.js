// Word filter for gift notes. A text is blocked if it contains a listed word or phrase
// (moderation/en-blocklist.txt). Text is normalized first, so case, accents and common
// leetspeak do not get past it. Matching is by whole word or phrase, so "class" is not
// flagged for "ass".
const fs = require('fs');
const path = require('path');

const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' };

function normalize(text) {
  return String(text == null ? '' : text)
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[013457@$!]/g, (c) => LEET[c])
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

const phrases = fs.readFileSync(path.join(__dirname, 'moderation', 'en-blocklist.txt'), 'utf8')
  .split('\n')
  .map(normalize)
  .filter(Boolean);

const singles = new Set(phrases.filter((p) => !p.includes(' ')));

// True if the text contains a listed word or phrase as whole words. Runs of very short
// pieces are also joined back (so "f u c k" and "fu.ck" are caught), and only the
// one-word entries are checked against those joins.
function isBlocked(text) {
  const normal = normalize(text);
  if (normal === '') return false;
  const words = normal.split(' ');
  if (words.some((w) => singles.has(w))) return true;
  const runs = [];
  let run = '';
  for (const w of words) {
    if (w.length <= 2) run += w;
    else { if (run) runs.push(run); run = ''; }
  }
  if (run) runs.push(run);
  if (runs.some((r) => singles.has(r))) return true;
  const padded = ' ' + normal + ' ';
  return phrases.some((p) => padded.includes(' ' + p + ' '));
}

module.exports = { isBlocked, normalize };
