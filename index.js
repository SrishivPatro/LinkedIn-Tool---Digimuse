require('dotenv').config();

const { scrapeProfiles, searchIntentPosts, searchCompanyNews } = require('./scraper');
const { scoreProfiles } = require('./scoring');
const { generateConnectionMessages } = require('./enrichment');
const { pushLeads, getExistingProfileUrls } = require('./sheets');

const DEFAULT_COMPANY_NEWS_KEYWORDS = ['funding', 'series funding', 'hiring surge', "we're hiring"];
const DEFAULT_MAX_NEW_PROFILES_PER_RUN = 10;

function parseList(envVar, fallback = []) {
  const raw = process.env[envVar];
  if (!raw) return fallback;
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function normalizeProfileKey(url) {
  const match = String(url).match(/linkedin\.com\/in\/([^/?#]+)/i);
  return (match ? match[1] : String(url)).toLowerCase();
}

function isIndianLocation(location) {
  return /india/i.test(location || '');
}

async function main() {
  const staticUrls = parseList('LINKEDIN_PROFILE_URLS');
  const intentKeywords = parseList('LINKEDIN_INTENT_KEYWORDS');
  const companyNewsKeywords = parseList('LINKEDIN_COMPANY_NEWS_KEYWORDS', DEFAULT_COMPANY_NEWS_KEYWORDS);

  const signalByKey = new Map();
  const discoveredKeys = new Set();
  const discoveredUrls = [];

  if (intentKeywords.length > 0) {
    console.log(`Searching LinkedIn posts for ${intentKeywords.length} intent keyword(s)...`);
    const posts = await searchIntentPosts(intentKeywords);
    for (const post of posts) {
      const key = normalizeProfileKey(post.profileUrl);
      discoveredUrls.push(post.profileUrl);
      discoveredKeys.add(key);
      signalByKey.set(key, {
        hasIntentSignal: true,
        matchedKeyword: post.matchedKeyword,
        postText: post.postText,
        postUrl: post.postUrl,
        postedAtTimestamp: post.postedAtTimestamp,
      });
    }
    console.log(`Found ${discoveredUrls.length} candidate profile(s) from post search.`);
  }

  const candidateUrls = Array.from(new Set([...staticUrls, ...discoveredUrls]));

  if (candidateUrls.length === 0) {
    console.log('No LinkedIn profile URLs configured or discovered. Set LINKEDIN_PROFILE_URLS and/or LINKEDIN_INTENT_KEYWORDS in .env.');
    return;
  }

  console.log('Checking Google Sheet for already-processed profiles...');
  const existingUrls = await getExistingProfileUrls();
  const existingKeys = new Set(Array.from(existingUrls).map(normalizeProfileKey));

  const unseenUrls = candidateUrls.filter((url) => !existingKeys.has(normalizeProfileKey(url)));
  const skipped = candidateUrls.length - unseenUrls.length;
  if (skipped > 0) {
    console.log(`Skipping ${skipped} profile(s) already in the sheet.`);
  }

  if (unseenUrls.length === 0) {
    console.log('No new profiles to process.');
    return;
  }

  const maxNewProfiles = Number(process.env.MAX_NEW_PROFILES_PER_RUN) || DEFAULT_MAX_NEW_PROFILES_PER_RUN;
  const newUrls = unseenUrls.slice(0, maxNewProfiles);
  if (unseenUrls.length > newUrls.length) {
    console.log(`Capping this run to ${newUrls.length} of ${unseenUrls.length} new profile(s) (MAX_NEW_PROFILES_PER_RUN=${maxNewProfiles}). The rest will be picked up on a future run.`);
  }

  console.log(`Scraping ${newUrls.length} LinkedIn profile(s)...`);
  const scrapedProfiles = await scrapeProfiles(newUrls);

  // India-only guardrail applies to search-discovered candidates; a manually
  // configured LINKEDIN_PROFILE_URLS entry is an explicit ask and bypasses it.
  // Keyed off requestedUrl (what we asked scrapeProfiles for), never off the
  // actor's own returned profileUrl, which comes back empty on a failed scrape.
  const profiles = scrapedProfiles.filter((profile) => {
    const isDiscovered = discoveredKeys.has(normalizeProfileKey(profile.requestedUrl));
    if (isDiscovered && !isIndianLocation(profile.location)) {
      return false;
    }
    return true;
  });
  const discardedForLocation = scrapedProfiles.length - profiles.length;
  if (discardedForLocation > 0) {
    console.log(`Discarding ${discardedForLocation} discovered profile(s) outside India.`);
  }

  if (profiles.length === 0) {
    console.log(scrapedProfiles.length === 0
      ? 'No profiles were successfully scraped this run.'
      : 'No profiles remaining after location filtering.');
    return;
  }

  console.log('Checking for company-level news signals...');
  const companies = Array.from(new Set(profiles.map((p) => p.company).filter(Boolean)));
  const companyNewsByCompany = await searchCompanyNews(companies, companyNewsKeywords);

  const profilesWithSignals = profiles.map((profile) => {
    const intentSignal = signalByKey.get(normalizeProfileKey(profile.requestedUrl)) || {};
    const matchedCompanyNewsKeyword = companyNewsByCompany.get(profile.company);
    return {
      ...profile,
      ...intentSignal,
      hasCompanyNewsSignal: Boolean(matchedCompanyNewsKeyword),
      matchedCompanyNewsKeyword,
    };
  });

  console.log('Scoring profiles...');
  const scoredLeads = scoreProfiles(profilesWithSignals);

  console.log('Generating personalized connection messages...');
  const leadsWithMessages = await generateConnectionMessages(scoredLeads);

  console.log('Writing scored leads to Google Sheet...');
  const rowCount = await pushLeads(leadsWithMessages);

  console.log(`Done. Wrote ${rowCount} row(s) to the sheet.`);
}

main().catch((err) => {
  console.error('Pipeline failed:', err.message);
  process.exit(1);
});
