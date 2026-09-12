// Loads each series' episode array and turns it into Stremio meta objects.

const path = require('node:path');
const { series, imdbIdFor } = require('./series');

function inBroadcastOrder(episodes) {
  return [...episodes].sort((a, b) => {
    const dateA = Date.parse(a.released);
    const dateB = Date.parse(b.released);
    const validA = !Number.isNaN(dateA);
    const validB = !Number.isNaN(dateB);
    if (!validA || !validB) {
      if (validA !== validB) return validA ? -1 : 1;
    } else if (dateA !== dateB) {
      return dateA - dateB;
    }
    if (a.season !== b.season) return a.season - b.season;
    return a.episode - b.episode;
  });
}

const cache = new Map();

function episodesFor(entry) {
  if (!cache.has(entry.key)) {
    const loaded = require(path.join('..', 'data', entry.data));
    cache.set(entry.key, inBroadcastOrder(loaded));
  }
  return cache.get(entry.key);
}

function videoId(entry, episode) {
  return `${entry.stremioId}:${episode.season}:${episode.episode}`;
}

function imdbVideoId(episode) {
  const m = episode.imdb;
  return m?.id && m.season != null && m.episode != null ? `${m.id}:${m.season}:${m.episode}` : null;
}

/** The id this entry answers meta requests under — IMDb where series.js has
 *  one mapped, our own id only for the Complete Chronology (no single title). */
function metaId(entry) {
  return imdbIdFor(entry) || entry.stremioId;
}

const BUCKET = 'https://cdn.nubblyn.com/file/whoniverse/';
function thumbnailFor(entry, episode) {
  return episode.thumbnail?.startsWith(BUCKET) ? episode.thumbnail : undefined;
}

function isPlayable(entry) {
  return episodesFor(entry).some(hasStream);
}

function typeOf(entry) {
  return entry.type || 'series';
}

function summaryFor(entry) {
  return isPlayable(entry) ? entry.description : `${entry.description}\n\nComing soon.`;
}

function toCatalogMeta(entry) {
  return {
    id: metaId(entry),
    type: typeOf(entry),
    name: entry.name,
    poster: entry.poster,
    posterShape: 'poster',
    background: entry.background,
    logo: entry.logo,
    description: summaryFor(entry),
    genres: entry.genres,
    releaseInfo: entry.releaseInfo,
  };
}

function toSeriesMeta(entry) {
  const meta = {
    id: metaId(entry),
    type: typeOf(entry),
    name: entry.name,
    poster: entry.poster,
    posterShape: 'poster',
    background: entry.background,
    logo: entry.logo,
    description: summaryFor(entry),
    releaseInfo: entry.releaseInfo,
    genres: entry.genres,
  };
  if (typeOf(entry) === 'movie') return meta;
  if (!episodesFor(entry).some(hasStream)) return meta;

  meta.videos = episodesFor(entry).map((episode) => ({
    id: imdbVideoId(episode) || videoId(entry, episode),
    title: episode.title,
    season: episode.season,
    episode: episode.episode,
    number: episode.episode,
    released: episode.released,
    firstAired: episode.released,
    overview: episode.overview,
    description: episode.overview,
    thumbnail: thumbnailFor(entry, episode),
    available: hasStream(episode),
  }));
  return meta;
}

function hasStream(episode) {
  return Boolean(episode.url || episode.streamUrl);
}

let videoIndex = null;

function findByVideoId(id) {
  if (!videoIndex) {
    videoIndex = new Map();
    for (const entry of populatedSeries()) {
      for (const episode of episodesFor(entry)) {
        videoIndex.set(videoId(entry, episode), { entry, episode });
        videoIndex.set(imdbVideoId(episode) || videoId(entry, episode), { entry, episode });
      }
    }
  }
  return videoIndex.get(id) || null;
}

function populatedSeries() {
  return series.filter((entry) => episodesFor(entry).length > 0);
}

function playableSeries() {
  return series.filter((entry) => episodesFor(entry).some(hasStream));
}

module.exports = {
  episodesFor,
  populatedSeries,
  isPlayable,
  typeOf,
  playableSeries,
  toCatalogMeta,
  toSeriesMeta,
  findByVideoId,
  hasStream,
  videoId,
  inBroadcastOrder,
  metaId,
};
