const { addonBuilder } = require('stremio-addon-sdk');

const {
  populatedSeries,
  playableSeries,
  typeOf,
  toCatalogMeta,
  toSeriesMeta,
  findByVideoId,
  metaId,
} = require('./catalog');
const { streamsFor } = require('./streams');
const { subtitlesFor } = require('./subtitles');

const { ADDON_LOGO, ADDON } = require('./series');
const CATALOG_ID = 'whoniverse_catalog';

function andList(names) {
  if (names.length < 2) return names[0] || '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function statusSentence() {
  const chronology = 'complete-chronology';
  const playing = playableSeries().filter((s) => s.key !== chronology).map((s) => s.name);
  const soon = populatedSeries()
    .filter((s) => s.key !== chronology && !playing.includes(s.name))
    .map((s) => s.name);
  const parts = [];
  if (playing.length) parts.push(`${andList(playing)} play now.`);
  if (soon.length) parts.push(`${andList(soon)} ${soon.length > 1 ? 'are' : 'is'} catalogued and on the way.`);
  if (populatedSeries().some((s) => s.key === chronology)) {
    parts.push('The Complete Chronology runs all of it as one list.');
  }
  return parts.join(' ');
}

const manifest = {
  id: ADDON.id,
  version: '2.1.1',
  name: ADDON.name,
  description: ADDON.description.replace('{status}', statusSentence()),
  logo: ADDON_LOGO,
  types: ['series'],
  // 'tt' answers for every series mapped to a real IMDb title, so a tt-based
  // stream addon (Knaben, for now) can serve them. 'whoniverse_' stays for
  // the Complete Chronology (no single title of its own) and as a fallback
  // for episodes not yet IMDb-mapped.
  resources: [
    'catalog',
    { name: 'meta', types: ['series'], idPrefixes: ['tt', 'whoniverse_'] },
    { name: 'stream', types: ['series'], idPrefixes: ['tt', 'whoniverse_'] },
    { name: 'subtitles', types: ['series'], idPrefixes: ['tt', 'whoniverse_'] },
  ],
  catalogs: [
    { type: 'series', id: CATALOG_ID, name: 'Whoniverse' },
  ],
  behaviorHints: { configurable: false, adult: false },
};

const builder = new addonBuilder(manifest);

builder.defineCatalogHandler(async (args) => {
  if (args.id !== CATALOG_ID) return { metas: [] };
  return { metas: populatedSeries().filter((s) => typeOf(s) === args.type).map(toCatalogMeta) };
});

builder.defineMetaHandler(async (args) => {
  const entry = populatedSeries().find((s) => metaId(s) === args.id);
  if (!entry || typeOf(entry) !== args.type) return { meta: null };
  return { meta: toSeriesMeta(entry) };
});

function resolve(args) {
  if (!args.id) return null;
  return findByVideoId(args.id);
}

// The id here is already whatever toSeriesMeta emitted for this episode —
// tt-form where mapped, our own form otherwise. streams.js decides what to
// do with it.
builder.defineStreamHandler(async (args) => {
  if (!args.id) return { streams: [] };
  return { streams: await streamsFor(args.id) };
});

builder.defineSubtitlesHandler(async (args) => {
  const found = resolve(args);
  return { subtitles: found ? subtitlesFor(found.episode) : [] };
});

module.exports = { manifest, addonInterface: builder.getInterface() };
