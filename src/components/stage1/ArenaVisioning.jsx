import React, { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import lenses from '../../data/lenses.json'
import commonCore from '../../data/standards/commoncore.json'
import ngss from '../../data/standards/ngss.json'
import ncss from '../../data/standards/ncss.json'
import iste from '../../data/standards/iste.json'
import { arenaCopy } from '../../config/copy'
import { useAI } from '../../hooks/useAI'
import { buildArenaContext } from '../../utils/contextBuilder'
import { formatGradeDescriptor, gradeOptions } from '../../utils/grades'

const allStandards = [...commonCore, ...ngss, ...ncss, ...iste]

const observableOptions = [
  'Explaining cause and effect', 'Negotiating decisions', 'Defending choices with evidence',
  'Predicting consequences', 'Recognizing interdependence', 'Adapting when conditions change',
  'Revising an idea after feedback', 'Naming what information is still needed',
]

const downstreamVisionReset = {
  selectedLenses: [],
  lensContent: [],
  lensContentSignature: '',
  lensContentFallback: false,
  concepts: [],
  synthesizedBatches: [],
  lensSpecificSuggestions: [],
  selectedConcept: null,
  regeneratePrompt: '',
}

const titleCase = value => value.charAt(0).toUpperCase() + value.slice(1)
const lensLabel = id => lenses.find(lens => lens.id === id)?.name.replace('The ', '').replace(' Lens', '') || titleCase(id)
const formatLensCombination = lensNames => {
  if (!lensNames.length) return 'your selected lenses'
  if (lensNames.length === 1) return lensNames[0]
  if (lensNames.length === 2) return `${lensNames[0]} and ${lensNames[1]}`
  return `${lensNames.slice(0, -1).join(', ')}, and ${lensNames.at(-1)}`
}
const conceptIdFromName = name => (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `concept-${Date.now()}`

const buildFallbackLensContent = (topic, grade) => {
  const arena = topic || 'this arena'
  const learners = formatGradeDescriptor(grade)
  return [
    {
      id: 'tension',
      provocation: lenses.find(lens => lens.id === 'tension')?.question || '',
      example: `For ${arena}, give ${learners} two worthwhile routes that pull against each other, then make them commit before the consequences are fully visible.`,
    },
    {
      id: 'role',
      provocation: lenses.find(lens => lens.id === 'role')?.question || '',
      example: `For ${arena}, place ${learners} in different stakeholder roles so what they notice, protect, and argue for changes with the position they inhabit.`,
    },
    {
      id: 'stakes',
      provocation: lenses.find(lens => lens.id === 'stakes')?.question || '',
      example: `For ${arena}, ask ${learners} to make a decision that changes what happens next, so the knowledge matters because something real is on the line.`,
    },
    {
      id: 'surprise',
      provocation: lenses.find(lens => lens.id === 'surprise')?.question || '',
      example: `For ${arena}, interrupt the obvious path for ${learners} with an unexpected shift, so they must rethink rather than replay a familiar routine.`,
    },
    {
      id: 'constraint',
      provocation: lenses.find(lens => lens.id === 'constraint')?.question || '',
      example: `For ${arena}, limit time, tools, or information for ${learners} so the constraint forces clearer reasoning instead of easier completion.`,
    },
  ]
}

const buildSelectedLensDetails = (selectedLensIds, lensContent) => {
  const contentMap = new Map(lensContent.map(item => [item.id, item]))
  return selectedLensIds.map(id => {
    const details = contentMap.get(id)
    return {
      id,
      name: lenses.find(lens => lens.id === id)?.name || titleCase(id),
      provocation: details?.provocation || lenses.find(lens => lens.id === id)?.question || '',
      example: details?.example || '',
    }
  })
}

const buildSynthesizedLocalConcepts = (topic, grade, selectedLensDetails, regeneratePrompt = '') => {
  const arena = topic || 'This arena'
  const learners = formatGradeDescriptor(grade)
  const primary = selectedLensDetails[0]?.id || 'tension'
  const secondary = selectedLensDetails[1]?.id || primary
  const focus = selectedLensDetails.map(lens => lensLabel(lens.id)).join(' + ') || 'Tension'
  const resonanceNote = regeneratePrompt.trim()
  const emphasis = resonanceNote.toLowerCase()
  const regeneratedNames = emphasis.includes('interdependent') ? [`${arena}: Interdependence on the Line`, `Interdependent ${arena}`, `${arena}: No Solo Route`] : emphasis.includes('public') ? [`${arena}: Public Consequence`, `Under the Public Eye: ${arena}`, `${arena}: Visible Fallout`] : emphasis.includes('information') ? [`${arena}: Missing Pieces`, `Partial Signal: ${arena}`, `${arena}: Incomplete Picture`] : resonanceNote ? [`${arena}: Second Signal`, `Reframing ${arena}`, `${arena}: Another Angle`] : null

  const naming = {
    tension: [`${arena}: The Crossroads`, `Pressure Point: ${arena}`, `${arena} Under Strain`],
    role: [`Inside ${arena}`, `${arena}: The Stakeholder Table`, `${arena} From the Inside`],
    stakes: [`${arena} on the Line`, `Decision Day: ${arena}`, `What Will ${arena} Cost?`],
    surprise: [`${arena}: The Unexpected Turn`, `Signal Break in ${arena}`, `What Changed in ${arena}?`],
    constraint: [`${arena} Within Limits`, `Scarcity in ${arena}`, `${arena}: The Rule-Bound Arena`],
  }[primary]
  const names = regeneratedNames || naming

  const secondaryLabel = lensLabel(secondary).toLowerCase()
  const lensProvocations = selectedLensDetails.map(lens => lens.provocation).filter(Boolean)
  const combinedExample = selectedLensDetails.map(lens => lens.example).filter(Boolean).join(' ')
  const resonanceTag = resonanceNote ? ` The teacher wants the next round to lean toward: ${resonanceNote}.` : ''

  return [
    {
      id: `${primary}-synth-1`,
      name: names[0],
      tension: `${learners} inherit a live conflict shaped by ${focus}. ${lensProvocations[0] || `The core ${lensLabel(primary).toLowerCase()} is unsettled`}, and every serious option helps one value, person, or outcome while destabilizing another.${resonanceTag}`,
      roles: selectedLensDetails.length > 1 ? ['Primary decision makers', 'People affected by the outcome', 'Observers tracking consequences'] : ['Primary decision makers', 'Affected community', 'Signal readers'],
      action: `Learners step into the arena, take a position, and make an irreversible choice before the full picture is comfortable. ${combinedExample}`.trim(),
      rationale: `${focus} turns the content into terrain instead of topic. Learners have to interpret competing pressures, justify a course of action, and live with the consequences their own judgment creates.`,
    },
    {
      id: `${primary}-synth-2`,
      name: names[1],
      tension: `${learners} enter the system from different positions, but a ${secondaryLabel} shift means no single viewpoint, role, or resource stream is enough to understand what should happen next. The arena keeps moving as each group acts on partial information.${resonanceTag}`,
      roles: resonanceNote ? ['Interdependent role holders', 'Negotiators', 'Signal carriers'] : ['Role holders', 'Negotiators', 'Recorders of consequence'],
      action: resonanceNote ? 'Trade incomplete information, rely on one another’s signals, and revise decisions as the system responds.' : 'Compare perspectives, exchange incomplete information, and revise decisions as the system pushes back on their first assumptions.',
      rationale: `This arena creates thinking because learners cannot solve it privately or passively. They have to reconcile perspective, sequence, and consequence in real time, which makes judgment visible instead of hidden.`,
    },
    {
      id: `${primary}-synth-3`,
      name: names[2],
      tension: `${learners} face a consequential choice under conditions shaped by ${selectedLensDetails.map(lens => lensLabel(lens.id).toLowerCase()).join(', ')}, so both hesitation and overconfidence carry a cost. What is missing matters as much as what is visible.${resonanceTag}`,
      roles: ['Investigators', 'Advisers', 'Public audience'],
      action: resonanceNote ? 'Notice what is missing, commit to a recommendation that others must rely on, and respond when the incomplete picture shifts the terrain.' : 'Notice what is missing, commit to a recommendation others must act on, and adapt when new evidence changes what the arena demands.',
      rationale: `${focus} keeps the arena from flattening into recall. Learners have to decide what counts as useful evidence, what can wait, and what must be acted on before certainty arrives.`,
    },
  ].map(concept => ({ ...concept, id: concept.id || conceptIdFromName(concept.name) }))
}

const buildLensSpecificLocalConcept = (topic, grade, lens) => ({
  id: `${lens.id}-specific`,
  name: `${topic || 'This arena'} Through ${lensLabel(lens.id)}`,
  tension: `${formatGradeDescriptor(grade)} must navigate the exact pressure inside this lens seed: ${lens.example}`,
  roles: ['Primary actors', 'Those affected', 'Signal readers'],
  action: 'Step into the seeded situation, make a consequential choice, and adjust when the implications become visible.',
  rationale: `Because this concept is anchored directly to the ${lensLabel(lens.id).toLowerCase()} example, the content becomes something learners must navigate rather than merely describe.`,
})

const normalizeConcept = (concept, fallbackId) => ({
  ...concept,
  id: concept?.id || conceptIdFromName(concept?.name) || fallbackId,
})

function StepHeader({ step, title, children }) {
  return <header className="vision-header"><div className="eyebrow">ARENA VISIONING / 0{step}</div><h1>{title}</h1>{children && <p className="lede">{children}</p>}</header>
}

function StepNav({ step }) {
  return <ol className="vision-progress" aria-label="Arena visioning steps">{['Seed', 'Lenses', 'Concept', 'Define', 'Confirm'].map((label, index) => <li key={label} className={step === index + 1 ? 'active' : step > index + 1 ? 'done' : ''}><span>{index + 1}</span><b>{label}</b></li>)}</ol>
}

function StandardsSelector() {
  const [open, setOpen] = useState(false)
  return <section className="standards-picker"><button type="button" className="define-toggle" onClick={() => setOpen(!open)} aria-expanded={open}><span>OPTIONAL STANDARDS <small><mark className="coming-soon-badge">COMING SOON</mark></small></span><b>{open ? '−' : '+'}</b></button>{open && <div className="standards-body standards-coming-soon"><p>Standards alignment coming soon.</p></div>}</section>
}

function SeedStep({ state, update, next }) {
  const onTopicChange = event => update({ topic: event.target.value, ...downstreamVisionReset })
  const onGradeChange = event => update({ grade: event.target.value, standards: [], ...downstreamVisionReset })
  return <><StepHeader step={1} title={arenaCopy.identity}>Every arena starts with a spark. What are you working with?</StepHeader><label className="topic-label">WHAT ARE YOU TEACHING, OR WHAT EXPERIENCE DO YOU WANT TO CREATE?<textarea autoFocus value={state.topic} placeholder="Butterfly lifecycle, civic power, an ethical dilemma…" onChange={onTopicChange}/></label><label className="select-field">GRADE LEVEL<select value={state.grade} onChange={onGradeChange}><option value="">Choose a learner group</option>{gradeOptions.map(grade => <option key={grade} value={grade}>{grade}</option>)}</select></label>{state.grade && <StandardsSelector/>}<button className="button build" disabled={!state.topic.trim() || !state.grade} onClick={next}>{arenaCopy.enterArena} <span>→</span></button></>
}

function LensStep({ state, update, back, onGenerate, onBuildAround, loadingExamples, buildingLensId, generatingConcepts, currentSignature }) {
  const contentMap = new Map((state.lensContentSignature === currentSignature ? state.lensContent : []).map(item => [item.id, item]))
  const content = lenses.map(lens => ({ ...lens, ...(contentMap.get(lens.id) || {}) }))
  const toggle = id => update({
    selectedLenses: state.selectedLenses.includes(id) ? state.selectedLenses.filter(item => item !== id) : [...state.selectedLenses, id],
    regeneratePrompt: '',
  })

  return <><StepHeader step={2} title="Choose your lenses.">Tap the provocations that sharpen what this arena could become. Pick one or several.</StepHeader><div className="lens-grid">{content.map(lens => {
    const exampleLoaded = typeof lens.example === 'string' && lens.example.trim().length > 0
    const isSelected = state.selectedLenses.includes(lens.id)
    return <article key={lens.id} className={`lens-card ${isSelected ? 'selected' : ''}`}><button type="button" className="lens-card-primary" onClick={() => toggle(lens.id)} aria-pressed={isSelected}><span>{lens.emoji}</span><h2>{lens.name}</h2><p>{lens.provocation || lens.question}</p><small>FOR EXAMPLE</small>{exampleLoaded ? <div className={`lens-example ${state.lensContentFallback ? 'fallback' : ''}`}><p>{lens.example}</p>{state.lensContentFallback && <span>Example unavailable.</span>}</div> : <div className="lens-example loading"><p>Shaping a topic-specific example for this lens…</p></div>}</button><button type="button" className="button ghost small lens-build-button" disabled={!exampleLoaded || loadingExamples || generatingConcepts || buildingLensId === lens.id} onClick={() => onBuildAround(lens)}>{buildingLensId === lens.id ? 'Shaping this arena…' : 'Build an arena around this idea →'}</button></article>
  })}</div><div className="vision-actions"><button className="button ghost" onClick={back}>← Back</button><button className="button" disabled={!state.selectedLenses.length || loadingExamples || generatingConcepts} onClick={onGenerate}>{generatingConcepts ? 'The Gamemaker is thinking…' : 'Generate Arena Concepts →'}</button></div></>
}

function ConceptCards({ concepts, selectedConcept, choose, prefix }) {
  return <div className="concept-grid">{concepts.map(concept => <article className={`concept-card ${selectedConcept?.id === concept.id ? 'selected' : ''}`} key={`${prefix}-${concept.id}`}><span>ARENA CONCEPT</span><h2>{concept.name}</h2><dl><div><dt>Central tension</dt><dd>{concept.tension}</dd></div><div><dt>Suggested roles</dt><dd>{concept.roles.join(' / ')}</dd></div><div><dt>What learners will do</dt><dd>{concept.action}</dd></div><div><dt>Why this creates thinking</dt><dd>{concept.rationale}</dd></div></dl><button className="button small" onClick={() => choose(concept)}>{selectedConcept?.id === concept.id ? 'Selected ✓' : 'Choose This Arena'}</button></article>)}</div>
}

function ConceptStep({ state, update, next, back, onRegenerate, loadingConcepts, regenerating }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(state.regeneratePrompt || '')
  const choose = concept => update({ selectedConcept: concept })
  const lensSpecific = state.lensSpecificSuggestions || []
  const hasLensSpecific = lensSpecific.length > 0
  const synthesizedBatches = state.synthesizedBatches?.length ? state.synthesizedBatches : state.concepts.length ? [{ id: 'current-batch', lensIds: state.selectedLenses, lensNames: state.selectedLenses.map(lensLabel), regeneratePrompt: state.regeneratePrompt, concepts: state.concepts }] : []

  useEffect(() => {
    setDraft(state.regeneratePrompt || '')
  }, [state.regeneratePrompt])

  const submitRegeneration = () => onRegenerate(draft)

  return <><StepHeader step={3} title="Many arenas. One choice.">These are conditions, not lesson plans. Choose the arena with the most productive tension.</StepHeader>{loadingConcepts && !synthesizedBatches.length ? <div className="concept-loading-card">The Gamemaker is thinking…</div> : <div className="concept-sections">{hasLensSpecific && <section className="concept-section"><div className="concept-section-header"><span>LENS-SPECIFIC SUGGESTIONS</span><p>These were shaped directly from the lens examples you chose to build around.</p></div><ConceptCards concepts={lensSpecific.map(item => item.concept)} selectedConcept={state.selectedConcept} choose={choose} prefix="lens-specific"/></section>}{synthesizedBatches.map((batch, index) => <section className="concept-section" key={batch.id}><div className="concept-section-header"><span>{index === 0 ? 'SYNTHESIZED ARENA SUGGESTIONS' : `SYNTHESIZED ARENA SUGGESTIONS / ROUND ${index + 1}`}</span><p>These combine your selected lenses ({formatLensCombination(batch.lensNames?.length ? batch.lensNames : batch.lensIds.map(lensLabel))}) into three broader arena directions.</p></div><ConceptCards concepts={batch.concepts} selectedConcept={state.selectedConcept} choose={choose} prefix={batch.id}/></section>)}</div>}<div className="regenerate-panel">{open && <label className="regenerate-field">What resonates from the suggestions above, or what direction would you like to take? <small>(Optional — the more you share, the better the next round.)</small><textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder="Lean harder into public stakes. Make the roles more interdependent. Keep the concept but raise the ambiguity…"/></label>}<div className="regenerate-actions">{open && <button className="button ghost small" onClick={() => setOpen(false)} disabled={regenerating}>Cancel</button>}<button className="button ghost" onClick={() => open ? submitRegeneration() : setOpen(true)} disabled={loadingConcepts || regenerating || !synthesizedBatches.length}>{regenerating ? 'The Gamemaker is rethinking the arena…' : 'Regenerate Suggestions'}</button></div></div><div className="vision-actions"><button className="button ghost" onClick={back}>← Try different lenses</button><button className="button" disabled={!state.selectedConcept} onClick={next}>Define This Arena →</button></div></>
}

function DefineStep({ state, update, next, back }) {
  const framing = state.framing
  const patch = changes => update({ framing: { ...framing, ...changes } })
  const toggleBehavior = value => patch({ visibleBehaviors: framing.visibleBehaviors.includes(value) ? framing.visibleBehaviors.filter(x => x !== value) : [...framing.visibleBehaviors, value] })
  return <><StepHeader step={4} title="Define your arena.">The terrain is already taking shape. Confirm the conditions your learners will live inside.</StepHeader><div className="definition-stack"><Fieldset label="Who is the audience?" value={framing.audience} options={['Just the teacher', 'The class', 'A real outside audience', 'An invented outside audience']} onChange={audience => patch({ audience })}/><fieldset className="behavior-field"><legend>What do you want to be able to SEE learners doing?</legend><div className="check-grid">{observableOptions.map(option => <label key={option} className={framing.visibleBehaviors.includes(option) ? 'checked' : ''}><input type="checkbox" checked={framing.visibleBehaviors.includes(option)} onChange={() => toggleBehavior(option)}/><span>{option}</span></label>)}</div><label className="other-field">OTHER<input value={framing.otherBehavior} onChange={e => patch({ otherBehavior: e.target.value })} placeholder="Name another observable behavior"/></label></fieldset><Fieldset label="How long is this arena?" value={framing.duration} options={['Single session', 'Multi-day', 'Ongoing', "I'm not sure"]} onChange={duration => patch({ duration })}/>{framing.duration !== "I'm not sure" && <div className="duration-details">{framing.duration === 'Single session' && <label>MINUTES<input type="number" min="1" value={framing.minutes} onChange={e => patch({ minutes: e.target.value })}/></label>}{framing.duration === 'Multi-day' && <><label>DAYS<input type="number" min="1" value={framing.days} onChange={e => patch({ days: e.target.value })}/></label><label>MINUTES PER DAY<input type="number" min="1" value={framing.minutesPerDay} onChange={e => patch({ minutesPerDay: e.target.value })}/></label></>}{framing.duration === 'Ongoing' && <><label>WEEKS<input type="number" min="1" value={framing.weeks} onChange={e => patch({ weeks: e.target.value })}/></label><label>TIMES PER WEEK<input type="number" min="1" value={framing.timesPerWeek} onChange={e => patch({ timesPerWeek: e.target.value })}/></label></>}</div>}<Fieldset label="Twist protocol" value={framing.twist} options={['Planned twist', 'Improvise', 'Both']} onChange={twist => patch({ twist })}/>{framing.twist !== 'Improvise' && <label className="other-field">DO YOU HAVE A TWIST IN MIND? <small>Optional</small><input value={framing.twistNote} onChange={e => patch({ twistNote: e.target.value })} placeholder="Describe it briefly—or leave this open"/></label>}{state.standards.length > 0 && !state.standards.includes('none') && <div className="reference-card"><span>THIS ARENA IS DESIGNED TO ADDRESS</span>{state.standards.map(id => allStandards.find(item => item.id === id)).filter(Boolean).map(item => <p key={item.id}><b>{item.code}</b>{item.title}</p>)}</div>}</div><div className="vision-actions"><button className="button ghost" onClick={back}>← Back</button><button className="button" disabled={!framing.audience || !framing.visibleBehaviors.length || !framing.duration || !framing.twist} onClick={next}>Review Your Arena →</button></div></>
}

function Fieldset({ label, value, options, onChange }) {
  return <fieldset className="choice-field"><legend>{label}</legend><div className="radio-row">{options.map(option => <label key={option} className={value === option ? 'checked' : ''}><input type="radio" checked={value === option} onChange={() => onChange(option)}/><span>{option}</span></label>)}</div></fieldset>
}

function ConfirmStep({ state, back, enter }) {
  const selectedStandards = state.standards.map(id => allStandards.find(item => item.id === id)).filter(Boolean)
  return <><StepHeader step={5} title={arenaCopy.ready}>Here is what you have built so far. Read the terrain once, then enter the control room.</StepHeader><section className="confirmation"><div className="confirmation-title"><span>ARENA BRIEF / READY</span><h2>{state.selectedConcept.name}</h2><p>{state.topic} · {state.grade}</p></div><dl><div><dt>Central tension</dt><dd>{state.selectedConcept.tension}</dd></div><div><dt>What learners will do</dt><dd>{state.selectedConcept.action}</dd></div><div><dt>Audience</dt><dd>{state.framing.audience}</dd></div><div><dt>Look for</dt><dd>{[...state.framing.visibleBehaviors, state.framing.otherBehavior].filter(Boolean).join(' · ')}</dd></div><div><dt>Duration</dt><dd>{state.framing.duration}</dd></div><div><dt>Twist protocol</dt><dd>{state.framing.twist}{state.framing.twistNote ? ` — ${state.framing.twistNote}` : ''}</dd></div>{selectedStandards.length > 0 && <div><dt>Standards</dt><dd>{selectedStandards.map(item => item.code).join(' · ')}</dd></div>}</dl></section><div className="vision-actions"><button className="button ghost" onClick={back}>← Adjust the brief</button><button className="button launch" onClick={enter}>{arenaCopy.begin} →</button></div></>
}

export default function ArenaVisioning({ state, setState, onComplete }) {
  const step = state.visionStep || 1
  const { request, error } = useAI(state.id)
  const [lensLoading, setLensLoading] = useState(false)
  const [conceptLoading, setConceptLoading] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [buildingLensId, setBuildingLensId] = useState('')
  const update = changes => setState(current => ({ ...current, ...changes }))
  const go = visionStep => update({ visionStep })
  const lensSignature = `${state.topic.trim()}::${state.grade}`

  const visibleLensContent = useMemo(() => state.lensContentSignature === lensSignature ? state.lensContent : [], [state.lensContent, state.lensContentSignature, lensSignature])
  const synthesizedBatches = state.synthesizedBatches || []

  useEffect(() => {
    if (step !== 2 || !state.topic.trim() || !state.grade) return
    if (state.lensContentSignature === lensSignature && state.lensContent.length === lenses.length) return

    let cancelled = false

    const loadLensContent = async () => {
      setLensLoading(true)
      const fallback = { lenses: buildFallbackLensContent(state.topic, state.grade).map(({ id, provocation, example }) => ({ id, provocation, example })) }
      const result = await request('lenses', buildArenaContext({ ...state, lensContent: [] }), fallback, { silentFallback: true, withMeta: true })
      if (cancelled) return
      update({
        lensContent: result.data.lenses,
        lensContentSignature: lensSignature,
        lensContentFallback: result.source !== 'ai',
      })
      setLensLoading(false)
    }

    loadLensContent()

    return () => {
      cancelled = true
    }
  }, [step, state.topic, state.grade, state.lensContent.length, state.lensContentSignature, lensSignature, request])

  const generateSynthesizedConcepts = async regeneratePrompt => {
    const selectedLensDetails = buildSelectedLensDetails(state.selectedLenses, visibleLensContent)
    const lensNames = selectedLensDetails.map(item => lensLabel(item.id))
    const fallback = { concepts: buildSynthesizedLocalConcepts(state.topic, state.grade, selectedLensDetails, regeneratePrompt) }
    const context = {
      ...buildArenaContext({ ...state, regeneratePrompt }),
      selectedLensDetails,
      regeneratePrompt,
    }

    if (step !== 3) go(3)
    const currentBatch = synthesizedBatches.at(-1)
    const selectedConceptId = state.selectedConcept?.id
    const selectedInCurrentBatch = currentBatch?.concepts?.some(concept => concept.id === selectedConceptId)
    update({ concepts: currentBatch?.concepts || [], regeneratePrompt })
    regeneratePrompt ? setRegenerating(true) : setConceptLoading(true)
    const data = await request('concepts', context, fallback, { silentFallback: true, hardFailureMessage: "The arena didn't take shape this time. Try adjusting your lenses and generating again." })
    const normalizedConcepts = data.concepts.map((concept, index) => normalizeConcept(concept, `synthesized-${index + 1}`))
    const nextBatch = {
      id: regeneratePrompt ? currentBatch?.id || `batch-${Date.now()}` : `batch-${Date.now()}`,
      lensIds: selectedLensDetails.map(item => item.id),
      lensNames,
      regeneratePrompt,
      concepts: normalizedConcepts,
    }
    setState(current => ({
      ...current,
      concepts: normalizedConcepts,
      synthesizedBatches: regeneratePrompt
        ? [...(current.synthesizedBatches || []).slice(0, -1), nextBatch]
        : [...(current.synthesizedBatches || []), nextBatch],
      selectedConcept: regeneratePrompt && selectedInCurrentBatch ? null : current.selectedConcept,
      regeneratePrompt,
      lensSpecificSuggestions: current.lensSpecificSuggestions || [],
    }))
    setConceptLoading(false)
    setRegenerating(false)
  }

  const buildAroundLens = async lens => {
    const nextSelectedLenses = state.selectedLenses.includes(lens.id) ? state.selectedLenses : [...state.selectedLenses, lens.id]
    const selectedLensDetails = buildSelectedLensDetails(nextSelectedLenses, visibleLensContent)
    const seedLens = selectedLensDetails.find(item => item.id === lens.id) || { id: lens.id, name: lens.name, provocation: lens.provocation || lens.question, example: lens.example || '' }
    const fallback = { concept: buildLensSpecificLocalConcept(state.topic, state.grade, seedLens) }
    const context = {
      ...buildArenaContext({ ...state, selectedLenses: nextSelectedLenses }),
      selectedLenses: nextSelectedLenses,
      selectedLensDetails,
      seedLens,
    }

    setBuildingLensId(lens.id)
    const data = await request('lensSpecificConcept', context, fallback, { silentFallback: true })
    setState(current => ({
      ...current,
      selectedLenses: nextSelectedLenses,
      lensSpecificSuggestions: [
        ...(current.lensSpecificSuggestions || []).filter(item => item.lensId !== lens.id),
        { lensId: lens.id, lensName: lens.name, concept: normalizeConcept(data.concept, `${lens.id}-specific`) },
      ],
    }))
    setBuildingLensId('')
  }

  return <main className="visioning shell"><StepNav step={step}/>{conceptLoading && step === 3 && <div className="ai-card">The Gamemaker is thinking…</div>}{regenerating && <div className="ai-card">The Gamemaker is rethinking the arena…</div>}{error && <div className="ai-card">{error}</div>}<motion.div key={step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .25 }}>{step === 1 && <SeedStep state={state} update={update} next={() => go(2)}/>} {step === 2 && <LensStep state={state} update={update} back={() => go(1)} onGenerate={() => generateSynthesizedConcepts('')} onBuildAround={buildAroundLens} loadingExamples={lensLoading} buildingLensId={buildingLensId} generatingConcepts={conceptLoading || regenerating} currentSignature={lensSignature}/>} {step === 3 && <ConceptStep state={state} update={update} next={() => go(4)} back={() => go(2)} onRegenerate={generateSynthesizedConcepts} loadingConcepts={conceptLoading} regenerating={regenerating}/>} {step === 4 && <DefineStep state={state} update={update} next={() => go(5)} back={() => go(3)}/>} {step === 5 && <ConfirmStep state={state} back={() => go(4)} enter={onComplete}/>}</motion.div></main>
}
