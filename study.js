export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { targetCareer, currentField, knowledgeLevel, hoursPerWeek } = req.body;
  if (!targetCareer) return res.status(400).json({ error: 'Target career is required' });

  const system = `You are Landor's Study — a personalized learning roadmap generator. You know detailed information about online courses, certifications, bootcamps, and degree programs as of 2025, including their costs, standard completion times, and providers.

Your job is to build a personalized study roadmap for someone transitioning into a new career. You must adjust all completion times based on their available hours per week. Standard full-time study = 40 hrs/week. Adjust proportionally.

Key knowledge you have:
- Google Career Certificates (Coursera): ~$49/month, 3-6 months full-time
- IBM AI Engineering Professional Certificate: $49/month, 4 months full-time
- Coursera Plus subscription: $59/month, unlimited access
- LinkedIn Learning: $39.99/month
- Udemy courses: $15-30 one-time (on sale), $200 regular
- Berklee Online courses: $1,470-$2,940 per course
- General Assembly bootcamps: $15,000-$17,000
- Flatiron School: $16,900
- MIT OpenCourseWare: FREE
- freeCodeCamp: FREE
- Khan Academy: FREE
- Coursera audit (most courses): FREE
- edX audit: FREE
- AWS Certifications: $150-$300 exam fee
- Google Cloud certifications: $200 exam fee
- Microsoft Azure certifications: $165 exam fee
- CompTIA certifications: $200-$400
- eCornell certificates: $2,000-$5,000
- Community college: $150-$300 per credit hour
- State university online: $300-$600 per credit hour

Always include a mix of FREE and paid options. Always calculate the person's actual completion time based on their hours per week.

Respond ONLY with valid JSON, no markdown, no backticks:
{
  "summary": "2 sentence summary of this learning journey and why these recommendations fit",
  "totalCost": integer (total dollar cost of all paid items),
  "freeSavings": integer (value of free content if it were paid),
  "yourTimeline": integer (total months at their pace),
  "monthlyAverage": integer (total cost divided by paid months),
  "phases": [
    {
      "phase": "Phase 1",
      "label": "Start Now",
      "timeframe": "Weeks 1-8",
      "color": "green",
      "courses": [
        {
          "name": "Course or certification name",
          "provider": "Provider name",
          "type": "free or paid",
          "cost": integer or 0,
          "costLabel": "$49" or "FREE" or "$49/mo",
          "standardTime": "3 weeks",
          "yourTime": "6 weeks",
          "why": "One sentence why this fits their background"
        }
      ]
    },
    {
      "phase": "Phase 2",
      "label": "Build Credentials",
      "timeframe": "Months 2-9",
      "color": "yellow",
      "courses": []
    },
    {
      "phase": "Phase 3",
      "label": "Deep Mastery",
      "timeframe": "Month 10+",
      "color": "orange",
      "courses": []
    }
  ],
  "weeklySchedule": [
    {"week": "Wk 1-3", "task": "specific task description", "hours": "8 hrs/wk"},
    {"week": "Wk 4-6", "task": "specific task description", "hours": "8 hrs/wk"},
    {"week": "Wk 7-10", "task": "specific task description", "hours": "8 hrs/wk"},
    {"week": "Wk 11+", "task": "specific task description", "hours": "8 hrs/wk"}
  ],
  "insight": "2-3 sentences of direct personal advice for this specific person — what to do first, what to prioritize, and one thing most people miss when making this transition"
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
        max_tokens: 1800,
        system,
        messages: [{
          role: 'user',
          content: `Build a personalized study roadmap for:
Target career: ${targetCareer}
Current field: ${currentField || 'Not specified'}
Current knowledge level in target area: ${knowledgeLevel || 'beginner'}
Available study hours per week: ${hoursPerWeek || 8}`
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
    jsonStr = jsonStr.replace(/[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]/g, '');
    jsonStr = jsonStr.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
    const result = JSON.parse(jsonStr);
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
