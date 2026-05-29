export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { resumeText } = req.body;
  if (!resumeText) return res.status(400).json({ error: 'Resume text is required' });

  const system = `You are extracting work history from a resume for a career calculator called Landors Pivot.

Your task: Find EVERY job, role, and position listed in this resume. Look specifically for:
- Company names followed by job titles (e.g. "Bank of America, Senior Vice President")
- Job titles followed by company names
- Any section labeled EXPERIENCE, WORK HISTORY, EMPLOYMENT, or similar
- Consulting roles, freelance work, founder roles, director roles, board roles
- Academic or teaching positions
- Non-profit leadership roles

For each role you find, create one entry. Use these estimates for years if no dates are given:
- C-suite or Executive Director level: 3-5 years
- Senior VP, Director, Principal: 3-5 years  
- Manager, Senior Consultant: 2-4 years
- Consultant, Analyst, Associate: 1-3 years
- Early career or junior: 1-2 years
- Founder or board role: use 3 if unclear

CRITICAL JSON RULES:
- Respond ONLY with valid JSON. No markdown. No backticks. No extra text.
- Do NOT use apostrophes or contractions anywhere in text fields
- Use only straight double quotes

Output format:
{
  "name": "persons name",
  "skills": [
    {
      "skill": "Job Title at Company Name",
      "years": 5,
      "fullTime": true,
      "hoursPerDay": 8,
      "days": ["Mon","Tue","Wed","Thu","Fri"]
    }
  ]
}

Rules for hoursPerDay and fullTime:
- Full time corporate roles: fullTime true, hoursPerDay 8, all weekdays
- Consulting or contractor: fullTime false, hoursPerDay 6, all weekdays
- Founder or nonprofit board: fullTime false, hoursPerDay 4, Mon Wed Fri
- Adjunct professor or part time: fullTime false, hoursPerDay 3, Mon Wed Fri
- Do not return fewer than 4 entries if the resume has 4 or more roles
- Maximum 10 entries`;

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
        max_tokens: 1500,
        system,
        messages: [{
          role: 'user',
          content: `Extract every job role from this resume. Find ALL positions including consulting, nonprofit, and teaching roles:\n\n${resumeText.slice(0, 7000)}`
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
          ': "' + inner.replace(/'/g, '').replace(/[\x00-\x1F]/g, '').trim() + '"');
        result = JSON.parse(jsonStr);
      } catch(e2) {
        return res.status(200).json({
          name: '',
          skills: [{ skill: 'Professional Experience', years: 5, fullTime: true, hoursPerDay: 8, days: ['Mon','Tue','Wed','Thu','Fri'] }],
          warning: 'Resume was read but could not be fully parsed. Please fill in your skills manually.'
        });
      }
    }

    if (!result.skills || result.skills.length === 0) {
      result.skills = [{ skill: 'Professional Experience', years: 5, fullTime: true, hoursPerDay: 8, days: ['Mon','Tue','Wed','Thu','Fri'] }];
      result.warning = 'Could not identify specific roles. Please update the skills below with your actual experience.';
    }

    return res.status(200).json(result);
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
