const fs = require('fs');
const path = require('path');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

const SHEET_HEADERS = ['Name', 'Title', 'Company', 'Location', 'LinkedIn URL', 'Score', 'Signal', 'Scraped At'];
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

async function openDoc() {
  if (!process.env.GOOGLE_SHEETS_SPREADSHEET_ID) {
    throw new Error('GOOGLE_SHEETS_SPREADSHEET_ID is not set in .env');
  }

  const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEETS_SPREADSHEET_ID, getAuth());
  await doc.loadInfo();
  return doc;
}

async function getOrCreateSheet(doc) {
  let sheet = doc.sheetsByIndex[0];
  if (!sheet) {
    return doc.addSheet({ headerValues: SHEET_HEADERS });
  }

  try {
    await sheet.loadHeaderRow();
  } catch {
    await sheet.setHeaderRow(SHEET_HEADERS);
  }

  return sheet;
}

async function getExistingProfileUrls() {
  const doc = await openDoc();
  const sheet = doc.sheetsByIndex[0];
  if (!sheet) {
    return new Set();
  }

  try {
    await sheet.loadHeaderRow();
  } catch {
    return new Set();
  }

  const rows = await sheet.getRows();
  return new Set(rows.map((row) => row.get('LinkedIn URL')).filter(Boolean));
}

async function pushLeads(scoredLeads) {
  if (!scoredLeads || scoredLeads.length === 0) {
    return 0;
  }

  const doc = await openDoc();
  const sheet = await getOrCreateSheet(doc);

  const rows = scoredLeads.map((lead) => ({
    Name: lead.name,
    Title: lead.title,
    Company: lead.company,
    Location: lead.location,
    'LinkedIn URL': lead.profileUrl,
    Score: lead.score,
    Signal: lead.signalSummary || '',
    'Scraped At': new Date().toISOString(),
  }));

  await sheet.addRows(rows);
  return rows.length;
}

module.exports = { pushLeads, getExistingProfileUrls };
