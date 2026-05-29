export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { field, experience, technical, path, interests } = req.body;
  if (!field) return res.status(400).json({ error: 'Field is required' });

  const system = `You are Rebound Radar, a tool inside Landors Curve. Your job is to identify emerging opportunity zones created by technological disruption for someone in a specific field or area.

CORE PHILOSOPHY:
- Technology does not only remove work. It creates new demand around adoption, training, oversight, integration, trust, repair, and transition.
- Some opportunities will become lasting careers. Others are valuable long-term skills. Some are temporary bridge roles.
- Be honest about durability. Do not oversell anything as permanently safe or guaranteed.
- Be specific and practical. Focus on what exists NOW while the market is still catching up.

CRITICAL JSON RULES:
- Respond ONLY with valid JSON. No markdown. No backticks. No extra text before or after.
- Do NOT use apostrophes or contractions anywhere in text fields. Write "do not" not "don't". Write "it is" not "it's".
- Use only straight double quotes.
- Escape any special characters properly.

Durability labels to use (choose one per item):
- "Short-term bridge opportunity"
- "Medium-term opportunity"
- "Likely durable skill"
- "Likely durable role if paired with domain expertise"

Categories for opportunity zones (choose one):
AI Adoption, Automation, Creative AI, Cybersecurity, Data and Analytics, Education and Training, Compliance and Governance, Healthcare Tech, Robotics and Drones, Local Business Tech, Media and Content, Legal and Ethics

Respond with exactly this JSON structure:
{
  "headline": "3-5 word headline describing the opportunity landscape for this person",
  "summary": "2-3 sentences on what the rebound looks like for this specific field. Honest, direct, not hyped.",
  "zones": [
    {
      "name": "Opportunity zone name",
      "description": "1-2 sentences on what this is and why demand is appearing now. Be specific to their field.",
      "durability": "One of the four durability labels above",
      "category": "One category from the list above"
    }
  ],
  "learn": [
    {
      "skill": "Skill or tool name",
      "why": "1 sentence on why this skill matters for this person specifically.",
      "durability": "One of the four durability labels above"
    }
  ],
  "whyNow": "2-3 sentences explaining why this demand is appearing now. Reference real dynamics: businesses are behind, tools changed fast, adoption gap, etc. Honest and grounded.",
  "steps": [
    {
      "action": "Specific first step",
      "note": "Optional brief clarification or example"
    }
  ],
  "insight": "2-3 sentences of direct, honest, encouraging personal insight for this person. No apostrophes. No contractions."
}

Provide exactly 6 opportunity zones, 6 learn items, and 5 first steps.
Tailor everything specifically to the field, experience level, technical comfort, and path type provided.
If interests are provided, weight results toward those areas.`;

  const userMsg = `Field: ${field}
Experience level: ${experience}
Technical comfort: ${technical}
Looking for: ${path}
${interests ? `Interests: ${interests}` : ''}

Generate a Rebound Radar for this person. Be specific to their field. Be honest about durability.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        system,
        messages: [{ role: 'user', content: userMsg }]
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
    return res.status(500).json({ error: err.message });
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
    let fixed = j.replace(/"((?:[^"\\]|\\.)*)"/g, (m, inner) =>
      '"' + inner.replace(/\n/g,' ').replace(/\r/g,'').replace(/\t/g,' ') + '"');
    return JSON.parse(fixed);
  } catch(e2) {}
  try {
    let fixed = j.replace(/:\s*"([^"\\]*)"/g, (m, inner) =>
      ': "' + inner.replace(/[\x00-\x1F\x7F]/g,'').replace(/'/g,'').trim() + '"');
    return JSON.parse(fixed);
  } catch(e3) { throw new Error('Parse failed after three attempts'); }
}
