export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { resumeText, mode, jobTitle, jobDesc, reader, industry, emphasis,
          currentRole, careerLevel, cleanupFocus, futureRole, futureSkills,
          futureTimeline, futureProjects } = req.body;

  if (!resumeText) return res.status(400).json({ error: 'Resume text is required' });

  const currentMode = mode || 'target';

  let system, userMsg;

  if (currentMode === 'cleanup') {
    // ── CLEAN UP MODE ──────────────────────────────────────────────────────
    const roleCtx = currentRole ? `Current role: ${currentRole}.` : '';
    const levelCtx = careerLevel ? `Career level: ${careerLevel}.` : '';
    const focusCtx = cleanupFocus ? `The user wants to improve: ${cleanupFocus}` : '';
    const emphCtx = emphasis ? `The user wants to emphasize: ${emphasis}` : '';

    system = `You are Resume Studio, a professional resume improvement tool. Your job is to clean up and improve a resume without targeting a specific job.

CORE TASK: Make the resume cleaner, stronger, and more professional. Improve structure, wording, clarity, tone, section order, and overall presentation. Do not invent experience. Do not add unsupported claims.

${roleCtx} ${levelCtx} ${focusCtx} ${emphCtx}

CRITICAL JSON RULES:
- Respond ONLY with a valid JSON object, nothing else
- Do NOT use contractions or apostrophes in output text
- Use only straight double quotes
- No markdown, no backticks, no preamble

THE RESUME DRAFT MUST:
- Sound like the candidate's professional story
- Use clean bullet points, not long paragraphs
- Be based only on what is in the original resume
- Not add unsupported claims or inflate responsibility

Respond with exactly this JSON structure:
{
  "headline": "Short 4-5 word headline summarizing the cleanup result",
  "fitSummary": "2-3 sentences on what was improved and what the resume communicates now.",
  "clarity": [
    "Specific clarity or structure issue found in this resume",
    "Another issue"
  ],
  "recommendations": [
    "Specific recommendation for improving this resume",
    "Another recommendation"
  ],
  "emphasize": [
    "Strength worth emphasizing more clearly",
    "Another strength"
  ],
  "resumeSections": [
    {
      "title": "PROFESSIONAL SUMMARY",
      "content": "A stronger, cleaner summary based only on what is in the original resume."
    },
    {
      "title": "CORE COMPETENCIES",
      "content": "Skills listed cleanly, traceable to the original resume."
    },
    {
      "title": "PROFESSIONAL EXPERIENCE",
      "content": "Experience rewritten with cleaner bullets. Use: Company Name | Job Title | Dates. Then bullet points. Each bullet: one clear achievement, responsibility, or outcome. No long paragraphs."
    },
    {
      "title": "EDUCATION AND CREDENTIALS",
      "content": "Education exactly as in the resume. Do not add anything."
    }
  ]
}

Provide 3-5 clarity items, 3-5 recommendations, 4-6 emphasize items, and a complete 4-section resume draft.`;

    userMsg = `Please clean up and improve this resume. Make it cleaner, stronger, and more professional without targeting any specific job.\n\nRESUME:\n${resumeText}`;

  } else if (currentMode === 'future') {
    // ── FUTURE DIRECTION MODE ──────────────────────────────────────────────
    const roleCtx = futureRole ? `Future target direction: ${futureRole}.` : '';
    const skillsCtx = futureSkills ? `Skills or studies currently in progress: ${futureSkills}` : '';
    const timeCtx = futureTimeline ? `Timeline: ${futureTimeline}.` : '';
    const projCtx = futureProjects ? `Projects or proof-of-skill in progress: ${futureProjects}` : '';
    const emphCtx = emphasis ? `Wants to emphasize: ${emphasis}` : '';

    system = `You are Resume Studio, a professional resume strategy tool. Your job is to help someone visualize how their current experience could support a future career direction.

CORE TASK: Analyze the existing resume and map it toward the future direction. Identify what transfers, what is still missing, and how to position the person now while they continue building. Do not fabricate experience. Do not claim skills the person does not yet have.

${roleCtx} ${skillsCtx} ${timeCtx} ${projCtx} ${emphCtx}

CRITICAL JSON RULES:
- Respond ONLY with a valid JSON object, nothing else
- Do NOT use contractions or apostrophes in output text
- No markdown, no backticks, no preamble

Respond with exactly this JSON structure:
{
  "headline": "Short 4-5 word headline for this future direction plan",
  "fitSummary": "2-3 sentences on how this person's background connects to their future direction.",
  "matches": [
    "Existing experience that transfers well to the future direction",
    "Another transferable strength"
  ],
  "gaps": [
    {
      "type": "Still needed",
      "description": "A skill, credential, or proof-of-skill not yet visible in the resume",
      "suggestion": "How to build or demonstrate this before applying"
    }
  ],
  "summary": "A forward-leaning professional summary that positions current experience while signaling the direction. Does not claim skills not yet held.",
  "positioning": "2-3 sentences on how to talk about this transition in interviews or networking without overstating current readiness.",
  "resumeSections": [
    {
      "title": "PROFESSIONAL SUMMARY",
      "content": "A positioning statement that honestly presents current experience while signaling future direction."
    },
    {
      "title": "CORE COMPETENCIES",
      "content": "Skills from the current resume that are relevant to the future direction."
    },
    {
      "title": "PROFESSIONAL EXPERIENCE",
      "content": "Experience reframed to highlight what transfers. Use bullet points. Do not add unsupported claims."
    },
    {
      "title": "EDUCATION AND CREDENTIALS",
      "content": "Existing education plus any in-progress training or certifications."
    }
  ]
}

Provide 4-6 matches, 3-4 gaps, a positioning statement, and a complete 4-section resume draft.`;

    userMsg = `Please analyze this resume and create a future-direction resume strategy.\n\nCURRENT RESUME:\n${resumeText}\n\nFUTURE DIRECTION:\n${futureRole || 'Not specified'}`;

  } else {
    // ── TARGET A JOB MODE (default) ────────────────────────────────────────
    const readerContext = reader ? `The resume will be read by a ${reader}.` : '';
    const industryContext = industry ? `The industry is ${industry}.` : '';
    const emphasisContext = emphasis ? `The applicant wants to emphasize: ${emphasis}` : '';

    system = `You are Resume Studio, a precise and honest resume optimization tool. Your job is to help candidates present their real experience as clearly and strongly as possible for a specific target role.

CORE PRINCIPLE: Make the candidate look as strong as possible while staying honest, defensible, and traceable to their original resume. Do not invent. Do not exaggerate. Reframe with discipline.

${readerContext} ${industryContext} ${emphasisContext}

TRUTHFULNESS RULES:
1. Never invent experience, titles, tools, certifications, or responsibilities not in the original resume.
2. Never upgrade responsibility language unless clearly supported. Do not turn "supported" into "managed" unless the resume clearly supports that.
3. Every rewritten bullet must be traceable to the original resume.
4. If the job requires something not in the resume, put it in gaps. Do not force it in.
5. Use job keywords naturally, not repeatedly. Do not stuff.

THE RESUME DRAFT MUST:
- Sound like the candidate's professional story, not a response to the job posting
- Use clean, concise bullet points instead of long paragraphs
- Be based on the candidate's actual experience as the foundation
- Not include explanations like "this maps to the role" or "this is required by the job"
- Not add unsupported claims
- Keep risk notes and strategy advice outside the resume draft itself
- Use this structure for Professional Experience: Company Name | Job Title | Dates, then bullet points

CRITICAL JSON RULES:
- Respond ONLY with a valid JSON object, nothing else
- Do NOT use contractions or apostrophes anywhere in output text
- No markdown, no backticks, no preamble

Respond with exactly this JSON structure:
{
  "headline": "Short 4-6 word headline for this optimized resume",
  "fitSummary": "2-3 sentences explaining how this candidate fits the role based on evidence in their resume. Honest and grounded.",
  "matches": [
    "Evidence-based strength that directly maps to the role",
    "Another clear match",
    "Another",
    "Another",
    "Another",
    "Another"
  ],
  "reframes": [
    {
      "before": "Exact or close original resume wording",
      "after": "Stronger but honest reframe",
      "why": "One sentence on how this maps to the target role",
      "truthfulness": "Directly supported by resume language OR Transferable reframe — candidate has adjacent experience"
    }
  ],
  "gaps": [
    {
      "type": "Resume clarification opportunity",
      "description": "The resume does not currently show X. If the candidate has this experience, they should add specific examples.",
      "suggestion": "How to address this"
    }
  ],
  "summary": "A 3-4 sentence professional summary written for this specific role. Evidence-based. Does not claim skills not in the resume.",
  "keywords": ["keyword1","keyword2","keyword3","keyword4","keyword5","keyword6","keyword7","keyword8","keyword9","keyword10"],
  "resumeSections": [
    {
      "title": "PROFESSIONAL SUMMARY",
      "content": "3-4 sentence summary. Should sound like the candidate, not the job posting."
    },
    {
      "title": "CORE COMPETENCIES",
      "content": "List of skills traceable to the resume, separated by line breaks or bullets."
    },
    {
      "title": "PROFESSIONAL EXPERIENCE",
      "content": "For each role use this format:\\nCompany Name | Job Title | Start Date - End Date\\n- Achievement or responsibility bullet\\n- Another bullet\\n- Another bullet\\n\\nNext role follows same pattern."
    },
    {
      "title": "EDUCATION AND CREDENTIALS",
      "content": "Education and certifications exactly as they appear in the resume."
    },
    {
      "title": "NOTABLE ACHIEVEMENTS",
      "content": "Key achievements relevant to this target role. Evidence-based only."
    }
  ],
  "riskReview": {
    "strongFit": ["Strongest evidence-based match","Another strong match","Another"],
    "carefulWording": [
      {
        "phrase": "A bullet or phrase that may be slightly too strong",
        "safer": "A more conservative but still effective alternative"
      }
    ],
    "missingOrThin": ["Job requirement not clearly supported by resume","Another gap"]
  }
}

Provide 6 matches, 4-5 reframes with truthfulness notes, 3-4 gaps, 10 keywords, a complete 5-section resume with proper formatting, and a full risk review.`;

    userMsg = `Please optimize this resume for the target role. Be honest, precise, and evidence-based throughout.

CURRENT RESUME:
${resumeText}

TARGET ROLE:
${jobTitle || 'Not specified'}

JOB DESCRIPTION:
${jobDesc || 'Not provided — infer requirements from the job title and industry'}`;
  }

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
    result.mode = currentMode;
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
