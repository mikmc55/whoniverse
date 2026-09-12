// Populate Classic Who's episode list by joining the ledger to an IMDb
// episode-list CSV export (Position, Const, Title, Release Date, ...).
//
// Cinemeta only covers about a third of Classic Who — its season/episode
// numbering for the older serials is too patchy to key off. An IMDb "export
// list to CSV" of the show's own episode page has one row per broadcast
// episode with its own tt id and air date, which is what this joins against.
//
// The join is by (serial title, part number), not by row position: IMDb's
// own list has a few rows out of broadcast order (The Face of Evil's Part
// Two and Three are swapped on the page itself), so position drifts but the
// title never does.
//
//   node scripts/fetch-classic-metadata.js path/to/classic.csv
//   node scripts/fetch-classic-metadata.js path/to/classic.csv --write

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WRITE = process.argv.includes('--write');
const csvPath = process.argv.slice(2).find((a) => !a.startsWith('--'));

if (!csvPath) {
  console.error('usage: node scripts/fetch-classic-metadata.js <csv-file> [--write]');
  process.exit(1);
}

function tsv(file) {
  const rows = fs.readFileSync(file, 'utf8').replace(/\r/g, '').trim().split('\n');
  const head = rows[0].split('\t');
  return rows.slice(1).map((r) => {
    const c = r.split('\t');
    return Object.fromEntries(head.map((h, i) => [h, c[i] ?? '']));
  });
}

// Minimal CSV reader: handles quoted fields with embedded commas, which the
// Genres column always has ("Adventure, Drama, ..."). Good enough for an
// IMDb list export; not a general CSV parser.
function csv(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/\r/g, '');
  const lines = text.trim().split('\n');
  function splitLine(line) {
    const out = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else cur += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }
  const head = splitLine(lines[0]);
  return lines.slice(1).map((l) => Object.fromEntries(head.map((h, i) => [h, splitLine(l)[i] ?? ''])));
}

const WORD2NUM = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
};

function clean(s) {
  return s
    .replace(/æ/g, 'ae').replace(/Æ/g, 'Ae')
    .replace(/œ/g, 'oe').replace(/Œ/g, 'Oe')
    .replace(/[’‘]/g, "'").replace(/[–—]/g, '-')
    .replace(/&/g, 'and')
    .trim().toLowerCase();
}

// IMDb's own numbering quirks that don't reduce to a simple rule.
//   - "Invasion of the Dinosaurs" part 1 aired (and is listed) under the
//     bare title "Invasion", to hide the reveal.
const TITLE_ALIASES = new Map([
  ['invasion of the dinosaurs|1', 'invasion|1'],
]);

// Season 23, "The Trial of a Time Lord", is one 14-part IMDb entry
// ("The Trial of a Time Lord: Part One".."Part Fourteen") but the ledger
// keeps its four constituent stories as separate titles. Map ledger
// (title, local part) to the continuous Trial part number.
const TRIAL_SUBSERIALS = [
  ['the mysterious planet', 4],
  ['mindwarp', 4],
  ['terror of the vervoids', 4],
  ['the ultimate foe', 2],
];
const trialAlias = new Map();
{
  let offset = 0;
  for (const [base, count] of TRIAL_SUBSERIALS) {
    for (let n = 1; n <= count; n++) trialAlias.set(`${base}|${n}`, `the trial of a time lord|${offset + n}`);
    offset += count;
  }
}

function ledgerKey(title) {
  const m = title.match(/^(.*) \((\d+)\)$/);
  if (!m) return clean(title) + '|';
  const base = clean(m[1]);
  const num = Number(m[2]);
  const raw = `${base}|${num}`;
  return TITLE_ALIASES.get(raw) || trialAlias.get(raw) || raw;
}

function csvKey(rawTitle) {
  const title = rawTitle.startsWith('Doctor Who: ') ? rawTitle.slice('Doctor Who: '.length) : rawTitle;
  const m = title.match(/^(.*): (?:Part|Episode) (\w+)$/);
  if (!m) return clean(title) + '|';
  const base = clean(m[1]);
  const word = m[2].toLowerCase();
  const num = WORD2NUM[word] ?? (/^\d+$/.test(m[2]) ? Number(m[2]) : null);
  return num == null ? clean(title) + '|' : `${base}|${num}`;
}

const ledgerRows = tsv(path.join(ROOT, 'ledger', 'series', '01-classic-who.tsv'));
const csvRows = csv(csvPath);

const byKey = new Map();
for (const row of csvRows) byKey.set(csvKey(row.Title), row);

const dataFile = path.join(ROOT, 'data', 'classic-who.js');
let existing = [];
try { existing = require(dataFile); } catch { /* nothing yet */ }
const curated = existing.filter((e) => e.url || e.streamUrl).length;
if (curated) {
  console.error(`refused — ${curated} curated entries in data/classic-who.js have a url; this would overwrite them`);
  process.exit(1);
}

function isoDate(d) {
  return d ? `${d}T00:00:00.000Z` : undefined;
}

const out = [];
const unmatched = [];
let seasonCounter = {};
for (const row of ledgerRows) {
  const season = Number(row.season);
  seasonCounter[season] = (seasonCounter[season] || 0) + 1;
  const episode = seasonCounter[season];

  const key = ledgerKey(row.title);
  const src = byKey.get(key);
  const e = { title: row.title, season, episode, type: row.category };
  if (src) {
    e.released = isoDate(src['Release Date']);
    e.imdb = { id: src.Const, season, episode };
  } else {
    unmatched.push(`${row.category.padEnd(20)} S${season} E${episode}  ${row.title}`);
  }
  out.push(e);
}

console.log(`${out.length} rows, ${out.length - unmatched.length} matched to an IMDb id, ${unmatched.length} unmatched`);
if (unmatched.length) {
  console.log('\nunmatched (left with title only, add by hand or extend the CSV):');
  for (const u of unmatched) console.log('   ' + u);
}

if (!WRITE) {
  console.log('\ndry run. add --write.');
  process.exit(0);
}

const KEYS = ['title', 'season', 'episode', 'type', 'released', 'overview', 'thumbnail', 'imdb'];
function render(e) {
  const lines = [];
  for (const k of KEYS) {
    if (e[k] === undefined) continue;
    if (k === 'imdb') {
      lines.push(`  imdb: { id: ${JSON.stringify(e.imdb.id)}, season: ${e.imdb.season}, episode: ${e.imdb.episode} },`);
    } else {
      lines.push(`  ${k}: ${typeof e[k] === 'number' ? e[k] : JSON.stringify(e[k])},`);
    }
  }
  return '{\n' + lines.join('\n') + '\n}';
}

const header = `// Classic Who — catalogued, not yet playable.
//
// Joined from ledger/series/01-classic-who.tsv and an IMDb episode-list CSV
// export by scripts/fetch-classic-metadata.js. No entry has a \`url\`, so the
// addon does not offer these as streams and the landing page lists the series
// as queued. Adding files means adding urls here, not refetching.
//
// A few dozen items (minisodes, Shada, K9 & Company, two Resurrection of the
// Daleks parts) are not on the IMDb episode list this was built from and are
// listed with a title only.
//
// Rebuild with: node scripts/fetch-classic-metadata.js <csv> --write

const episodes = [
${out.map(render).join(',\n')}
];

module.exports = episodes;
`;

fs.writeFileSync(dataFile, header, 'utf8');
console.log('\nwrote data/classic-who.js');
