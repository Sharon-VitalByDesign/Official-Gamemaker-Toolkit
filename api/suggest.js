import Anthropic from '@anthropic-ai/sdk'

const prompts = {
  liveSignal: 'Return a three-part reading of the current arena: its specific condition, what that means for these learners, and one concrete thing the teacher should watch for.',
  lenses: 'Generate topic- and grade-specific content for all five fixed lenses: tension, role, stakes, surprise, and constraint.',
  concepts: 'Generate richly developed synthesized arena concepts based on the selected lenses. Use the full text of each selected lens, including both its provocation and its for-example content, not just the lens names. Each concept must feel as fully developed as a lens-specific suggestion: specific central tension, vivid roles, concrete learner action, and a strong explanation of why the design creates thinking. These are conditions, not lesson plans or activities.',
  lensSpecificConcept: 'Generate exactly 1 named arena concept built specifically around the provided seed lens example. Use that example as the core seed, alongside the teacher topic and grade level. The result should feel clearly different from the synthesized set and should still be a condition, not a lesson plan or activity.',
  moves: 'Generate 3-4 distinct implementations of the requested Design Move for this arena. Each must include a concrete action the teacher takes and must not repeat selected moves.',
  outputBrief: 'Synthesize a Gamemaker Design Brief. Include a coherent Arena Concept and exactly five sections aligned to conditions, constraints, consequential learner choices, observable evidence, and teacher intervention points. Finish with a warm, sharp Gamemaker note of no more than five sentences.',
}

const modelFor = type => ['concepts', 'lensSpecificConcept', 'outputBrief'].includes(type) ? 'claude-sonnet-4-6' : 'claude-haiku-4-5'
const maxTokensFor = type => type === 'outputBrief' ? 1800 : type === 'concepts' ? 1800 : type === 'lensSpecificConcept' ? 1200 : 900

function parseJSON(value) {
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  return JSON.parse(cleaned)
}

async function generateSingleConcept(anthropic, system, context, variantLabel, avoidNames = []) {
  const variantPrompt = `${prompts.concepts}

Generate exactly 1 concept for this variant: ${variantLabel}.
Make it meaningfully distinct from these already-generated concept names: ${JSON.stringify(avoidNames)}.
Lean into a different configuration of tension, roles, or decision structure than the previous concepts.

FULL ARENA CONTEXT:
${JSON.stringify(context)}

REQUIRED JSON SHAPE:
${JSON.stringify({ concept: { id: 'string', name: 'string', tension: 'string', roles: ['string'], action: 'string', rationale: 'string' } })}`

  const message = await anthropic.messages.create({
    model: modelFor('concepts'),
    max_tokens: 1200,
    system,
    messages: [{ role: 'user', content: variantPrompt }],
  })

  const raw = message.content.filter(item => item.type === 'text').map(item => item.text).join('\n')
  const parsed = parseJSON(raw)
  if (!parsed?.concept) throw new Error(`Missing concept payload for ${variantLabel}`)
  return parsed.concept
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ error: 'AI suggestions are not configured yet.' })

  const { type, context, schema } = req.body || {}
  if (!prompts[type] || !context || !schema) return res.status(400).json({ error: 'A known call type, full arena context, and response schema are required.' })

  const system = `You are the synthesis engine inside The Gamemaker's Toolkit. Respond to the teacher's actual arena and exact grade level. Never generate a lesson plan, worksheet, script, or materials list. When referring to learners, use the grade level as a descriptor such as "Grade 5 learners" or "Kindergarten learners," never as a quantity or grade band like "3-5 learners." When selected lens details are provided, treat the provocation text and the for-example text as binding creative inputs. Distinct lens combinations should produce meaningfully different arena concepts. For concept generation, depth matters: respond with vivid, concrete, teacher-ready arena descriptions rather than generic placeholders. Return only valid JSON matching the supplied schema—no markdown, preamble, or extra keys.`
  const prompt = `${prompts[type]}\n\nFULL ARENA CONTEXT:\n${JSON.stringify(context)}\n\nREQUIRED JSON SHAPE:\n${JSON.stringify(schema)}`

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    if (type === 'concepts') {
      const firstConcept = await generateSingleConcept(anthropic, system, context, 'Option A')
      const secondConcept = await generateSingleConcept(anthropic, system, context, 'Option B', [firstConcept.name])
      return res.status(200).json({ data: { concepts: [firstConcept, secondConcept] } })
    }
    const message = await anthropic.messages.create({ model: modelFor(type), max_tokens: maxTokensFor(type), system, messages: [{ role: 'user', content: prompt }] })
    const raw = message.content.filter(item => item.type === 'text').map(item => item.text).join('\n')
    return res.status(200).json({ data: parseJSON(raw) })
  } catch (error) {
    console.error('Gamemaker AI error', error)
    return res.status(502).json({ error: 'Something went sideways in the arena. Your settings are still safe.' })
  }
}
