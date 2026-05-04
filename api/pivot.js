export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { skills } = req.body;
  if (!skills || !skills.length) return res.status(400).json({ error: 'Skills are required' });

  const expertiseLevel = (hours) => {
    if (hours >= 10000) return 'Master';
    if (hours >= 5000) return 'Advanced';
    if (hours >= 2000) return 'Proficient';
    if (hours >= 500) return 'Competent';
    if (hours >= 100) return 'Foundation';
    return 'Exposure';
  };

  const skillMap = {};
  skills.forEach(s => {
    const key = s.skill.toLowerCase().trim();
    if (!skillMap[key]) skillMap[key] = { skill: s.skill, totalHours: 0 };
    skillMap[key].totalHours += s.totalHours || 0;
  });

  const skillSummary = Object.values(skillMap).map(s => {
    const level = expertiseLevel(s.totalHours);
    return `${s.skill}: ${Math.round(s.totalHours).toLocaleString()} total hours (${level} Level)`;
  }).join('\n');

  const system = `You are Landors Pivot Analyzer. You analyze a persons unique combination of skills measured in total lifetime hours and identify their best career pivot opportunities.

CRITICAL JSON RULES:
- Respond ONLY with a valid JSON object, nothing else
- Do NOT use contractions: write "do not" not "don't", "you will" not "you'll", "it is" not "it's"
- Do NOT use apostrophes anywhere in response text
- Use only straight double quotes for JSON strings
- No markdown, no backticks, no preamble

Expertise levels: Master 10000+ hrs, Advanced 5000-9999, Proficient 2000-4999, Competent 500-1999, Foundation 100-499, Exposure under 100.

{
  "profile": "2-3 sentence summary. No apostrophes or contractions.",
  "crossoverRarity": integer 0-100,
  "rarityDesc": "one line. No apostrophes.",
  "strengthIndex": [
    {"label": "max 18 chars", "score": integer 0-100, "color": "#F0A500"},
    {"label": "max 18 chars", "score": integer 0-100, "color": "#FF6B35"},
    {"label": "max 18 chars", "score": integer 0-100, "color": "#FFD32A"},
    {"label": "max 18 chars", "score": integer 0-100, "color": "#2ED573"},
    {"label": "max 18 chars", "score": integer 0-100, "color": "#FF4757"}
  ],
  "timeline": {
    "short": {
      "label": "1-3 Years",
      "jobs": [
        {"title": "Job Title", "reason": "One sentence. No apostrophes."},
        {"title": "Job Title", "reason": "One sentence. No apostrophes."},
        {"title": "Job Title", "reason": "One sentence. No apostrophes."},
        {"title": "Job Title", "reason": "One sentence. No apostrophes."}
      ]
    },
    "medium": {
      "label": "3-5 Years",
      "jobs": [
        {"title": "Job Title", "reason": "One sentence. No apostrophes."},
        {"title": "Job Title", "reason": "One sentence. No apostrophes."},
        {"title": "Job Title", "reason": "One sentence. No apostrophes."},
        {"title": "Job Title", "reason": "One sentence. No apostrophes."}
      ]
    },
    "long": {
      "label": "5-10 Years",
      "jobs": [
        {"title": "Job Title", "reason": "One sentence. No apostrophes."},
        {"title": "Job Title", "reason": "One sentence. No apostrophes."},
        {"title": "Job Title", "reason": "One sentence. No apostrophes."},
        {"title": "Job Title", "reason": "One sentence. No apostrophes."}
      ]
    }
  },
  "insight": "2-3 sentences of direct advice. No apostrophes or contractions."
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1400,
        system,
        messages: [{ role: 'user', content: `Analyze career pivot opportunities for:\n\n${skillSummary}` }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || 'API error' });
    }

    const data = await response.json();
    const txt = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const result = robustParse(txt);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ 
      error: 'We had trouble analyzing your skills. Please try again.' 
    });
  }
}

function robustParse(txt) {
  let clean = txt.replace(/```json|```/g, '').trim();
  const s = clean.indexOf('{');
  const e = clean.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('No JSON found');
  let j = clean.slice(s, e + 1);
  j = j.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '');
  j = j.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
  j = j.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  try { return JSON.parse(j); } catch(e1) {}
  try {
    let fixed = j.replace(/"((?:[^"\\]|\\.)*)"/g, (match, inner) => {
      return '"' + inner.replace(/\n/g,' ').replace(/\r/g,' ').replace(/\t/g,' ') + '"';
    });
    return JSON.parse(fixed);
  } catch(e2) {}
  try {
    let fixed = j.replace(/:\s*"([^"\\]*)"/g, (match, inner) => {
      return ': "' + inner.replace(/[\x00-\x1F\x7F]/g,'').replace(/'/g,'').trim() + '"';
    });
    return JSON.parse(fixed);
  } catch(e3) { throw new Error('Parse failed'); }
}
