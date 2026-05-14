export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { resumeText } = req.body;
  if (!resumeText) return res.status(400).json({ error: 'Resume text is required' });

  const system = `You are a resume analyzer for Landors Pivot, a career calculator. Extract the persons work history and skills from their resume text.

CRITICAL JSON RULES:
- Respond ONLY with valid JSON, no markdown, no backticks, no preamble
- Do NOT use apostrophes or contractions in any text fields
- Use only straight double quotes for JSON strings

For each role or skill, estimate:
- skill: the job title or skill name (clean, concise)
- years: number of years in that role (decimal ok, e.g. 2.5)
- fullTime: true if full time work, false if part time, freelance, or occasional
- hoursPerDay: estimated hours per day (8 for full time, 4 for part time, 2 for occasional)
- days: array of day names from ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]

Rules:
- Extract each distinct role separately, even if at the same company
- If dates overlap, include both
- Include significant skills that have years of practice behind them
- Ignore one-off projects or brief experiences under 6 months
- Maximum 8 skills or roles
- For freelance or consulting, use 5 days but lower hours per day

Respond with exactly this structure:
{
  "name": "persons name if visible or empty string",
  "skills": [
    {
      "skill": "Job Title or Skill",
      "years": 5,
      "fullTime": true,
      "hoursPerDay": 8,
      "days": ["Mon","Tue","Wed","Thu","Fri"]
    }
  ]
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
        max_tokens: 1000,
        system,
        messages: [{
          role: 'user',
          content: 'Extract the work history and skills from this resume:\n\n' + resumeText
        }]
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
    if (s === -1 || e === -1) return res.status(500).json({ error: 'Could not parse resume' });
    let jsonStr = clean.slice(s, e + 1);
    jsonStr = jsonStr.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '');
    jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    jsonStr = jsonStr.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
    let result;
    try { result = JSON.parse(jsonStr); }
    catch(e1) {
      try {
        jsonStr = jsonStr.replace(/:\s*"([^"\\]*)"/g, (m, inner) =>
          ': "' + inner.replace(/'/g,'').replace(/[\x00-\x1F]/g,'').trim() + '"');
        result = JSON.parse(jsonStr);
      } catch(e2) { return res.status(500).json({ error: 'Could not parse AI response' }); }
    }
    return res.status(200).json(result);
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
