export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { background, years, intent, mode, direction, industry, risk, timeHorizon,
          target, hoursPerWeek, budget, goal, caImport, careerShiftPreference } = req.body;

  // ── CAREER SHIFT PREFERENCE ─────────────────────────────────────────────
  // Source weighting decides which evidence sources matter.
  // Transition distance decides how realistic the recommendation is for this user.
  const shift = careerShiftPreference || 'moderate';

  const SHIFT_ROLE_RULES = {
    conservative: 'Recommend roles with transitionDistance "low" or "medium" only. Label any "high" distance role as a Stretch Path. Do NOT recommend "extreme" distance roles unless they directly match the user's stated background.',
    moderate:     'Recommend roles up to transitionDistance "high". Label "extreme" paths clearly as Reinvention Paths requiring significant retraining.',
    aggressive:   'Recommend roles across all transitionDistance levels. "High" and "extreme" paths must be labeled as stretch or reinvention paths but can rank higher.',
    reinvention:  'All transitionDistance levels allowed. Even extreme pivots must be labeled honestly. User has chosen major change — honor that with ambitious but honest output.'
  };
  const shiftRule = SHIFT_ROLE_RULES[shift] || SHIFT_ROLE_RULES.moderate;

  if (!background) return res.status(400).json({ error: 'Background is required' });
  if (!mode) return res.status(400).json({ error: 'Mode is required' });

  const isCM = mode === 'cm';

  // Build Career Assessment import context if available
  let caContext = '';
  if (caImport && caImport.selectedDirection) {
    const roles = (caImport.roles||[]).slice(0,6).map(r => `${r.title} (${r.expertise}, ~${r.estimatedHours||0} hrs)`).join(', ');
    const strengths = (caImport.crossoverStrengths||[]).slice(0,4).join(', ');
    caContext = `\n\nCARRIED OVER FROM CAREER ASSESSMENT:\nSelected direction: ${caImport.selectedDirection}\n${roles ? 'Roles and experience: ' + roles : ''}\n${strengths ? 'Crossover strengths: ' + strengths : ''}\n${caImport.insight && caImport.insight !== '-' ? 'Assessment insight: ' + caImport.insight : ''}\nRarity index: ${caImport.rarityIndex||''}\n\nUse this Career Assessment data to enrich the analysis. It is more detailed than a simple background description.`;
  }

  const system = isCM
    ? `You are the Pivot Tool in Career Movement mode for Landors Curve. Your job is to help someone understand which roles they may already be close to based on their existing experience — without requiring major new study, certifications, or a full career reset.

CAREER SHIFT PREFERENCE: ${shift}
${shiftRule}

Each role in your output must include a "transitionDistance" field: low | medium | high | extreme.
Roles with high or extreme transitionDistance must include a "pathLabel" field: "Stretch Path" or "Reinvention Path" with a brief reason.

CRITICAL RULES:
- This tool does not replace a job board. Do not list hundreds of jobs.
- Give direction, role categories, job title search terms, and skill gaps — not job listings.
- Be honest about fit level. High means they could apply now with minimal prep. Medium means light reframing or 1-3 months of prep. Long-term means more significant work needed.
- The target user is currently employed but sees the writing on the wall. Speak to that person.
- Do NOT use apostrophes or contractions anywhere in output text.
- Respond ONLY with valid JSON. No markdown. No backticks.

Risk preference: ${risk || 'moderate pivot'}
Time horizon: ${timeHorizon || '6 months'}
Direction interest: ${direction || 'not specified'}
Industry interest: ${industry || 'not specified'}
Intent: ${intent || 'not specified'}

Respond with exactly this JSON:
{
  "headline": "Short 4-6 word headline",
  "summary": "2-3 sentences on what this person looks like as a candidate right now.",
  "snapshot": "2-3 sentences describing their background and current position in the market.",
  "strengths": ["transferable strength", "another", "another", "another", "another"],
  "roles": [
    {
      "title": "Role Name",
      "why": "1-2 sentences on why their background fits",
      "fit": "High, Medium, or Long-term",
      "training": "None, Light, Moderate, or Significant",
      "emphasize": "What experience to highlight for this role",
      "missing": "What skills or experience are thin or missing",
      "searchTitles": ["Job title to search", "Another title", "Another"]
    }
  ],
  "marketSignal": "2-3 sentences on what employers in these areas are currently asking for. Skills, keywords, patterns in demand. Do not list jobs.",
  "positioning": "2-3 sentences on how this person should reframe their resume language for these roles.",
  "thirtyDays": [
    "Specific action step",
    "Another step",
    "Another step",
    "Another step",
    "Another step"
  ],
  "insight": "2-3 sentences of honest, direct, encouraging personal insight for this person. No apostrophes."
}

Provide exactly 5 strengths and 4 roles. Make the roles varied — at least one obvious adjacent role, one less obvious but logical, one emerging role.`

    : `You are the Pivot Tool in Learning Pivot mode for Landors Curve. Your job is to help someone build a realistic study, certification, or portfolio plan for a career transition while maintaining their current work schedule.

CAREER SHIFT PREFERENCE: ${shift}
${shiftRule}

The learning plan's target role must reflect the user's shift preference. If conservative, prioritize adjacent roles that leverage existing skills. If reinvention, clearly label the gap between current experience and target role.

CRITICAL RULES:
- Be realistic about timelines given the available study hours per week.
- Give specific, actionable learning resources — not vague advice.
- The free learning path must be genuinely free.
- Certification costs should reflect actual market pricing.
- Do NOT use apostrophes or contractions anywhere in output text.
- Respond ONLY with valid JSON. No markdown. No backticks.

Target role or direction: ${target || 'not specified — suggest based on background'}
Available study hours per week: ${hoursPerWeek || 8}
Budget preference: ${budget || 'low-cost'}
Learning goal: ${goal || 'get hired'}
Intent: ${intent || 'not specified'}

Respond with exactly this JSON:
{
  "headline": "Short 4-6 word headline",
  "summary": "2-3 sentences on this person and the transition they are exploring.",
  "snapshot": "2-3 sentences describing their starting point.",
  "strengths": ["transferable strength", "another", "another", "another", "another"],
  "targetDirection": "2-3 sentences on the direction they are heading and why it makes sense from their background.",
  "skillGaps": ["skill to develop", "another", "another", "another", "another"],
  "pathways": {
    "free": {
      "resources": ["Specific free resource 1", "Resource 2", "Resource 3", "Resource 4"],
      "timeline": "X months at Y hrs per week",
      "cost": "$0"
    },
    "cert": {
      "name": "Specific certification name",
      "provider": "Provider and approximate cost",
      "timeline": "X months at Y hrs per week",
      "cost": "$XXX"
    },
    "degree": {
      "name": "Degree or licensed program name",
      "provider": "Type of institution",
      "timeline": "X years",
      "cost": "$XX,XXX estimated"
    }
  },
  "timeline": [
    {"period": "Right Now", "heading": "Start Here", "body": "Specific immediate action at ${hoursPerWeek} hours per week."},
    {"period": "3 to 6 Months", "heading": "Build Credential", "body": "What to complete in this phase."},
    {"period": "1 to 2 Years", "heading": "Operating in the Role", "body": "What success looks like at this stage."}
  ],
  "portfolioProject": "A specific project this person could build to demonstrate readiness for the target role. Be concrete.",
  "thirtyDays": [
    "Specific first step",
    "Another step",
    "Another step",
    "Another step",
    "Another step"
  ],
  "insight": "2-3 sentences of honest, direct, encouraging personal insight. No apostrophes."
}`;

  const userMsg = `${isCM ? 'Career Movement' : 'Learning Pivot'} mode analysis for:

Background / Resume:
${background}

${years ? 'Years of experience: ' + years : ''}`;

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
        max_tokens: 2500,
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
