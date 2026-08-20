const positiveRules = [
  { pattern: /official audio|audio oficial/i, score: 50, badge: 'official-audio' },
  { pattern: /lyrics?|lyric video|letra/i, score: 42, badge: 'lyrics' },
  { pattern: /\btopic\b|provided to youtube by/i, score: 35, badge: 'topic' },
  { pattern: /visualizer/i, score: 22, badge: 'visualizer' },
  { pattern: /official video|video oficial|music video/i, score: 6, badge: 'official-video' }
];

const negativeRules = [
  { pattern: /\blive\b|en vivo|concert|concierto/i, score: -50, badge: 'live' },
  { pattern: /karaoke/i, score: -50, badge: 'karaoke' },
  { pattern: /\bcover\b/i, score: -40, badge: 'cover' },
  { pattern: /reaction/i, score: -40, badge: 'reaction' },
  { pattern: /sped up|slowed|nightcore|8d|bass boosted/i, score: -35, badge: 'altered' },
  { pattern: /\bremix\b/i, score: -25, badge: 'remix' },
  { pattern: /#shorts|\bshorts\b/i, score: -30, badge: 'shorts' }
];

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function includesTerms(text, query) {
  const terms = normalize(query).split(' ').filter(term => term.length > 2);
  if (terms.length === 0) return 0;
  const haystack = normalize(text);
  const hits = terms.filter(term => haystack.includes(term)).length;
  return Math.round((hits / terms.length) * 30);
}

function durationScore(duration) {
  if (!duration) return 0;
  if (duration >= 120 && duration <= 450) return 18;
  if (duration >= 90 && duration <= 600) return 8;
  if (duration > 900) return -30;
  if (duration < 60) return -20;
  return 0;
}

export function rankYoutubeResult(result, query) {
  const text = `${result.title || ''} ${result.channel || ''} ${result.uploader || ''}`;
  const badges = [];
  let score = includesTerms(text, query) + durationScore(result.duration);

  for (const rule of positiveRules) {
    if (rule.pattern.test(text)) {
      score += rule.score;
      badges.push(rule.badge);
    }
  }

  for (const rule of negativeRules) {
    if (rule.pattern.test(text)) {
      score += rule.score;
      badges.push(rule.badge);
    }
  }

  if (/ - topic$/i.test(result.channel || result.uploader || '')) {
    score += 20;
    if (!badges.includes('topic')) badges.push('topic');
  }

  return { score, badges };
}
