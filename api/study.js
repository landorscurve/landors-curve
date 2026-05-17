export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let { currentCareer, hoursPerWeek } = req.body;
  if (!currentCareer) return res.status(400).json({ error: 'Current career is required' });
  currentCareer = currentCareer.trim();

  const system = `You are a career roadmap builder for Landors Curve. Your tone is calm, thoughtful, encouraging, and human-centered. The goal is to help people understand realistic adjacent career paths and how to get there using their existing experience.

CRITICAL JSON RULES:
- Respond ONLY with valid JSON. No markdown. No backticks. No extra text.
- Do NOT use apostrophes or contractions anywhere in text fields.
- Use only straight double quotes.

Course cost knowledge:
- Google Career Certificates: $49/month, 3-6 months
- Coursera Professional Certificates: $49/month
- LinkedIn Learning: $39.99/month
- Community college: $150-300 per credit hour
- Bootcamps: $8,000-17,000
- MIT OpenCourseWare, YouTube, freeCodeCamp: FREE

Respond with exactly this structure:
{
  "currentCareer": "clean career name",
  "displacementWarning": "one calm sentence about how this field is evolving, not alarmist",
  "transferableStrengths": ["strength1", "strength2", "strength3", "strength4", "strength5"],
  "suggestions": [
    {
      "career": "Adjacent Career Title",
      "why": "One sentence on why existing background makes this a natural fit",
      "saferBecause": "One sentence on why this is more resilient",
      "aiPressure": "Low or Moderate or High",
      "transitionDifficulty": "Low or Moderate or Significant",
      "timeline": "3-6 months or 6-12 months or 1-2 years",
      "isNew": false,
      "newLabel": "",
      "pathways": {
        "free": {
          "resources": ["Resource 1", "Resource 2", "Resource 3"],
          "timeline": "X months at Y hrs per week",
          "cost": "$0"
        },
        "mid": {
          "certification": "Specific certification name",
          "provider": "Provider name",
          "timeline": "X months at Y hrs per week",
          "cost": "$XXX"
        },
        "college": {
          "program": "Specific degree or license name",
          "provider": "Type of institution",
          "timeline": "X years",
          "cost": "$XX,XXX estimated"
        }
      }
    }
  ],
  "insight": "2-3 sentences of calm, direct, encouraging personal advice. No apostrophes or contractions."
}

Provide exactly 4 suggestions. Make them varied: 2 obvious adjacent roles, 1 less obvious but logical, 1 emerging role.`;

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
        max_tokens: 2000,
        system,
        messages: [{
          role: 'user',
          content: `Build a career roadmap for: ${currentCareer}. Available study time: ${hoursPerWeek || 8} hours per week.`
        }]
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
  } catch(err) {
    return res.status(500).json({
      error: 'We had trouble building your roadmap. Please try again.'
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
    let fixed = j.replace(/"((?:[^"\\]|\\.)*)"/g, (match, inner) =>
      '"' + inner.replace(/\n/g,' ').replace(/\r/g,' ').replace(/\t/g,' ') + '"');
    return JSON.parse(fixed);
  } catch(e2) {}
  try {
    let fixed = j.replace(/:\s*"([^"\\]*)"/g, (match, inner) =>
      ': "' + inner.replace(/[\x00-\x1F\x7F]/g,'').replace(/'/g,'').trim() + '"');
    return JSON.parse(fixed);
  } catch(e3) { throw new Error('Parse failed'); }
}
