export const maxDuration = 60;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { branch, code, militaryTitle, rank, yearsExp, certifications, clearance, resumeText, background, careerShiftPreference } = req.body;

  // ── CAREER SHIFT PREFERENCE ─────────────────────────────────────────────
  // Source weighting decides which evidence sources matter.
  // Transition distance decides how realistic the recommendation is for this user.
  const shift = careerShiftPreference || 'moderate';

  const MIL_SHIFT_RULES = {
    conservative: 'Recommend direct civilian equivalent roles first (low transitionDistance). Adjacent roles second. Do NOT recommend major reinvention paths (extreme distance) unless labeled as optional long-term options.',
    moderate:     'Recommend direct civilian equivalents and adjacent roles. Include some stretch paths (high distance) but label them. Avoid extreme reinvention as primary recommendations.',
    aggressive:   'Recommend across all transition distances. Clearly label high and extreme distance paths. A veteran wanting an aggressive pivot can see stretch paths ranked higher.',
    reinvention:  'All paths allowed. Even extreme reinvention paths are shown, but must be labeled: "Major Reinvention: Significant retraining required beyond military-to-civilian translation."'
  };
  const shiftRule = MIL_SHIFT_RULES[shift] || MIL_SHIFT_RULES.moderate;

  if (!branch && !code && !militaryTitle && !resumeText && !background) {
    return res.status(400).json({ error: 'Please provide at least your branch and occupation code or background.' });
  }

  const resume = (resumeText || background || '').slice(0, 6000);

  const system = `You are a military-to-civilian career transition expert with deep knowledge of:
- All US military branches, occupation codes (MOS, AFSC, NEC, Rating, SFSC), ranks, and roles
- BLS occupational data, SOC codes, median salaries, and job outlook projections
- Civilian hiring practices, credential translation, and skills mapping
- Future-proof career planning and AI displacement risk

Your job is to analyze a veteran's military background and produce a detailed, actionable civilian career transition plan.

CRITICAL JSON RULES:
- Respond ONLY with a valid JSON object, nothing else
- No markdown, no backticks, no preamble, no explanation outside the JSON
- Do NOT use contractions or apostrophes anywhere
- All string values must be properly escaped

Respond with exactly this JSON structure:
{
  "headline": "4-6 word compelling headline for their transition (e.g. 'Combat Leader to Operations Executive')",
  "summary": "3-4 sentence transition summary explaining how their military background translates to civilian opportunity. Specific, grounded, and optimistic.",
  "civilianMatches": [
    {
      "title": "Civilian Job Title",
      "socCode": "XX-XXXX",
      "matchStrength": "High",
      "whyItFits": "2-3 sentences on why this role fits their military background specifically",
      "bls": {
        "medianSalary": 75000,
        "jobOutlook": "8% growth (faster than average)"
      },
      "automationRisk": "Low",
      "futureProofScore": 82
    }
  ],
  "transferableSkills": ["Skill 1", "Skill 2", "Skill 3", "Skill 4", "Skill 5", "Skill 6", "Skill 7", "Skill 8"],
  "credentialGaps": [
    {
      "gap": "Credential or certification name",
      "why": "Why civilians expect this",
      "timeToGet": "Estimated time/cost",
      "priority": "High"
    }
  ],
  "resumeSuggestions": [
    "Specific resume tip for translating military experience to civilian language",
    "Another tip"
  ],
  "futureProofOptions": [
    {
      "path": "Career path name",
      "why": "Why this is future-proof given AI/automation trends"
    }
  ],
  "regionalNote": "Brief note on job market for their background (general since location unknown)",
  "nextSteps": ["Immediate action 1", "Action 2", "Action 3", "Action 4"],
  "resumeHandoffSummary": "2-3 sentence summary of their military background written in civilian-friendly language, suitable for a resume objective or LinkedIn summary."
}

CAREER SHIFT PREFERENCE: ${shift}
${shiftRule}

Each civilianMatch must include a "transitionDistance" field: low | medium | high | extreme
Matches with high or extreme distance must include a "pathLabel" field explaining why it is a stretch or reinvention path.
Group your civilianMatches by preference: best adjacent paths first, then moderate stretch, then aggressive, then reinvention — unless the user selected reinvention, in which case ambitious paths can appear higher.

Provide 4-5 civilianMatches, 8+ transferableSkills, 3-4 credentialGaps, 4-5 resumeSuggestions, 3 futureProofOptions, 4 nextSteps.
futureProofScore is 0-100 (higher = more future-proof vs AI/automation).
matchStrength is one of: High, Medium-High, Medium.`;

  const userMsg = `Please analyze this military background and generate a full civilian transition plan.

BRANCH: ${branch || 'Not specified'}
OCCUPATION CODE: ${code || 'Not specified'}
JOB TITLE: ${militaryTitle || 'Not specified'}
RANK / LEADERSHIP LEVEL: ${rank || 'Not specified'}
YEARS OF SERVICE: ${yearsExp || 'Not specified'}
SECURITY CLEARANCE: ${clearance || 'None'}
CERTIFICATIONS / TRAINING: ${certifications || 'None listed'}
${resume ? `\nRESUME / BACKGROUND:\n${resume}` : ''}

Generate the full transition analysis now.`;

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
        max_tokens: 4000,
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

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function robustParse(txt) {
  let clean = txt.replace(/```json|```/g, '').trim();
  const s = clean.indexOf('{');
  const e = clean.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('No JSON found in response');
  let j = clean.slice(s, e + 1);
  j = j.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '');
  j = j.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
  j = j.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"');
  try { return JSON.parse(j); } catch (e1) {}
  try {
    let fixed = j.replace(/"((?:[^"\\]|\\.)*)"/g, (m, inner) =>
      '"' + inner.replace(/\n/g, ' ').replace(/\r/g, '').replace(/\t/g, ' ') + '"');
    return JSON.parse(fixed);
  } catch (e2) { throw new Error('Parse failed: ' + e2.message); }
}
