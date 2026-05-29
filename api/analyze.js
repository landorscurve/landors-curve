export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let { profession, preset, sources, careerShiftPreference } = req.body;

  // ── CAREER SHIFT PREFERENCE ─────────────────────────────────────────────
  // Source weighting (preset) decides which evidence sources matter.
  // Transition distance decides how realistic the recommendation is for this user.
  // These are separate scoring layers — do not conflate them.
  const shift = careerShiftPreference || 'conservative';

  const SHIFT_INSTRUCTIONS = {
    conservative: `CAREER SHIFT PREFERENCE: Conservative.
- Prioritize roles closely adjacent to the user's existing experience.
- transitionDistance must be "low" or "medium" for top recommendations.
- If you suggest a "high" or "extreme" distance role, you MUST label it: "Stretch Path: This option requires significant retraining and is not the most direct next step."
- Do NOT rank high-demand jobs above realistic adjacent jobs simply because of market demand.`,

    moderate: `CAREER SHIFT PREFERENCE: Moderate.
- Prioritize related roles that may require some retraining or certification.
- transitionDistance "low", "medium", and some "high" paths are acceptable.
- Label any "extreme" paths clearly: "Reinvention Path: This option has strong market demand but requires significant retraining."`,

    aggressive: `CAREER SHIFT PREFERENCE: Aggressive.
- Allow larger pivots when the upside is strong.
- All transitionDistance levels are acceptable, but "high" and "extreme" paths must be clearly labeled as stretch paths.
- High laborMarketScore CAN outweigh transitionDistance for aggressive users, but label the path.`,

    reinvention: `CAREER SHIFT PREFERENCE: Reinvention.
- Allow major career changes, new industries, new credentials, and deep technical upskilling.
- All transitionDistance levels are shown. Major reinvention paths must still be labeled: "Reinvention Path: Major retraining required."
- This user has chosen to make a significant change — honor that with ambitious but honest recommendations.`
  };

  const shiftContext = SHIFT_INSTRUCTIONS[shift] || SHIFT_INSTRUCTIONS.conservative;

  // ── TRANSITION DISTANCE DEFINITIONS ──────────────────────────────────────
  // low:     Same or closely related field. Existing experience carries directly.
  // medium:  Different role/industry, but strong transferable skills exist.
  // high:    Significant retraining, credentialing, or repositioning required.
  // extreme: Major reinvention. Existing experience helps only indirectly.
  if (!profession) return res.status(400).json({ error: 'Profession is required' });
  profession = profession.trim();

  const isMilitary = preset === 'military';
  const militaryContext = isMilitary ? `
MILITARY TRANSITION CONTEXT: This analysis is for a transitioning service member, veteran, or military spouse. Emphasize:
- O*NET military occupational classification crosswalk matches
- Civilian job titles that commonly receive military veterans
- BLS occupational outlook and wage data for those civilian roles
- Credential and certification gaps between military and civilian requirements
- Government contractor pathways (defense, federal, intelligence)
- High-transferability fields: cybersecurity, logistics, healthcare, operations, leadership, project management
- Future-proof career stability and automation resistance
- Use civilian language. Do not use military jargon in your output.
` : '';

  const system = `You are the Landors Curve Job Displacement Analyzer. Analyze any profession or job title entered, even if misspelled or informal — interpret it as the closest real profession and proceed.${militaryContext}

${shiftContext}

TRANSITION DISTANCE SCORING:
When you generate any career recommendation or pivot suggestion, assign each role a transitionDistance:
- low: Same or closely related field. Existing experience carries directly.
- medium: Different role/industry but strong transferable skills exist.
- high: Significant retraining, credentialing, or repositioning required.
- extreme: Major reinvention. Existing experience helps only indirectly.

SCORING RULE: A high laborMarketScore must NOT override a poor transitionDistance score unless the user selected aggressive or reinvention. Rank accordingly.

CRITICAL JSON RULES:
- Respond ONLY with a valid JSON object, nothing else
- Do NOT use contractions: write "do not" not "don't", "you will" not "you'll", "it is" not "it's"  
- Do NOT use apostrophes anywhere in response text
- Use only straight double quotes for JSON strings
- No markdown, no backticks, no preamble

{
  "profession": "clean profession name",
  "riskScore": integer 0-100,
  "riskLevel": "CRITICAL or HIGH or MEDIUM or LOW",
  "riskColor": "critical or high or medium or low",
  "meterColor": "#FF4757 for critical, #FF6B35 for high, #FFD32A for medium, #2ED573 for low",
  "meterDesc": "short one-line summary of risk position on the curve, no apostrophes",
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
  "analysis": "3-4 sentences. No apostrophes or contractions.",
  "tasksAtRisk": ["task1", "task2", "task3", "task4", "task5"],
  "tasksSurvive": ["task1", "task2", "task3", "task4"],
  "jobsRemain": "2-3 sentences. No apostrophes or contractions.",
  "sources": [
    {"name": "O*NET", "detail": "specific finding"},
    {"name": "BLS", "detail": "specific projection"},
    {"name": "Brookings", "detail": "AI exposure finding"},
    {"name": "Goldman Sachs / McKinsey", "detail": "relevant finding"},
    {"name": "Landors Curve Era", "detail": "which era and why"}
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
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
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
    const result = robustParse(txt);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ 
      error: 'We had trouble analyzing that profession. Please try again.' 
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
    let fixed = j.replace(/"((?:[^"\\]|\\.)*)"/g, (match, inner) => {
      return '"' + inner.replace(/\n/g,' ').replace(/\r/g,' ').replace(/\t/g,' ') + '"';
    });
    return JSON.parse(fixed);
  } catch(e2) {}
  try {
    let fixed = j.replace(/:\s*"([^"\\]*)"/g, (match, inner) => {
      return ': "' + inner.replace(/[\x00-\x1F\x7F]/g,'').replace(/'/g,'').trim() + '"';
    });
    return JSON.parse(fixed);
  } catch(e3) { throw new Error('Parse failed'); }
}
