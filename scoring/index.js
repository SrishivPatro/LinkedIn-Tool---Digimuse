const SENIOR_TITLE_KEYWORDS = [
  'ceo', 'cto', 'cfo', 'coo', 'founder', 'co-founder', 'owner',
  'president', 'vp', 'vice president', 'head of', 'director',
];
const MID_TITLE_KEYWORDS = ['manager', 'lead', 'senior'];

const AGENCY_KEYWORDS = [
  'agency', 'agencies', 'freelancer', 'freelance', 'consultant', 'consultancy',
  'outsource', 'outsourcing', 'external help', 'contractor', 'vendor', 'partner agency',
];
const INHOUSE_KEYWORDS = [
  'in-house', 'in house', 'full-time', 'full time', 'join our team',
  'hiring for', 'we are hiring', "we're hiring", 'permanent role', 'internal hire',
];

const URGENCY_KEYWORDS = [
  'asap', 'urgent', 'urgently', 'immediately', 'right away', 'this week',
  'need by', 'deadline', 'time-sensitive', 'time sensitive', 'quick turnaround',
  'today', 'tomorrow',
];

const DIRECT_ASK_KEYWORDS = [
  'dm me', 'message me', 'reach out', 'contact me', 'looking for', 'in search of',
  'need a', 'need an', 'seeking a', 'seeking an', 'who can help', 'any recommendations', 'recommend',
];

function countMatches(text, keywords) {
  const lower = (text || '').toLowerCase();
  return keywords.filter((kw) => lower.includes(kw)).length;
}

// Extractive, keyword-driven heuristics below (no LLM in this pipeline) --
// they measure keyword presence in the post text, not true semantic intent.

function scoreAgencyNeed(postText) {
  if (!postText) return 0;
  const agencyHits = countMatches(postText, AGENCY_KEYWORDS);
  const inhouseHits = countMatches(postText, INHOUSE_KEYWORDS);
  if (agencyHits === 0 && inhouseHits === 0) return 30;
  const score = 40 + agencyHits * 20 - inhouseHits * 25;
  return Math.max(0, Math.min(100, score));
}

function scoreUrgency(postText) {
  if (!postText) return 0;
  const hits = countMatches(postText, URGENCY_KEYWORDS);
  if (hits === 0) return 20;
  return Math.max(0, Math.min(100, 40 + hits * 25));
}

function scorePotential(profile) {
  let score = 0;
  const title = (profile.title || '').toLowerCase();

  if (SENIOR_TITLE_KEYWORDS.some((kw) => title.includes(kw))) {
    score += 45;
  } else if (MID_TITLE_KEYWORDS.some((kw) => title.includes(kw))) {
    score += 25;
  }

  if (profile.company) score += 15;
  if (profile.hasCompanyNewsSignal) score += 15;

  const connections = Number(profile.connections) || 0;
  if (connections >= 500) score += 25;
  else if (connections >= 100) score += 10;

  return Math.max(0, Math.min(100, score));
}

function scoreChances(profile) {
  let score = 0;

  const directHits = countMatches(profile.postText, DIRECT_ASK_KEYWORDS);
  score += Math.min(50, directHits * 20);

  const postedAt = profile.postedAtTimestamp;
  if (postedAt) {
    const ageDays = (Date.now() - postedAt) / (1000 * 60 * 60 * 24);
    if (ageDays <= 1) score += 40;
    else if (ageDays <= 3) score += 30;
    else if (ageDays <= 7) score += 15;
    else score += 5;
  } else {
    score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

function signalLevel(agencyNeed, urgency, potential, chances) {
  const average = (agencyNeed + urgency + potential + chances) / 4;
  if (average >= 65) return 'High';
  if (average >= 40) return 'Medium';
  return 'Low';
}

// Extractive summary: pulls the sentence containing the matched keyword out
// of the post text, rather than generating an AI abstractive summary (no LLM
// is wired into this pipeline). Falls back to the raw keyword if no sentence
// match is found.
function extractNeedSummary(profile) {
  if (!profile.hasIntentSignal) return '';

  const text = profile.postText || '';
  const keyword = (profile.matchedKeyword || '').toLowerCase();
  const sentences = text.split(/(?<=[.!?\n])\s+/).map((s) => s.trim()).filter(Boolean);
  const match = sentences.find((s) => s.toLowerCase().includes(keyword));

  const raw = match || profile.matchedKeyword || '';
  const trimmed = raw.length > 100 ? `${raw.slice(0, 97)}...` : raw;
  return trimmed ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1) : '';
}

function scoreProfile(profile) {
  const agencyNeedScore = scoreAgencyNeed(profile.postText);
  const urgencyScore = scoreUrgency(profile.postText);
  const potentialScore = scorePotential(profile);
  const chancesScore = scoreChances(profile);

  return {
    agencyNeedScore,
    urgencyScore,
    potentialScore,
    chancesScore,
    signalLevel: signalLevel(agencyNeedScore, urgencyScore, potentialScore, chancesScore),
  };
}

function scoreProfiles(profiles) {
  return profiles.map((profile) => ({
    ...profile,
    ...scoreProfile(profile),
    needSummary: extractNeedSummary(profile),
  }));
}

module.exports = { scoreProfile, scoreProfiles };
