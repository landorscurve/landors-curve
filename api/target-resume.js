export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { resumeText, jobTitle, jobDesc, reader, industry, emphasis } = req.body;
  if (!resumeText) return res.status(400).json({ error: 'Resume text is required' });

  const readerContext = reader ? `The resume will be read by a ${reader}.` : '';
  const industryContext = industry ? `The industry is ${industry}.` : '';
  const emphasisContext = emphasis ? `The applicant wants to emphasize: ${emphasis}` : '';

  const system = `You are Target Resume, a tool that rewrites and optimizes resumes for specific job applications. Your job is to help people surface and reframe their real experience so it reads as clearly relevant to the target role.

CRITICAL RULES:
- Never fabricate experience, credentials, or skills the person does not have
- Only reframe and sharpen what is already there
- Be honest about gaps — do not ignore them
- Do NOT use apostrophes or contractions anywhere in output text
- Respond ONLY with valid JSON, no markdown, no backticks

${readerContext} ${industryContext} ${emphasisContext}

Respond with exactly this JSON structure:
{
  "headline": "Short 4-6 word headline for this resume output",
  "matches": ["skill or experience that directly matches", "another match", "another match", "another", "another", "another"],
  "reframes": [
    {
      "before": "How they currently describe this",
      "after": "How to reframe it for this role",
      "why": "One sentence on why this framing works better for this target"
    }
  ],
  "gaps": [
    "Honest gap or thing to address before applying",
    "Another gap"
  ],
  "summary": "A 3-4 sentence professional summary written for this specific role and reader. No apostrophes. No contractions. First person implied but no I statements.",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5", "keyword6", "keyword7", "keyword8", "keyword9", "keyword10"],
  "resumeSections": [
    {
      "title": "PROFESSIONAL SUMMARY",
      "content": "The optimized summary paragraph"
    },
    {
      "title": "CORE COMPETENCIES",
      "content": "Relevant skills formatted as a clean list"
    },
    {
      "title": "PROFESSIONAL EXPERIENCE",
      "content": "Rewritten experience section with optimized bullet points and language"
    },
    {
      "title": "EDUCATION AND CREDENTIALS",
      "content": "Education and relevant certifications"
    },
    {
      "title": "NOTABLE ACHIEVEMENTS",
      "content": "Key achievements relevant to this target role"
    }
  ]
}

Provide 6 matches, 4-5 reframes, 2-3 gaps, 10 keywords, and a complete 5-section resume. Make the experience section detailed with specific bullet points rewritten for the target role.`;

  const userMsg = `Please optimize this resume for the target role.

CURRENT RESUME:
${resumeText}

TARGET ROLE:
${jobTitle || 'Not specified'}

JOB DESCRIPTION:
${jobDesc || 'Not provided — use the job title to infer requirements'}`;

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
        max_tokens: 3000,
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
