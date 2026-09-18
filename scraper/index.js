const { ApifyClient } = require('apify-client');

const DEFAULT_ACTOR_ID = 'apimaestro/linkedin-profile-detail';
// UNVERIFIED: found via web search (same publisher as the validated profile
// actor), but its exact input/output schema hasn't been confirmed by a live
// run yet. Override with APIFY_LINKEDIN_SEARCH_ACTOR_ID if it turns out wrong.
const DEFAULT_SEARCH_ACTOR_ID = 'apimaestro/linkedin-posts-search-scraper-no-cookies';
// Confirmed live via the actor's own validation error -- this is the complete,
// exact set it accepts. There is no "past two weeks" option; "past-week" is
// the closest fit to a freshness requirement stricter than a month.
const VALID_DATE_FILTERS = ['', 'past-1h', 'past-24h', 'past-week', 'past-month'];
const DEFAULT_DATE_FILTER = 'past-week';

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

    for (const item of items) {
      const profile = normalizeProfile(item);
      if (!profile.name && !profile.profileUrl) {
        console.error(`Apify run for "${username}" returned an empty profile, skipping`);
        continue;
      }
      profiles.push({ ...profile, requestedUrl: url });
    }
  }

  return profiles;
}

function normalizePost(item) {
  const author = item.author || {};
  const postedAt = item.posted_at || {};
  return {
    postText: item.text || '',
    profileUrl: author.profile_url || '',
    authorName: author.name || '',
    postUrl: item.post_url || '',
    postedAtTimestamp: Number(postedAt.timestamp) || null,
  };
}

function resolveDateFilter() {
  const configured = process.env.LINKEDIN_POST_DATE_FILTER;
  if (configured === undefined || configured === '') return DEFAULT_DATE_FILTER;
  if (!VALID_DATE_FILTERS.includes(configured)) {
    console.error(`Invalid LINKEDIN_POST_DATE_FILTER "${configured}", falling back to "${DEFAULT_DATE_FILTER}". Valid values: ${VALID_DATE_FILTERS.filter(Boolean).join(', ')}`);
    return DEFAULT_DATE_FILTER;
  }
  return configured;
}

async function runSearchActor(query) {
  const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
  const actorId = process.env.APIFY_LINKEDIN_SEARCH_ACTOR_ID || DEFAULT_SEARCH_ACTOR_ID;
  const dateFilter = resolveDateFilter();

  const run = await client.actor(actorId).call({ search_input: query, date_filter: dateFilter });
  const { items } = await client.dataset(run.defaultDatasetId).listItems();

  console.log(`Search actor query "${query}" (date_filter: "${dateFilter}") -> status: ${run.status}, posts found: ${items.length}`);

  if (run.status !== 'SUCCEEDED') {
    console.error(`Search actor run for "${query}" did not succeed (status: ${run.status})`);
    return [];
  }

  return items.map(normalizePost).filter((post) => post.profileUrl);
}

async function searchIntentPosts(keywords) {
  if (!process.env.APIFY_TOKEN) {
    throw new Error('APIFY_TOKEN is not set in .env');
  }
  if (!keywords || keywords.length === 0) {
    return [];
  }

  const results = [];
  for (const keyword of keywords) {
    const posts = await runSearchActor(keyword);
    for (const post of posts) {
      results.push({ ...post, matchedKeyword: keyword });
    }
  }
  return results;
}

async function searchCompanyNews(companies, newsKeywords) {
  if (!process.env.APIFY_TOKEN) {
    throw new Error('APIFY_TOKEN is not set in .env');
  }
  if (!companies || companies.length === 0 || !newsKeywords || newsKeywords.length === 0) {
    return new Map();
  }

  const signalByCompany = new Map();
  for (const company of companies) {
    const query = `${company} ${newsKeywords.join(' OR ')}`;
    const posts = await runSearchActor(query);
    if (posts.length > 0) {
      signalByCompany.set(company, newsKeywords[0]);
    }
  }
  return signalByCompany;
}

module.exports = { scrapeProfiles, searchIntentPosts, searchCompanyNews };
