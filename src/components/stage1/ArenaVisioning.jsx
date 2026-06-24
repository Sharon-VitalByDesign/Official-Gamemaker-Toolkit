import React, { useEffect, useState } from 'react'
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

const localLensContent = (topic, grade) => lenses.map(lens => ({
  ...lens,
  provocation: lens.question,
  example: `For ${topic || 'this arena'}, invite ${formatGradeDescriptor(grade)} to make a consequential choice through the ${lens.id} lens—and make their reasoning visible.`,
}))

const localConcepts = (topic, selectedLensIds) => {
  const focus = selectedLensIds.length ? selectedLensIds.map(id => lenses.find(l => l.id === id)?.name.replace('The ', '').replace(' Lens', '')).join(' + ') : 'Tension'
  return [
    { id: 'crossroads', name: `${topic}: The Crossroads`, tension: `Learners must choose a direction before the full picture is available.`, roles: ['Decision makers', 'Stakeholders', 'Observers'], action: 'Make, defend, and revise a consequential decision.', rationale: `${focus} turns the content into terrain learners must navigate.` },
    { id: 'system', name: `The ${topic} System Under Pressure`, tension: `A stable system changes, and every response creates a trade-off.`, roles: ['System actors', 'Resource holders', 'Impacted community'], action: 'Negotiate limited resources and track the consequences.', rationale: 'Interdependence makes recall insufficient; learners must reason across the system.' },
    { id: 'signal', name: `${topic}: Signal or Noise?`, tension: `Evidence points in competing directions, and waiting has a cost.`, roles: ['Investigators', 'Advisers', 'Public audience'], action: 'Frame the problem, weigh evidence, and commit to a recommendation.', rationale: 'Uncertainty requires learners to decide what counts as useful evidence.' },
  ]
}

function StepHeader({ step, title, children }) {
  return <header className="vision-header"><div className="eyebrow">ARENA VISIONING / 0{step}</div><h1>{title}</h1>{children && <p className="lede">{children}</p>}</header>
}

function StepNav({ step }) {
  return <ol className="vision-progress" aria-label="Arena visioning steps">{['Seed', 'Lenses', 'Concept', 'Define', 'Confirm'].map((label, index) => <li key={label} className={step === index + 1 ? 'active' : step > index + 1 ? 'done' : ''}><span>{index + 1}</span><b>{label}</b></li>)}</ol>
}

function StandardsSelector({ grade, selected, onChange }) {
  const [open, setOpen] = useState(false)
  return <section className="standards-picker"><button type="button" className="define-toggle" onClick={() => setOpen(!open)} aria-expanded={open}><span>OPTIONAL STANDARDS <small><mark className="coming-soon-badge">COMING SOON</mark></small></span><b>{open ? '−' : '+'}</b></button>{open && <div className="standards-body standards-coming-soon"><p>Standards alignment coming soon.</p></div>}</section>
}

function SeedStep({ state, update, next }) {
  return <><StepHeader step={1} title={arenaCopy.identity}>Every arena starts with a spark. What are you working with?</StepHeader><label className="topic-label">WHAT ARE YOU TEACHING, OR WHAT EXPERIENCE DO YOU WANT TO CREATE?<textarea autoFocus value={state.topic} placeholder="Butterfly lifecycle, civic power, an ethical dilemma…" onChange={e => update({ topic: e.target.value })}/></label><label className="select-field">GRADE LEVEL<select value={state.grade} onChange={e => update({ grade: e.target.value, standards: [] })}><option value="">Choose a learner group</option>{gradeOptions.map(grade => <option key={grade} value={grade}>{grade}</option>)}</select></label>{state.grade && <StandardsSelector grade={state.grade} selected={state.standards} onChange={standards => update({ standards })}/>}<button className="button build" disabled={!state.topic.trim() || !state.grade} onClick={next}>{arenaCopy.enterArena} <span>→</span></button></>
}

function LensStep({ state, update, next, back }) {
  const content = state.lensContent.length ? state.lensContent.map(item => ({ ...lenses.find(lens => lens.id === item.id), ...item })) : localLensContent(state.topic, state.grade)
  const toggle = id => update({ selectedLenses: state.selectedLenses.includes(id) ? state.selectedLenses.filter(x => x !== id) : [...state.selectedLenses, id] })
  return <><StepHeader step={2} title="Choose your lenses.">Tap the provocations that sharpen what this arena could become. Pick one or several.</StepHeader><div className="lens-grid">{content.map(lens => <button key={lens.id} className={`lens-card ${state.selectedLenses.includes(lens.id) ? 'selected' : ''}`} onClick={() => toggle(lens.id)} aria-pressed={state.selectedLenses.includes(lens.id)}><span>{lens.emoji}</span><h2>{lens.name}</h2><p>{lens.provocation}</p><small>FOR EXAMPLE</small><em>{lens.example}</em></button>)}</div><div className="vision-actions"><button className="button ghost" onClick={back}>← Back</button><button className="button" disabled={!state.selectedLenses.length} onClick={next}>Generate Arena Concepts →</button></div></>
}

function ConceptStep({ state, update, next, back }) {
  const concepts = state.concepts.length ? state.concepts : localConcepts(state.topic, state.selectedLenses)
  const choose = concept => update({ concepts, selectedConcept: concept })
  return <><StepHeader step={3} title="Three arenas. One choice.">These are conditions, not lesson plans. Choose the arena with the most productive tension.</StepHeader><div className="concept-grid">{concepts.map(concept => <article className={`concept-card ${state.selectedConcept?.id === concept.id ? 'selected' : ''}`} key={concept.id}><span>ARENA CONCEPT</span><h2>{concept.name}</h2><dl><div><dt>Central tension</dt><dd>{concept.tension}</dd></div><div><dt>Suggested roles</dt><dd>{concept.roles.join(' / ')}</dd></div><div><dt>What learners will do</dt><dd>{concept.action}</dd></div><div><dt>Why this creates thinking</dt><dd>{concept.rationale}</dd></div></dl><button className="button small" onClick={() => choose(concept)}>{state.selectedConcept?.id === concept.id ? 'Selected ✓' : 'Choose this arena'}</button></article>)}</div><div className="vision-actions"><button className="button ghost" onClick={back}>← Try different lenses</button><button className="button" disabled={!state.selectedConcept} onClick={next}>Define This Arena →</button></div></>
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
  const { request, loading, error } = useAI(state.id)
  const update = changes => setState(current => ({ ...current, ...changes }))
  const go = visionStep => update({ visionStep })
  useEffect(()=>{if(step!==2||state.lensContent.length)return;const fallback={lenses:localLensContent(state.topic,state.grade).map(({id,provocation,example})=>({id,provocation,example}))};(async()=>{const data=await request('lenses',buildArenaContext(state),fallback,{silentFallback:true});update({lensContent:data.lenses})})()},[step,state.lensContent.length])
  useEffect(()=>{if(step!==3||state.concepts.length)return;const fallback={concepts:localConcepts(state.topic,state.selectedLenses)};(async()=>{const data=await request('concepts',buildArenaContext(state),fallback,{silentFallback:true,hardFailureMessage:"The arena didn't take shape this time. Try adjusting your lenses and generating again."});update({concepts:data.concepts})})()},[step,state.concepts.length])
  return <main className="visioning shell"><StepNav step={step}/>{loading&&<div className="ai-card">The Gamemaker is thinking…</div>}{error&&<div className="ai-card">{error}</div>}<motion.div key={step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .25 }}>{step === 1 && <SeedStep state={state} update={update} next={() => go(2)}/>} {step === 2 && <LensStep state={state} update={update} next={() => go(3)} back={() => go(1)}/>} {step === 3 && <ConceptStep state={state} update={update} next={() => go(4)} back={() => go(2)}/>} {step === 4 && <DefineStep state={state} update={update} next={() => go(5)} back={() => go(3)}/>} {step === 5 && <ConfirmStep state={state} back={() => go(4)} enter={onComplete}/>}</motion.div></main>
}
