const { ApifyClient } = require('apify-client');

const DEFAULT_ACTOR_ID = 'apimaestro/linkedin-profile-detail';

function extractUsername(profileUrl) {
  const match = String(profileUrl).match(/linkedin\.com\/in\/([^/?#]+)/i);
  return match ? match[1] : null;
}

function normalizeProfile(item) {
  const info = item.basic_info || {};
  return {
    name: info.fullname || '',
    title: info.headline || '',
    company: info.current_company || '',
    location: (info.location && info.location.full) || '',
    profileUrl: info.profile_url || '',
    connections: Number(info.connection_count || 0),
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

  const profiles = [];
  for (const url of profileUrls) {
    const username = extractUsername(url);
    if (!username) {
      console.error(`Could not extract a LinkedIn username from "${url}", skipping`);
      continue;
    }

    const run = await client.actor(actorId).call({ username, includeEmail: false });
    const { items } = await client.dataset(run.defaultDatasetId).listItems();

    if (run.status !== 'SUCCEEDED' || items.length === 0) {
      console.error(`Apify run for "${username}" returned no data (status: ${run.status})`);
      continue;
    }

    profiles.push(...items.map(normalizeProfile));
  }

  return profiles;
}

module.exports = { scrapeProfiles };
