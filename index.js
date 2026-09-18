require('dotenv').config();

const { scrapeProfiles } = require('./scraper');
const { scoreProfiles } = require('./scoring');
const { pushLeads } = require('./sheets');

async function main() {
  const profileUrls = (process.env.LINKEDIN_PROFILE_URLS || '')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean);

  if (profileUrls.length === 0) {
    console.log('No LinkedIn profile URLs configured. Set LINKEDIN_PROFILE_URLS in .env (comma-separated).');
    return;
  }

  console.log(`Scraping ${profileUrls.length} LinkedIn profile(s)...`);
  const profiles = await scrapeProfiles(profileUrls);

  console.log('Scoring profiles...');
  const scoredLeads = scoreProfiles(profiles);

  console.log('Writing scored leads to Google Sheet...');
  const rowCount = await pushLeads(scoredLeads);

  console.log(`Done. Wrote ${rowCount} row(s) to the sheet.`);
}

main().catch((err) => {
  console.error('Pipeline failed:', err.message);
  process.exit(1);
});
