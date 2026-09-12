// Placeholder stream source. Proxies to Knaben until something else is
// wired in — nothing else in the addon needs to change when that happens.
const axios = require('axios');
const KNABEN_URL = 'https://testflix.mcmik55555.workers.dev';

async function streamsFor(id) {
  try {
    const { data } = await axios.get(`${KNABEN_URL}/stream/series/${id}.json`, { timeout: 15000 });
    return data?.streams || [];
  } catch {
    return [];
  }
}

module.exports = { streamsFor };
