export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { resumeText } = req.body;
  if (!resumeText) return res.status(400).json({ error: 'Resume text is required' });

  const system = `You are a resume analyzer for Landors Pivot, a career calculator that measures lifetime hours of expertise.

Your job is to extract EVERY job title, role, skill, and profession from the resume text provided. Be generous and inclusive. Even if the text is messy, partial, or oddly formatted, do your best to find work history and skills.

CRITICAL JSON RULES:
- Respond ONLY with valid JSON, no markdown, no backticks, no preamble
- Do NOT use apostrophes or contractions anywhere
- Use only straight double quotes

For each role estimate:
- skill: clean job title or skill name
- years: years in that role (use 1 if unclear, never 0)
- fullTime: true if full time, false if part time or freelance
- hoursPerDay: 8 for full time, 4 for part time, 2 for occasional
- days: array from ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]

Important rules:
- If the text looks like a resume at all, extract something. Never return an empty skills array.
- If you cannot find specific job titles, extract the most likely profession from any context clues in the text.
- If you see company names, school names, or industry terms, use them to infer the profession.
- Maximum 8 entries. Minimum 1 entry as long as any work-related text exists.
- If dates are present, calculate years from them. If not, estimate based on context.

Respond with exactly:
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
        max_tokens: 1200,
        system,
        messages: [{
          role: 'user',
          content: 'Extract all work history and skills from this resume. Be generous — find something even if the text is messy:\n\n' + resumeText.slice(0, 6000)
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
    if (s === -1 || e === -1) {
      // Last resort — return a generic entry so the user sees something
      return res.status(200).json({
        name: '',
        skills: [{ skill: 'Professional Experience', years: 5, fullTime: true, hoursPerDay: 8, days: ['Mon','Tue','Wed','Thu','Fri'] }],
        warning: 'Could not fully read this resume. Please fill in your skills manually.'
      });
    }

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
      } catch(e2) {
        return res.status(200).json({
          name: '',
          skills: [{ skill: 'Professional Experience', years: 5, fullTime: true, hoursPerDay: 8, days: ['Mon','Tue','Wed','Thu','Fri'] }],
          warning: 'Resume was read but could not be fully parsed. Please fill in your skills manually.'
        });
      }
    }

    // Ensure skills array is never empty
    if (!result.skills || result.skills.length === 0) {
      result.skills = [{ skill: 'Professional Experience', years: 5, fullTime: true, hoursPerDay: 8, days: ['Mon','Tue','Wed','Thu','Fri'] }];
      result.warning = 'Could not identify specific roles. Please update the skills below with your actual experience.';
    }

    return res.status(200).json(result);
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
