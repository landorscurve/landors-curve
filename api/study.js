export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { currentCareer, hoursPerWeek } = req.body;
  if (!currentCareer) return res.status(400).json({ error: 'Current career is required' });

  const system = `You are Landor's Study — a career transition suggestor powered by Landor's Curve. Landor's Curve describes the accelerating displacement of professions by technology. Your job is to take someone's current career and suggest SAFER adjacent careers they could realistically transition into — careers that are lower on the displacement risk scale and leverage their existing transferable skills.

Key principles:
- Suggest careers that are ADJACENT — the person already has transferable skills from their current field
- Prioritize careers that are SAFER on Landor's Curve — lower automation risk, require human judgment
- Include some careers the person may never have thought of or that are newly emerging
- For each suggestion, provide three pathways: Free, Mid-level certification, and College or Professional degree
- Adjust timelines based on available hours per week (standard full time = 40 hrs/week)
- Be specific about costs as of 2025

Course and certification cost knowledge:
- Google Career Certificates: $49/month, 3-6 months full-time
- Coursera Professional Certificates: $49/month
- Udemy courses: $15-30 on sale
- LinkedIn Learning: $39.99/month
- Community college: $150-300 per credit hour
- State university online: $300-600 per credit hour
- Professional licensing exams: $200-500
- Bootcamps: $8,000-17,000
- eCornell certificates: $2,000-5,000
- MIT OpenCourseWare, freeCodeCamp, Khan Academy: FREE

Respond ONLY with valid JSON, no markdown, no backticks:
{
  "currentCareer": "clean career name",
  "displacementWarning": "one sentence about why this field faces displacement pressure",
  "transferableStrengths": ["strength1", "strength2", "strength3", "strength4"],
  "suggestions": [
    {
      "career": "Suggested Career Title",
      "why": "One sentence explaining why their background makes this a natural fit",
      "saferBecause": "One sentence explaining why this career is safer on Landors Curve",
      "isNew": true,
      "newLabel": "Emerging Role",
      "pathways": {
        "free": {
          "resources": ["Resource 1", "Resource 2"],
          "timeline": "X months at Y hrs/week",
          "cost": "$0"
        },
        "mid": {
          "certification": "Specific certification name",
          "provider": "Provider name",
          "timeline": "X months at Y hrs/week",
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
  "insight": "2-3 sentences of direct encouraging advice for this specific person about their best transition options"
}

Provide exactly 5 suggestions. Make them varied in surprise level — 2 obvious adjacent roles, 2 less obvious but logical, 1 brand new emerging role they probably never heard of.`;

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
          content: `Suggest safer adjacent careers for: ${currentCareer}. Available study time: ${hoursPerWeek} hours per week.`
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
    if (s === -1 || e === -1) return res.status(500).json({ error: 'Invalid response format' });
    let jsonStr = clean.slice(s, e + 1);
    
    // Robust JSON cleaning
    jsonStr = jsonStr.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '');
    jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    
    // Fix smart quotes
    jsonStr = jsonStr.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
    
    // Parse with fallback
    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch (parseErr) {
      // Strip all content inside string values and try to rebuild
      try {
        jsonStr = jsonStr.replace(/:\s*"((?:[^"\\]|\\.)*)"/g, (match, inner) => {
          const safe = inner
            .replace(/\\/g, '\\\\')
            .replace(/\n/g, ' ')
            .replace(/\r/g, ' ')
            .replace(/\t/g, ' ');
          return ': "' + safe + '"';
        });
        result = JSON.parse(jsonStr);
      } catch (e2) {
        return res.status(500).json({ error: 'We could not process this career. Please try again or try a different job title.' });
      }
    }
    
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
