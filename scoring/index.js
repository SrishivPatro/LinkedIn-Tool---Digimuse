const SENIOR_TITLE_KEYWORDS = [
  'ceo', 'cto', 'cfo', 'coo', 'founder', 'co-founder', 'owner',
  'president', 'vp', 'vice president', 'head of', 'director',
];
const MID_TITLE_KEYWORDS = ['manager', 'lead', 'senior'];

function scoreProfile(profile) {
  let score = 0;
  const title = (profile.title || '').toLowerCase();

  if (SENIOR_TITLE_KEYWORDS.some((kw) => title.includes(kw))) {
    score += 50;
  } else if (MID_TITLE_KEYWORDS.some((kw) => title.includes(kw))) {
    score += 25;
  }

  if (profile.company) score += 10;
  if (profile.location) score += 5;

  const connections = Number(profile.connections) || 0;
  if (connections >= 500) score += 20;
  else if (connections >= 100) score += 10;

  return Math.min(score, 100);
}

function scoreProfiles(profiles) {
  return profiles.map((profile) => ({
    ...profile,
    score: scoreProfile(profile),
  }));
}

module.exports = { scoreProfile, scoreProfiles };
