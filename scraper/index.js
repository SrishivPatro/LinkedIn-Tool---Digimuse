const { ApifyClient } = require('apify-client');

const DEFAULT_ACTOR_ID = 'apimaestro/linkedin-profile-detail';

function normalizeProfile(item) {
  return {
    name: item.fullName || item.name || '',
    title: item.headline || item.title || item.jobTitle || '',
    company: item.companyName || item.company || '',
    location: item.location || item.geoLocationName || '',
    profileUrl: item.profileUrl || item.linkedinUrl || item.url || '',
    connections: Number(item.connectionsCount || item.connections || 0),
  };
}

async function scrapeProfiles(profileUrls) {
  if (!process.env.APIFY_TOKEN) {
    throw new Error('APIFY_TOKEN is not set in .env');
  }
  if (!profileUrls || profileUrls.length === 0) {
    throw new Error('scrapeProfiles requires at least one LinkedIn profile URL');
  }

  const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
  const actorId = process.env.APIFY_LINKEDIN_ACTOR_ID || DEFAULT_ACTOR_ID;

  const run = await client.actor(actorId).call({ profileUrls });
  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  console.log(`[debug] Apify run status: ${run.status}, dataset item count: ${items.length}`);
  console.log('[debug] Raw Apify dataset items:', JSON.stringify(items, null, 2));

  return items.map(normalizeProfile);
}

module.exports = { scrapeProfiles };
