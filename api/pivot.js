export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { skills } = req.body;
  if (!skills || !skills.length) return res.status(400).json({ error: 'Skills are required' });

  // Build skill summary with total hours and expertise levels
  const expertiseLevel = (hours) => {
    if (hours >= 10000) return 'Master';
    if (hours >= 5000) return 'Advanced';
    if (hours >= 2000) return 'Proficient';
    if (hours >= 500) return 'Competent';
    if (hours >= 100) return 'Foundation';
    return 'Exposure';
  };

  // Aggregate hours by skill name
  const skillMap = {};
  skills.forEach(s => {
    const key = s.skill.toLowerCase().trim();
    if (!skillMap[key]) skillMap[key] = { skill: s.skill, totalHours: 0, entries: [] };
    skillMap[key].totalHours += s.totalHours || 0;
    skillMap[key].entries.push(s);
  });

  const skillSummary = Object.values(skillMap).map(s => {
    const level = expertiseLevel(s.totalHours);
    return `${s.skill}: ${Math.round(s.totalHours).toLocaleString()} total hours (${level} Level)`;
  }).join('\n');

  const system = `You are Landors Pivot Analyzer. You analyze a persons unique combination of skills measured in total lifetime hours invested, and identify their best career pivot opportunities based on where the job market is heading due to AI and technological displacement.

The expertise levels are:
- Master: 10,000+ hours
- Advanced: 5,000-9,999 hours  
- Proficient: 2,000-4,999 hours
- Competent: 500-1,999 hours
- Foundation: 100-499 hours
- Exposure: under 100 hours

Key principles:
- The INTERSECTION of skills creates rare value that individual skills do not have alone
- Master and Advanced level skills are the persons core assets
- Focus on emerging roles that leverage their specific combination
- Draw from your knowledge of labor market trends, AI displacement patterns, and emerging career categories

Respond ONLY with a valid JSON object, no markdown, no backticks, no extra text:
{
  "profile": "2-3 sentence summary of this persons unique skill intersection and what makes it valuable in todays market",
  "crossoverRarity": integer 0-100,
  "rarityDesc": "one line explaining why their combination is rare or common",
  "topSkills": [
    {"skill": "skill name", "hours": integer, "level": "Master/Advanced/etc", "color": "#F0A500 for Master, #FF6B35 for Advanced, #FFD32A for Proficient, #2ED573 for Competent, #888899 for Foundation"}
  ],
  "strengthIndex": [
    {"label": "label max 18 chars", "score": integer 0-100, "color": "#F0A500"},
    {"label": "label max 18 chars", "score": integer 0-100, "color": "#F0A500"},
    {"label": "label max 18 chars", "score": integer 0-100, "color": "#2ED573"},
    {"label": "label max 18 chars", "score": integer 0-100, "color": "#FF6B35"},
    {"label": "label max 18 chars", "score": integer 0-100, "color": "#FF4757"}
  ],
  "timeline": {
    "short": {
      "label": "1-3 Years",
      "jobs": [
        {"title": "Job Title", "reason": "One sentence why this fits their hours and background"},
        {"title": "Job Title", "reason": "One sentence why this fits their hours and background"},
        {"title": "Job Title", "reason": "One sentence why this fits their hours and background"},
        {"title": "Job Title", "reason": "One sentence why this fits their hours and background"}
      ]
    },
    "medium": {
      "label": "3-5 Years",
      "jobs": [
        {"title": "Job Title", "reason": "One sentence why this fits"},
        {"title": "Job Title", "reason": "One sentence why this fits"},
        {"title": "Job Title", "reason": "One sentence why this fits"},
        {"title": "Job Title", "reason": "One sentence why this fits"}
      ]
    },
    "long": {
      "label": "5-10 Years",
      "jobs": [
        {"title": "Job Title", "reason": "One sentence why this fits"},
        {"title": "Job Title", "reason": "One sentence why this fits"},
        {"title": "Job Title", "reason": "One sentence why this fits"},
        {"title": "Job Title", "reason": "One sentence why this fits"}
      ]
    }
  },
  "insight": "2-3 sentences of direct personal advice for this specific person based on their skill combination and expertise levels"
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
    let clean = txt.replace(/```json|```/g, '').trim();
    const s = clean.indexOf('{');
    const e = clean.lastIndexOf('}');
    if (s === -1 || e === -1) return res.status(500).json({ error: 'Invalid response format' });
    let jsonStr = clean.slice(s, e + 1);
    jsonStr = jsonStr.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '');
    jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    jsonStr = jsonStr.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch (parseErr) {
      try {
        jsonStr = jsonStr.replace(/:\s*"((?:[^"\\]|\\.)*)"/g, (match, inner) => {
          const safe = inner.replace(/\\/g, '\\\\').replace(/\n/g, ' ').replace(/\r/g, ' ').replace(/\t/g, ' ');
          return ': "' + safe + '"';
        });
        result = JSON.parse(jsonStr);
      } catch (e2) {
        return res.status(500).json({ error: 'We could not process this request. Please try again.' });
      }
    }
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
