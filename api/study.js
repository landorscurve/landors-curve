export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let { currentCareer, hoursPerWeek } = req.body;
  if (!currentCareer) return res.status(400).json({ error: 'Current career is required' });
  
  // Clean and normalize career input - handle misspellings gracefully
  currentCareer = currentCareer.trim();

  const system = `You are Landors Study, a career transition suggestor. Your job is to take any career input, even if misspelled or informal, interpret it generously, and suggest safer adjacent careers that person can transition into.

CRITICAL JSON RULES - you must follow these exactly:
- Respond ONLY with a valid JSON object
- Do NOT use any contractions: write "do not" not "don't", "you will" not "you'll", "it is" not "it's"
- Do NOT use apostrophes anywhere in your response text
- Do NOT use smart quotes or curly quotes
- Use only straight double quotes for JSON strings
- No markdown, no backticks, no text before or after the JSON

If the input is misspelled or unclear, interpret it as the closest real career and proceed.

Respond with this exact structure:
{
  "currentCareer": "the interpreted clean career name",
  "displacementWarning": "one sentence about why this field faces displacement pressure, no apostrophes",
  "transferableStrengths": ["strength1", "strength2", "strength3", "strength4"],
  "suggestions": [
    {
      "career": "Suggested Career Title",
      "why": "One sentence explaining why background makes this a natural fit, no apostrophes",
      "saferBecause": "One sentence explaining why this career is safer on Landors Curve, no apostrophes",
      "isNew": true,
      "newLabel": "Emerging Role",
      "pathways": {
        "free": {
          "resources": ["Resource 1", "Resource 2"],
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
  "insight": "2-3 sentences of direct encouraging advice. No apostrophes or contractions."
}

Provide exactly 5 suggestions. Make them varied: 2 obvious adjacent roles, 2 less obvious but logical, 1 brand new emerging role.`;

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
          content: `Suggest safer adjacent careers for: ${currentCareer}. Available study time: ${hoursPerWeek || 8} hours per week.`
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
    
  } catch (err) {
    return res.status(500).json({ 
      error: 'We had trouble analyzing that career. Please try again — this sometimes happens on the first attempt.' 
    });
  }
}

function robustParse(txt) {
  let clean = txt.replace(/```json|```/g, '').trim();
  const s = clean.indexOf('{');
  const e = clean.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('No JSON found');
  let j = clean.slice(s, e + 1);
  
  // Remove control characters
  j = j.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '');
  // Fix trailing commas
  j = j.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
  // Replace smart/curly quotes with straight
  j = j.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  
  // Pass 1: direct parse
  try { return JSON.parse(j); } catch(e1) {}
  
  // Pass 2: escape apostrophes inside string values
  try {
    let fixed = j.replace(/"((?:[^"\\]|\\.)*)"/g, (match, inner) => {
      return '"' + inner.replace(/\n/g,' ').replace(/\r/g,' ').replace(/\t/g,' ') + '"';
    });
    return JSON.parse(fixed);
  } catch(e2) {}
  
  // Pass 3: aggressive strip of problematic chars inside values
  try {
    let fixed = j.replace(/:\s*"([^"\\]*)"/g, (match, inner) => {
      const safe = inner.replace(/[\x00-\x1F\x7F]/g,'').replace(/'/g,'').trim();
      return ': "' + safe + '"';
    });
    return JSON.parse(fixed);
  } catch(e3) {
    throw new Error('Parse failed');
  }
}
