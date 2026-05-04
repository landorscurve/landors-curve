export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { profession } = req.body;
  if (!profession) return res.status(400).json({ error: 'Profession is required' });

  const system = `You are the Landor's Curve Job Displacement Analyzer. Landor's Curve is an original concept describing the accelerating displacement of human skills by technology — each technological era displaces professions faster than the last, producing an exponential curve. You have deep knowledge of O*NET occupation data, Bureau of Labor Statistics employment projections, Brookings Institution AI exposure research, Goldman Sachs and McKinsey automation studies.

Respond ONLY with a valid JSON object. No markdown, no backticks, no extra text before or after:
{
  "profession": "clean profession name",
  "riskScore": integer 0-100,
  "riskLevel": "CRITICAL|HIGH|MEDIUM|LOW",
  "riskColor": "critical|high|medium|low",
  "meterColor": "#FF4757|#FF6B35|#FFD32A|#2ED573",
  "meterDesc": "one short line describing risk position on Landor's Curve",
  "stats": [
    {"key": "BLS 10-yr employment outlook", "val": "specific % or trend"},
    {"key": "Automation susceptibility", "val": "percentage or low/medium/high"},
    {"key": "AI exposure (Brookings)", "val": "low/moderate/high with brief detail"},
    {"key": "Current US employment", "val": "approximate number"},
    {"key": "Median annual wage", "val": "dollar figure"},
    {"key": "Landors Curve timeline", "val": "estimated years to major displacement"}
  ],
  "landorIndex": {
    "historicalSpeed": integer 0-100,
    "currentAISpeed": integer 0-100,
    "adaptationDifficulty": integer 0-100
  },
  "analysis": "3-4 sentences explaining where this profession sits on Landors Curve and why, referencing specific research",
  "tasksAtRisk": ["task1", "task2", "task3", "task4", "task5"],
  "tasksSurvive": ["task1", "task2", "task3", "task4"],
  "jobsRemain": "2-3 sentences on what specific roles within this profession survive and why",
  "sources": [
    {"name": "O*NET", "detail": "specific finding about this occupation"},
    {"name": "BLS", "detail": "specific projection or employment statistic"},
    {"name": "Brookings", "detail": "AI exposure finding"},
    {"name": "Goldman Sachs / McKinsey", "detail": "relevant automation research finding"},
    {"name": "Landors Curve Era", "detail": "which era this profession falls in and why"}
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
        messages: [{ role: 'user', content: `Analyze displacement risk for: ${profession}` }]
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
        return res.status(500).json({ error: 'We could not process this profession. Please try again.' });
      }
    }
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
