export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let { profession, preset, sources, sourceMode, singleSource } = req.body;
  if (!profession) return res.status(400).json({ error: 'Profession is required' });
  profession = profession.trim();

  const mode = sourceMode === 'single' ? 'single' : 'preset';
  const presetLabel = preset || 'balanced';

  const presetContext = {
    balanced:     'Use all available sources equally: O*NET for task detail, BLS for employment projections, Brookings for automation exposure, Goldman Sachs and McKinsey for AI displacement modeling, WEF for global trends, LinkedIn Workforce Reports for current hiring signals, and OECD for international context.',
    conservative: 'Weight this analysis toward BLS and O*NET data only. Be conservative in displacement estimates. Government data moves slowly and tends to underestimate disruption speed, so reflect that caution in the output.',
    disruption:   'Weight this analysis toward McKinsey, Goldman Sachs, and Brookings research. These sources tend to be more aggressive on automation timelines and AI displacement. Reflect that in a more urgent displacement assessment.',
    emerging:     'Weight this analysis toward Brookings, WEF, LinkedIn Workforce Reports, and OECD. Focus on forward-looking trends, international patterns, and what is currently being hired for. Emphasize emerging adjacent opportunities.',
  }[presetLabel] || '';

  const singleSourceDescriptions = {
    'onet':          { name: 'O*NET',         context: 'You are viewing this profession through the O*NET lens only. Focus exclusively on occupational tasks, required skills and knowledge, training requirements, work activities, and related occupations as defined by O*NET classifications. Note what this source emphasizes and what it does not capture.' },
    'bls':           { name: 'BLS',           context: 'You are viewing this profession through the BLS lens only. Focus exclusively on wages, employment levels, 10-year job outlook projections, industry employment distribution, and broad labor-market baselines as reported by the Bureau of Labor Statistics. Note what this source emphasizes and what it does not capture.' },
    'brookings':     { name: 'Brookings',     context: 'You are viewing this profession through the Brookings Institution lens only. Focus exclusively on structural labor-market research, automation exposure estimates, regional change patterns, education and credential requirements, and economic transitions as studied by Brookings researchers. Note what this source emphasizes and what it does not capture.' },
    'mckinsey':      { name: 'McKinsey',      context: 'You are viewing this profession through the McKinsey Global Institute lens only. Focus exclusively on business transformation, workforce shifts, automation adoption rates, and large-scale industry change as analyzed in McKinsey research. Note what this source emphasizes and what it does not capture.' },
    'goldman':       { name: 'Goldman Sachs', context: 'You are viewing this profession through the Goldman Sachs research lens only. Focus exclusively on macroeconomic AI exposure estimates, productivity implications, automation pressure on employment, and broad labor-market implications as analyzed by Goldman Sachs economists. Note what this source emphasizes and what it does not capture.' },
    'wef':           { name: 'WEF / OECD',   context: 'You are viewing this profession through the WEF and OECD lens only. Focus exclusively on global workforce trends, skill shifts, policy context, international labor-market signals, and cross-country comparisons as reported by the World Economic Forum and OECD. Note what this source emphasizes and what it does not capture.' },
    'currentsignals':{ name: 'Current Signals', context: 'You are viewing this profession through a Current Signals lens only. Focus exclusively on newer role language appearing in job postings, emerging skill demand, shifting employer language, recently published observations, and human-reviewed market signals. Note what this source emphasizes and what it does not capture.' },
  };

  let systemPrompt;

  if (mode === 'single' && singleSource) {
    const src = singleSourceDescriptions[singleSource] || { name: singleSource, context: 'Focus on this single source lens and note what it emphasizes and what it may miss.' };
    const sourceList = [src.name];

    systemPrompt = `You are the Landors Curve Job Displacement Analyzer running in Single Source View mode.

SINGLE SOURCE LENS: ${src.name}
${src.context}

This is intentionally narrower than the curated blended presets. The goal is to show what one source lens emphasizes and what it may miss. Make this clear in the analysis and presetNote fields.

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
    {"key": "BLS 10-yr employment outlook", "val": "specific percent or number if available via this lens, or note limitation"},
    {"key": "Automation susceptibility", "val": "value from this source lens"},
    {"key": "AI exposure index", "val": "low or moderate or high plus detail if available"},
    {"key": "Current US employment", "val": "approx number if available via this lens"},
    {"key": "Median annual wage", "val": "dollar figure if available via this lens"},
    {"key": "Landors Curve timeline", "val": "estimated years to significant displacement based on this lens"}
  ],
  "landorIndex": {
    "historicalSpeed": integer 0-100,
    "currentAISpeed": integer 0-100,
    "adaptationDifficulty": integer 0-100
  },
  "sourceLensName": "${src.name}",
  "sourceLensEmphasis": "2 sentences on what ${src.name} emphasizes about this profession. No apostrophes.",
  "sourceLensGaps": "1-2 sentences on what ${src.name} may miss or underrepresent for this profession. No apostrophes.",
  "analysis": "3-4 sentences strictly from the ${src.name} lens. No apostrophes or contractions.",
  "tasksAtRisk": ["task1", "task2", "task3", "task4", "task5"],
  "tasksSurvive": ["task1", "task2", "task3", "task4"],
  "jobsRemain": "2-3 sentences from the ${src.name} lens perspective. No apostrophes or contractions.",
  "sources": [
    {"name": "${src.name}", "detail": "specific finding from this source lens"}
  ],
  "presetNote": "One sentence explaining that this is a Single Source View using ${src.name}, that it is intentionally narrower than blended presets, and what the user should do next for a fuller picture. No apostrophes."
}`;
  } else {
    const sourceList = sources && sources.length ? sources : ['O*NET','BLS','Brookings','Goldman Sachs','McKinsey','WEF','LinkedIn Workforce Reports','OECD'];

    systemPrompt = `You are the Landors Curve Job Displacement Analyzer. Analyze any profession or job title, even if misspelled or informal.

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
  }

  try {
    const userMsg = mode === 'single'
      ? `Analyze this profession using Single Source View (${singleSourceDescriptions[singleSource]?.name || singleSource} lens only): ${profession}`
      : `Analyze this profession using the ${presetLabel} source preset: ${profession}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1600,
        system: systemPrompt,
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
    result.activePreset = presetLabel;
    result.sourceMode = mode;
    result.singleSource = singleSource || null;
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
