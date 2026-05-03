export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { skills } = req.body;
  if (!skills || !skills.length) return res.status(400).json({ error: 'Skills are required' });

  const skillSummary = skills.map(s =>
    `${s.skill}: ${s.duration} ${s.unit} at ${s.intensity} intensity`
  ).join('\n');

  const system = `You are Landor's Pivot Analyzer. Your job is to analyze a person's unique combination of skills, experience duration, and intensity levels, then identify the best career pivot opportunities based on where the job market is heading due to AI and technological displacement.

Key principles:
- The INTERSECTION of skills is more valuable than any single skill alone
- Years of experience weighted by intensity creates a "depth score"
- High intensity = full-time immersive (40+ hrs/week)
- Medium intensity = part-time or secondary role (20-30 hrs/week)  
- Low intensity = hobby or side interest (1-3 hrs/week)
- Focus on emerging roles that don't fully exist yet but will in 1-10 years
- Draw from your knowledge of O*NET occupational data, BLS projections, McKinsey automation research, Brookings AI exposure index, and Goldman Sachs labor market studies

Respond ONLY with a valid JSON object, no markdown, no backticks, no preamble:
{
  "profile": "2-3 sentence summary of this person's unique skill intersection and what makes it valuable",
  "crossoverRarity": integer 0-100,
  "rarityDesc": "one line explaining why their combination is rare or common",
  "strengthIndex": [
    {"label": "label max 20 chars", "score": integer 0-100, "color": "#F0A500"},
    {"label": "label max 20 chars", "score": integer 0-100, "color": "#F0A500"},
    {"label": "label max 20 chars", "score": integer 0-100, "color": "#F0A500"},
    {"label": "label max 20 chars", "score": integer 0-100, "color": "#2ED573"},
    {"label": "label max 20 chars", "score": integer 0-100, "color": "#FF4757"}
  ],
  "timeline": {
    "short": {
      "label": "1-3 Years",
      "jobs": [
        {"title": "Job Title", "reason": "One sentence why this fits their background"},
        {"title": "Job Title", "reason": "One sentence why this fits their background"},
        {"title": "Job Title", "reason": "One sentence why this fits their background"},
        {"title": "Job Title", "reason": "One sentence why this fits their background"}
      ]
    },
    "medium": {
      "label": "3-5 Years",
      "jobs": [
        {"title": "Job Title", "reason": "One sentence why this fits their background"},
        {"title": "Job Title", "reason": "One sentence why this fits their background"},
        {"title": "Job Title", "reason": "One sentence why this fits their background"},
        {"title": "Job Title", "reason": "One sentence why this fits their background"}
      ]
    },
    "long": {
      "label": "5-10 Years",
      "jobs": [
        {"title": "Job Title", "reason": "One sentence why this fits their background"},
        {"title": "Job Title", "reason": "One sentence why this fits their background"},
        {"title": "Job Title", "reason": "One sentence why this fits their background"},
        {"title": "Job Title", "reason": "One sentence why this fits their background"}
      ]
    }
  },
  "insight": "2-3 sentences of direct personal advice for this specific person based on their skill combination — what should they do RIGHT NOW to prepare for their pivot"
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
        messages: [{ role: 'user', content: `Analyze this person's skills and calculate their best career pivots:\n\n${skillSummary}` }]
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
    const result = JSON.parse(jsonStr);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
