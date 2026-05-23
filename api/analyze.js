export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let { profession, preset, sources } = req.body;
  if (!profession) return res.status(400).json({ error: 'Profession is required' });
  profession = profession.trim();

  const presetLabel = preset || 'balanced';
  const sourceList = sources && sources.length ? sources : ['O*NET','BLS','Brookings','Goldman Sachs','McKinsey','WEF','LinkedIn Workforce Reports','OECD'];

  const presetContext = {
    balanced:     'Use all available sources equally: O*NET for task detail, BLS for employment projections, Brookings for automation exposure, Goldman Sachs and McKinsey for AI displacement modeling, WEF for global trends, LinkedIn Workforce Reports for current hiring signals, and OECD for international context.',
    conservative: 'Weight this analysis toward BLS and O*NET data only. Be conservative in displacement estimates. Government data moves slowly and tends to underestimate disruption speed, so reflect that caution in the output.',
    disruption:   'Weight this analysis toward McKinsey, Goldman Sachs, and Brookings research. These sources tend to be more aggressive on automation timelines and AI displacement. Reflect that in a more urgent displacement assessment.',
    emerging:     'Weight this analysis toward Brookings, WEF, LinkedIn Workforce Reports, and OECD. Focus on forward-looking trends, international patterns, and what is currently being hired for. Emphasize emerging adjacent opportunities.',
  }[presetLabel] || '';

  const system = `You are the Landors Curve Job Displacement Analyzer. Analyze any profession or job title, even if misspelled or informal.

SOURCE PRESET: ${presetLabel.toUpperCase()}
Active sources for this analysis: ${sourceList.join(', ')}
Weighting instruction: ${presetContext}

CRITICAL JSON RULES:
- Respond ONLY with a valid JSON object, nothing else
- Do NOT use contractions: write "do not" not "don't", "it is" not "it's"
- Do NOT use apostrophes anywhere in response text
- Use only straight double quotes for JSON strings
- No markdown, no backticks, no preamble

{
  "profession": "clean profession name",
  "riskScore": integer 0-100,
  "riskLevel": "CRITICAL or HIGH or MEDIUM or LOW",
  "riskColor": "critical or high or medium or low",
  "meterColor": "#FF4757 for critical, #FF6B35 for high, #FFD32A for medium, #2ED573 for low",
  "meterDesc": "short one-line summary of risk position, no apostrophes",
  "stats": [
    {"key": "BLS 10-yr employment outlook", "val": "specific percent or number"},
    {"key": "Automation susceptibility", "val": "value from research"},
    {"key": "AI exposure index (Brookings)", "val": "low or moderate or high plus detail"},
    {"key": "Current US employment", "val": "approx number"},
    {"key": "Median annual wage", "val": "dollar figure"},
    {"key": "Landors Curve timeline", "val": "estimated years to significant displacement"}
  ],
  "landorIndex": {
    "historicalSpeed": integer 0-100,
    "currentAISpeed": integer 0-100,
    "adaptationDifficulty": integer 0-100
  },
  "analysis": "3-4 sentences reflecting the active source preset. No apostrophes or contractions.",
  "tasksAtRisk": ["task1", "task2", "task3", "task4", "task5"],
  "tasksSurvive": ["task1", "task2", "task3", "task4"],
  "jobsRemain": "2-3 sentences. No apostrophes or contractions.",
  "sources": [
    {"name": "source name", "detail": "specific finding from that source"}
  ],
  "presetNote": "One sentence explaining how the active source preset affected this analysis. No apostrophes."
}

Include only the active sources in the sources array. Reflect the weighting instruction in the tone and conclusions of the analysis.`;

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
        messages: [{ role: 'user', content: `Analyze this profession using the ${presetLabel} source preset: ${profession}` }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || 'API error' });
    }

    const data = await response.json();
    const txt = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const result = robustParse(txt);
    result.activePreset = presetLabel;
    return res.status(200).json(result);
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}

function robustParse(txt) {
  let clean = txt.replace(/```json|```/g, '').trim();
  const s = clean.indexOf('{'); const e = clean.lastIndexOf('}');
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
  } catch(e3) { throw new Error('Parse failed'); }
}
