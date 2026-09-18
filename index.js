require('dotenv').config();

const { scrapeProfiles, searchIntentPosts, searchCompanyNews } = require('./scraper');
const { scoreProfiles } = require('./scoring');
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

async function main() {
  const staticUrls = parseList('LINKEDIN_PROFILE_URLS');
  const intentKeywords = parseList('LINKEDIN_INTENT_KEYWORDS');
  const companyNewsKeywords = parseList('LINKEDIN_COMPANY_NEWS_KEYWORDS', DEFAULT_COMPANY_NEWS_KEYWORDS);

  const signalByUrl = new Map();
  const discoveredUrls = [];

  if (intentKeywords.length > 0) {
    console.log(`Searching LinkedIn posts for ${intentKeywords.length} intent keyword(s)...`);
    const posts = await searchIntentPosts(intentKeywords);
    for (const post of posts) {
      discoveredUrls.push(post.profileUrl);
      signalByUrl.set(post.profileUrl, {
        hasIntentSignal: true,
        matchedKeyword: post.matchedKeyword,
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
  const profiles = await scrapeProfiles(newUrls);

  console.log('Checking for company-level news signals...');
  const companies = Array.from(new Set(profiles.map((p) => p.company).filter(Boolean)));
  const companyNewsByCompany = await searchCompanyNews(companies, companyNewsKeywords);

  const profilesWithSignals = profiles.map((profile) => {
    const intentSignal = signalByUrl.get(profile.profileUrl) || {};
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

  console.log('Writing scored leads to Google Sheet...');
  const rowCount = await pushLeads(scoredLeads);

  console.log(`Done. Wrote ${rowCount} row(s) to the sheet.`);
}

main().catch((err) => {
  console.error('Pipeline failed:', err.message);
  process.exit(1);
});
