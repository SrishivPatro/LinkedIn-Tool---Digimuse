const fs = require('fs');
const path = require('path');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const SHEET_HEADERS = ['Name', 'Title', 'Company', 'Location', 'LinkedIn URL', 'Score', 'Scraped At'];
const SERVICE_ACCOUNT_KEY_PATH = path.join(__dirname, '..', 'credentials', 'google-service-account.json');
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function getAuth() {
  if (fs.existsSync(SERVICE_ACCOUNT_KEY_PATH)) {
    const key = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_KEY_PATH, 'utf8'));
    return new JWT({
      email: key.client_email,
      key: key.private_key,
      scopes: SCOPES,
    });
  }

  return new JWT({
    email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
    key: (process.env.GOOGLE_SHEETS_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    scopes: SCOPES,
  });
}

async function pushLeads(scoredLeads) {
  if (!process.env.GOOGLE_SHEETS_SPREADSHEET_ID) {
    throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not set in .env');
  }
  if (!scoredLeads || scoredLeads.length === 0) {
    return 0;
  }

  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_SPREADSHEET_ID, getAuth());
  await doc.loadInfo();

  let sheet = doc.sheetsByIndex[0];
  if (!sheet) {
    sheet = await doc.addSheet({ headerValues: SHEET_HEADERS });
  } else if (sheet.headerValues.length === 0) {
    await sheet.setHeaderRow(SHEET_HEADERS);
  }

  const rows = scoredLeads.map((lead) => ({
    Name: lead.name,
    Title: lead.title,
    Company: lead.company,
    Location: lead.location,
    'LinkedIn URL': lead.profileUrl,
    Score: lead.score,
    'Scraped At': new Date().toISOString(),
  }));

  await sheet.addRows(rows);
  return rows.length;
}

module.exports = { pushLeads };
