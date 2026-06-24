import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Document, Page, PDFDownloadLink, StyleSheet, Text, View } from '@react-pdf/renderer'
import toolkit from './data/toolkit.json'
import ArenaVisioning from './components/stage1/ArenaVisioning'
import { useAI } from './hooks/useAI'
import { buildArenaContext } from './utils/contextBuilder'
import { ONBOARDED_KEY, SESSION_PREFIX, safeGetItem, safeKeys, safeRemoveItem, safeSetItem } from './utils/storage'
import { formatGradeDescriptor } from './utils/grades'
import { sanitizeArenaTitle } from './utils/titleCase'

const controls = ['SHAPE', 'CHALLENGE', 'EMPOWER', 'SCOREBOARD']
const levels = ['MINIMAL', 'GUARDED', 'BALANCED', 'HIGH', 'MAX']
const conceptFields = ['id', 'name', 'tension', 'action', 'rationale']
const visionStageDefinitions = [
  { step: 1, icon: '🌱', label: 'Seed' },
  { step: 2, icon: '🔍', label: 'Lenses' },
  { step: 3, icon: '🏟️', label: 'Concept' },
  { step: 4, icon: '📋', label: 'Define' },
  { step: 5, icon: '✅', label: 'Confirm' },
]
const blank = () => ({
  id: `${SESSION_PREFIX}${Date.now()}`, createdAt: Date.now(), updatedAt: Date.now(), stage: 1, visionStep: 1, visionCompleted: false, topic: '', grade: '', standards: [], selectedLenses: [], lensContent: [], lensContentSignature: '', lensContentFallback: false, concepts: [], synthesizedBatches: [], lensSpecificSuggestions: [], selectedConcept: null, regeneratePrompt: '',
  framing: { audience: '', visible: '', visibleBehaviors: [], otherBehavior: '', duration: '', minutes: '', days: '', minutesPerDay: '', weeks: '', timesPerWeek: '', twist: '', twistNote: '' },
  controls: { SHAPE: 3, CHALLENGE: 3, EMPOWER: 3, SCOREBOARD: 3 },
  faders: Object.fromEntries(toolkit.faders.map(f => [f.id, 3])), selectedMoves: [], generatedMoves: {}, outputBrief: null
})

const clamp = (value, min, max, fallback) => Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback
const text = value => typeof value === 'string' ? value : ''
const list = value => Array.isArray(value) ? value : []
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : null
const sanitizeConcept = raw => {
  const concept = object(raw)
  if (!concept) return null
  const conceptId = typeof concept.id === 'string' && concept.id.trim() ? concept.id : typeof concept.name === 'string' ? concept.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : ''
  if (!conceptId || !conceptFields.filter(field => field !== 'id').every(field => typeof concept[field] === 'string')) return null
  if (!Array.isArray(concept.roles) || !concept.roles.every(role => typeof role === 'string')) return null
  return {
    id: conceptId,
    name: sanitizeArenaTitle(concept.name),
    tension: concept.tension,
    roles: concept.roles,
    action: concept.action,
    rationale: concept.rationale,
  }
}

function sanitizeOutputBrief(raw) {
  const brief = object(raw)
  const sections = object(brief?.sections)
  if (!brief || !sections) return null
  const nextSections = {}
  for (const key of ['conditions', 'constraints', 'choices', 'evidence', 'interventions']) {
    if (typeof sections[key] !== 'string') return null
    nextSections[key] = sections[key]
  }
  if (typeof brief.arenaConcept !== 'string' || typeof brief.gamemakersNote !== 'string') return null
  return { arenaConcept: brief.arenaConcept, sections: nextSections, gamemakersNote: brief.gamemakersNote }
}

function sanitizeGeneratedMoves(raw) {
  const groups = object(raw)
  if (!groups) return {}
  return Object.fromEntries(Object.entries(groups).map(([key, value]) => [key, list(value).filter(move => object(move)).map((move, index) => ({
    id: typeof move.id === 'string' ? move.id : `${key}-${index}`,
    title: text(move.title),
    description: text(move.description),
    implementation: text(move.implementation),
  }))]))
}

function sanitizeSession(raw) {
  const source = object(raw)
  if (!source) return null
  const base = blank()
  const framing = object(source.framing) || {}
  const controlsValue = object(source.controls) || {}
  const fadersValue = object(source.faders) || {}
  const safeState = {
    ...base,
    id: typeof source.id === 'string' && source.id.startsWith(SESSION_PREFIX) ? source.id : base.id,
    createdAt: Number.isFinite(source.createdAt) ? source.createdAt : base.createdAt,
    updatedAt: Number.isFinite(source.updatedAt) ? source.updatedAt : base.updatedAt,
    stage: clamp(source.stage, 1, 3, 1),
    visionStep: clamp(source.visionStep, 1, 5, 1),
    visionCompleted: Boolean(source.visionCompleted),
    topic: text(source.topic),
    grade: text(source.grade),
    standards: list(source.standards).filter(item => typeof item === 'string'),
    selectedLenses: list(source.selectedLenses).filter(item => typeof item === 'string'),
    lensContent: list(source.lensContent).filter(item => object(item) && typeof item.id === 'string' && typeof item.provocation === 'string' && typeof item.example === 'string'),
    lensContentSignature: text(source.lensContentSignature),
    lensContentFallback: Boolean(source.lensContentFallback),
    concepts: list(source.concepts).map(sanitizeConcept).filter(Boolean),
    synthesizedBatches: list(source.synthesizedBatches).map((item, index) => {
      const batch = object(item)
      if (!batch) return null
      const concepts = list(batch.concepts).map(sanitizeConcept).filter(Boolean)
      if (!concepts.length) return null
      return {
        id: text(batch.id) || `batch-${index + 1}`,
        lensIds: list(batch.lensIds).filter(value => typeof value === 'string'),
        lensNames: list(batch.lensNames).filter(value => typeof value === 'string'),
        regeneratePrompt: text(batch.regeneratePrompt),
        concepts,
      }
    }).filter(Boolean),
    lensSpecificSuggestions: list(source.lensSpecificSuggestions).map(item => {
      const entry = object(item)
      if (!entry || typeof entry.lensId !== 'string' || typeof entry.lensName !== 'string') return null
      const concept = sanitizeConcept(entry.concept)
      return concept ? { lensId: entry.lensId, lensName: entry.lensName, concept } : null
    }).filter(Boolean),
    selectedConcept: sanitizeConcept(source.selectedConcept),
    regeneratePrompt: text(source.regeneratePrompt),
    framing: {
      ...base.framing,
      audience: text(framing.audience),
      visible: text(framing.visible),
      visibleBehaviors: list(framing.visibleBehaviors).filter(item => typeof item === 'string'),
      otherBehavior: text(framing.otherBehavior),
      duration: text(framing.duration),
      minutes: text(framing.minutes),
      days: text(framing.days),
      minutesPerDay: text(framing.minutesPerDay),
      weeks: text(framing.weeks),
      timesPerWeek: text(framing.timesPerWeek),
      twist: text(framing.twist),
      twistNote: text(framing.twistNote),
    },
    controls: Object.fromEntries(controls.map(name => [name, clamp(Number(controlsValue[name]), 1, 5, 3)])),
    faders: Object.fromEntries(toolkit.faders.map(item => [item.id, clamp(Number(fadersValue[item.id]), 1, 5, 3)])),
    selectedMoves: list(source.selectedMoves).filter(item => typeof item === 'string'),
    generatedMoves: sanitizeGeneratedMoves(source.generatedMoves),
    outputBrief: sanitizeOutputBrief(source.outputBrief),
  }
  if (!safeState.synthesizedBatches.length && safeState.concepts.length) {
    safeState.synthesizedBatches = [{
      id: 'legacy-batch',
      lensIds: safeState.selectedLenses,
      lensNames: [],
      regeneratePrompt: safeState.regeneratePrompt,
      concepts: safeState.concepts,
    }]
  }
  return safeState
}

const parseCondition = (value, condition) => condition.startsWith('>') ? value > +condition.slice(1) : condition.startsWith('<') ? value < +condition.slice(1) : value === +condition
const activeTensions = state => toolkit.tensionRules.filter(rule => Object.entries(rule.conditions).every(([key, condition]) => parseCondition(state.controls[key] ?? state.faders[key], condition)))
const controlReading = (state,name,value) => { const definition=toolkit.controls.find(control=>control.id===name);const arena=state.selectedConcept?.name||state.topic||'this arena';if(value===1)return `In ${arena}: ${definition.min}`;if(value===5)return `In ${arena}: ${definition.max}`;if(value===2)return `In ${arena}, keep this control lightly structured while preserving significant openness.`;if(value===4)return `In ${arena}, make this control strongly designed; any remaining openness should be purposeful.`;return `In ${arena}, hold structure and openness in deliberate tension—then watch which direction learners need.` }

function previewFor(state) {
  const c = state.controls, f = state.faders
  const shape = c.SHAPE >= 4 ? 'tight boundaries make every choice visible' : c.SHAPE <= 2 ? 'the boundaries stay deliberately open' : 'the frame gives direction without solving the route'
  const challenge = c.CHALLENGE >= 4 ? 'Learners work under real pressure and must commit before certainty arrives.' : c.CHALLENGE <= 2 ? 'There is generous room to rehearse, notice patterns, and revise.' : 'The challenge asks for judgment without turning into a guessing game.'
  const empower = c.EMPOWER >= 4 ? 'You hand learners meaningful control over how the arena unfolds.' : c.EMPOWER <= 2 ? 'You hold most of the route-setting power, so make the purpose of those boundaries explicit.' : 'Authority is shared: you hold the frame while learners shape the path.'
  const watch = f.stakes >= 4 && f.feedback <= 2 ? 'Watch for public stakes arriving before learners have a useful signal.' : f.ambiguity >= 4 ? 'Watch for productive uncertainty tipping into simple confusion.' : 'Watch what learners do when their first plan stops working.'
  const arena = state.selectedConcept?.name || state.topic || 'this arena'
  return `In ${arena}, ${shape}. ${challenge} ${empower} ${watch}`
}

function gradeMetaLabel(grade) {
  if (!grade) return ''
  if (grade === 'Pre-K') return 'Pre-K'
  if (grade === 'Kindergarten') return 'Kindergarten'
  if (grade === 'College') return 'College'
  if (grade === 'Adult Learners') return 'Adult Learners'
  return grade
}

function completedVisionStepForState(state) {
  if (!state.topic.trim() || !state.grade) return 1
  if (!state.selectedLenses.length) return 1
  if (!state.selectedConcept) return 2
  const framingReady = Boolean(state.framing.audience && state.framing.visibleBehaviors.length && state.framing.duration && state.framing.twist)
  if (!framingReady) return 3
  if (state.stage > 1 || state.visionCompleted || state.visionStep === 5) return 5
  return 4
}

function useSessions() {
  const scanSessions = () => {
    const invalidKeys = []
    const sessions = safeKeys().filter(key => key.startsWith(SESSION_PREFIX)).map(key => {
      try {
        const raw = safeGetItem(key)
        if (!raw) {
          invalidKeys.push(key)
          return null
        }
        const parsed = JSON.parse(raw)
        const safeState = sanitizeSession(parsed)
        if (!safeState) {
          invalidKeys.push(key)
          return null
        }
        return safeState
      } catch {
        invalidKeys.push(key)
        return null
      }
    }).filter(Boolean).sort((a,b) => b.updatedAt-a.updatedAt)
    invalidKeys.forEach(key => safeRemoveItem(key))
    return { sessions, didReset: invalidKeys.length > 0 }
  }
  const [initial] = useState(scanSessions)
  const [sessions, setSessions] = useState(() => initial.sessions.slice(0, 5))
  const [didReset, setDidReset] = useState(initial.didReset)
  const refreshSessions = () => {
    const next = scanSessions()
    setSessions(next.sessions.slice(0, 5))
    if (next.didReset) setDidReset(true)
    return next.sessions
  }
  const save = state => {
    const value = { ...state, updatedAt: Date.now() }
    safeSetItem(value.id, JSON.stringify(value))
    const all = scanSessions().sessions
    all.slice(5).forEach(s => safeRemoveItem(s.id))
    refreshSessions()
  }
  const remove = id => { safeRemoveItem(id); refreshSessions() }
  const resetAll = () => {
    safeKeys().filter(key => key.startsWith(SESSION_PREFIX)).forEach(key => safeRemoveItem(key))
    setSessions([])
    setDidReset(true)
  }
  return { sessions, save, remove, resetAll, didReset, clearResetNotice: () => setDidReset(false) }
}

function Progress({ stage }) {
  return <nav className="progress" aria-label="Arena build progress">{['ENTER', 'CALIBRATE', 'CAPTURE'].map((label, i) => <div className={stage === i+1 ? 'active' : stage > i+1 ? 'done' : ''} key={label}><span>0{i+1}</span>{label}</div>)}</nav>
}

function VisionStageNav({ currentStep, completedStep, onSelect }) {
  return <nav className="vision-stage-nav" aria-label="Arena visioning navigation">{visionStageDefinitions.map(item => {
    const isCurrent = item.step === currentStep
    const isCompleted = item.step < currentStep || completedStep === 5
    const isClickable = item.step <= completedStep && !isCurrent
    return <button key={item.step} type="button" className={`vision-stage-chip ${isCurrent ? 'active' : ''} ${isCompleted ? 'done' : ''}`} disabled={!isClickable} onClick={() => isClickable && onSelect(item.step)}>
      <span className="vision-stage-chip-index">{item.icon}</span>
      <span className="vision-stage-chip-label">{item.label}</span>
    </button>
  })}</nav>
}

function VisionNavModal({ step, onConfirm, onCancel }) {
  const label = visionStageDefinitions.find(item => item.step === step)?.label || 'that stage'
  return <div className="vision-modal-backdrop" role="presentation"><div className="vision-modal" role="dialog" aria-modal="true" aria-labelledby="vision-nav-modal-title"><span className="eyebrow">ARENA WARNING</span><h2 id="vision-nav-modal-title">Return to {label}?</h2><p>Going back to {label} will let you change your selections. Your current dial settings and selected moves will be saved. Do you want to continue?</p><div className="vision-modal-actions"><button type="button" className="button ghost" onClick={onCancel}>Cancel</button><button type="button" className="button" onClick={onConfirm}>Continue</button></div></div></div>
}

function WelcomeBack({ sessions, onResume, onNew, onDelete }) {
  return <main className="welcome shell"><div className="eyebrow">CONTROL ROOM MEMORY</div><h1>Welcome back,<br/><em>Gamemaker.</em></h1><p>Your arenas are still here. Pick up a signal or start clean.</p><div className="session-list">{sessions.map(s => <article className="session-card" key={s.id}><div><span>{new Date(s.updatedAt).toLocaleDateString()}</span><h2>{s.topic || 'Untitled arena'}</h2><p>Stage {s.stage} · {s.selectedMoves.length} selected moves</p></div><div className="session-actions"><button className="button small" onClick={() => onResume(s)}>Resume</button><button className="icon-button" aria-label={`Delete ${s.topic}`} onClick={() => onDelete(s.id)}>×</button></div></article>)}</div><div className="welcome-actions"><button className="button ghost" onClick={onNew}>Start a New Arena</button></div><small>Your arenas are saved on this device only.</small></main>
}

function BigDial({ name, value, onChange, suggested, description }) {
  const angle = -130 + (value-1)*65, center=82, radius=58
  const drag = useRef(null)
  const update = (clientY) => { if (!drag.current) return; const delta=(drag.current-clientY)/24; const next=Math.max(1,Math.min(5,Math.round(value+delta))); if(next!==value){onChange(next);drag.current=clientY} }
  return <div className={`dial-wrap ${suggested?'suggested':''}`}><div className="dial-readout"><span>{name}</span><b>{levels[value-1]}</b></div><svg className="dial" viewBox="0 0 164 164" role="slider" aria-label={name} aria-valuemin="1" aria-valuemax="5" aria-valuenow={value} tabIndex="0" onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowUp')onChange(Math.min(5,value+1));if(e.key==='ArrowLeft'||e.key==='ArrowDown')onChange(Math.max(1,value-1))}} onPointerDown={e=>{drag.current=e.clientY;e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>update(e.clientY)} onPointerUp={()=>drag.current=null}>
    <circle className="dial-track" cx={center} cy={center} r={radius} pathLength="100" strokeDasharray="72 28" transform="rotate(140 82 82)"/><circle className="dial-progress" cx={center} cy={center} r={radius} pathLength="100" strokeDasharray={`${(value-1)*18} 100`} transform="rotate(140 82 82)"/>
    <g transform={`rotate(${angle} 82 82)`}><circle className="knob" cx="82" cy="82" r="42"/><line className="needle" x1="82" y1="47" x2="82" y2="60"/><circle className="indicator" cx="82" cy="48" r="4"/></g>{[0,1,2,3,4].map(i=><line key={i} className="tick" x1="82" y1="15" x2="82" y2="22" transform={`rotate(${-130+i*65} 82 82)`}/>)}</svg>{suggested && <span className="suggestion-dot">SIGNAL</span>}<div className="dial-buttons"><button onClick={()=>onChange(Math.max(1,value-1))}>−</button><span>0{value}</span><button onClick={()=>onChange(Math.min(5,value+1))}>+</button></div><p className="dial-context">{description}</p></div>
}

function Fader({ item, value, onChange, suggested, arenaName }) { const reading=value>=4?item.upDescription:value<=2?item.downDescription:'Midpoint between both conditions';return <label className={`fader ${suggested?'suggested':''}`}><div><span>{item.label}</span><b>0{value}</b></div><input aria-label={item.label} aria-valuetext={`${value} of 5: ${reading}`} type="range" min="1" max="5" value={value} onChange={e=>onChange(+e.target.value)} style={{'--pct':`${(value-1)*25}%`}}/><div className="fader-ticks">{[1,2,3,4,5].map(x=><i key={x}/>)}</div><small>In {arenaName}: {reading}</small>{suggested && <em>Suggested adjustment</em>}</label> }

function AccordionSection({ icon, title, description, summary, accent, open, onToggle, children }) {
  return <section className={`dashboard-section ${open ? 'open' : 'closed'}`} style={{ '--section-accent': accent }}>
    <button type="button" className="dashboard-section-header" onClick={onToggle} aria-expanded={open}>
      <div className="dashboard-section-title">
        <span className="dashboard-section-icon">{icon}</span>
        <div>
          <strong>{title}</strong>
          <p>{description}</p>
        </div>
      </div>
      <div className="dashboard-section-meta">
        <span>{summary}</span>
        <b>{open ? '▾' : '▸'}</b>
      </div>
    </button>
    {open && <div className="dashboard-section-body">{children}</div>}
  </section>
}

function MoveBank({ state, setState, onGenerate, generating }) {
  const [active,setActive]=useState('')
  const shown=active ? state.generatedMoves?.[active] || [] : []
  const selectedMoveRecords = Object.values(state.generatedMoves || {}).flat().filter(move => state.selectedMoves.includes(move.id))
  const choose=async category=>{setActive(category);if(!state.generatedMoves?.[category])await onGenerate(category)}
  const toggle=id=>setState(s=>({...s,selectedMoves:s.selectedMoves.includes(id)?s.selectedMoves.filter(x=>x!==id):[...s.selectedMoves,id]}))
  return <div className="move-panel"><div className="panel-heading"><div><span>MOVE BANK</span><h2>Design Moves</h2></div></div><p className="move-intro">Choose a move type. The control room will translate it into this arena.</p><div className="move-categories">{toolkit.designMoves.map(d=><button type="button" className={active===d.name?'active':''} onClick={()=>choose(d.name)} key={d.name}><strong>{d.name}</strong><small>{d.definition}</small></button>)}</div><div className="move-list">{generating&&<div className="move-loading">The Gamemaker is building moves…</div>}{!active&&!generating&&<div className="move-empty">Select a Design Move to generate specific interventions.</div>}{shown.map(move=><button type="button" className={`move-card ${state.selectedMoves.includes(move.id)?'selected':''}`} onClick={()=>toggle(move.id)} key={move.id}><span>{active}</span><strong>{move.title}</strong><p>{move.description}</p><small>{move.implementation}</small><b>{state.selectedMoves.includes(move.id)?'✓':'+'}</b></button>)}</div><div className="selected-moves-panel"><div className="selected-strip"><span>SELECTED MOVES</span><strong>{state.selectedMoves.length.toString().padStart(2,'0')}</strong></div>{selectedMoveRecords.length ? <div className="selected-moves-list">{selectedMoveRecords.map(move => <article key={move.id} className="selected-move-item"><strong>{move.title}</strong><p>{move.implementation}</p></article>)}</div> : <div className="move-empty selected-empty">No moves selected yet.</div>}</div></div>
}

function Onboarding({onDone}) { const [step,setStep]=useState(0); const copy=[['The big four','These are your primary controls—the big dials on your arena.'],['Fine calibration','These faders tune the conditions inside each control.'],['Read the room','Your live preview changes as you adjust. Watch what the system notices.']]; return <div className="tour"><span>0{step+1} / 03</span><h3>{copy[step][0]}</h3><p>{copy[step][1]}</p><button onClick={()=>step<2?setStep(step+1):onDone()}>{step<2?'Next signal →':'Enter the control room'}</button><button className="tour-skip" onClick={onDone}>Skip</button></div> }

function Stage2({state,setState,onBack,onNext,onVisionStageSelect}) {
  const [preview,setPreview]=useState(previewFor(state)),[aiSignal,setAiSignal]=useState(''),[mobilePreview,setMobilePreview]=useState(false),[tour,setTour]=useState(()=>!safeGetItem(ONBOARDED_KEY))
  const [openSections,setOpenSections]=useState({ terrain: true, calibration: false, moves: false })
  const { request, loading: aiLoading, error: aiError } = useAI(state.id)
  useEffect(()=>{setAiSignal('');const id=setTimeout(()=>setPreview(previewFor(state)),300);return()=>clearTimeout(id)},[state.controls,state.faders])
  useEffect(()=>{const id=setTimeout(async()=>{const data=await request('liveSignal',buildArenaContext(state),null,{silentFallback:true});if(data)setAiSignal(`${data.condition} ${data.learnerImpact} ${data.watchFor}`)},1500);return()=>clearTimeout(id)},[state.controls,state.faders,request])
  const tensions=activeTensions(state), selected=Object.values(state.generatedMoves||{}).flat().filter(m=>state.selectedMoves.includes(m.id))
  const generateMoves=async category=>{const roles=state.selectedConcept?.roles||['learners'];const fallback={moves:[1,2,3].map(index=>({id:`${category.toLowerCase().replace(/\W/g,'-')}-${index}`,title:`${category}: ${index===1?'Open the fork':index===2?'Shift the signal':'Make the consequence visible'}`,description:`A ${category.toLowerCase()} move shaped for ${state.selectedConcept?.name||state.topic}.`,implementation:`Give ${roles[(index-1)%roles.length]} a consequential decision tied directly to ${state.selectedConcept?.tension||state.topic}; reveal the result before the next choice.`}))};const data=await request('moves',{...buildArenaContext(state),requestedMove:category,selectedMoves:selected},fallback,{silentFallback:true});setState(s=>({...s,generatedMoves:{...(s.generatedMoves||{}),[category]:data.moves.map((move,index)=>({...move,id:move.id||`${category}-${index}`}))}}))}
  const closeTour=()=>{safeSetItem(ONBOARDED_KEY,'1');setTour(false)}
  const arenaName=state.selectedConcept?.name||state.topic
  const terrainSummary = controls.map(name => `${name}: ${levels[state.controls[name]-1]}`).join(' · ')
  const calibrationSummary = `${toolkit.faders[0].label}: ${state.faders[toolkit.faders[0].id]} · ${toolkit.faders[1].label}: ${state.faders[toolkit.faders[1].id]} · ${toolkit.faders[2].label}: ${state.faders[toolkit.faders[2].id]} · +${Math.max(0, toolkit.faders.length - 3)} more`
  const movesSummary = state.selectedMoves.length ? `${state.selectedMoves.length} moves selected` : 'No moves selected yet'
  const toggleSection = key => setOpenSections(current => ({ ...current, [key]: !current[key] }))
  return <main className="dashboard"><header className="dash-header"><button className="back" onClick={onBack}>← Vision</button><div className="brand"><span>THE GAMEMAKER’S TOOLKIT</span><b>ARENA CONTROL / LIVE</b></div><button className="button small" onClick={onNext}>Capture Arena →</button></header><div className="dashboard-shell shell"><VisionStageNav currentStep={5} completedStep={5} onSelect={onVisionStageSelect}/><div className="dash-grid"><section className="control-panel"><div className="status-line"><span><i/> SYSTEM ACTIVE</span><p>{arenaName}</p></div>{aiError&&<div className="ai-card">{aiError}</div>}<AccordionSection icon="⚙️" title="SHAPE THE TERRAIN" description="Set the four core conditions that define the arena." summary={terrainSummary} accent="#3B82F6" open={openSections.terrain} onToggle={() => toggleSection('terrain')}><div className="big-controls">{controls.map(name=><BigDial key={name} name={name} value={state.controls[name]} description={controlReading(state,name,state.controls[name])} suggested={(name==='SCOREBOARD'&&state.controls.EMPOWER<=2)||(name==='EMPOWER'&&state.controls.CHALLENGE>=4)} onChange={value=>setState(s=>({...s,controls:{...s.controls,[name]:value}}))}/>)}</div></AccordionSection><AccordionSection icon="🎚️" title="FINE CALIBRATION" description="Tune the eight internal conditions shaping how the arena feels." summary={calibrationSummary} accent="#2E8B7A" open={openSections.calibration} onToggle={() => toggleSection('calibration')}><div className="fader-bank"><div className="bank-label"><span>FINE CALIBRATION</span><b>08 CHANNELS</b></div><div className="fader-grid">{toolkit.faders.map(item=><Fader key={item.id} item={item} value={state.faders[item.id]} arenaName={arenaName} suggested={state.controls.CHALLENGE>=4&&['time','access'].includes(item.id)} onChange={value=>setState(s=>({...s,faders:{...s.faders,[item.id]:value}}))}/>)}</div></div></AccordionSection><AccordionSection icon="⚡" title="DESIGN MOVES" description="Generate and collect interventions that sharpen this arena." summary={movesSummary} accent="#E91E8C" open={openSections.moves} onToggle={() => toggleSection('moves')}><MoveBank state={state} setState={setState} onGenerate={generateMoves} generating={aiLoading}/></AccordionSection></section><aside className={`preview-panel ${mobilePreview?'open':''}`}><button type="button" className="preview-handle" onClick={()=>setMobilePreview(!mobilePreview)}>YOUR ARENA, RIGHT NOW <span>{mobilePreview?'↓':'↑'}</span></button><div className="preview-inner"><div className="eyebrow">THE GAMEMAKER IS WATCHING</div><h2>Your Arena,<br/>Right Now</h2><p>{aiSignal || preview}</p>{aiLoading&&<small className="signal-status">Local signal active · richer synthesis incoming</small>}<div className="meter"><span>FRICTION SIGNAL</span><div><i style={{width:`${Math.max(18,100-tensions.length*23)}%`}}/></div><b>{tensions.length===0?'QUIET':tensions.length>2?'HIGH FRICTION':'WATCH'}</b></div><div className="tensions"><h3>TENSION INDICATORS</h3>{tensions.length? tensions.map(t=><article className={t.severity} key={t.id}><i/><div><strong>{t.label}</strong><p>{t.message}</p></div></article>):<article className="clear"><i/><div><strong>No notable tension yet</strong><p>The controls are readable. Adjust with purpose; no value is inherently better.</p></div></article>}</div><div className="context-card"><span>ARENA FRAME</span><p><b>Audience</b>{state.framing.audience}</p><p><b>Duration</b>{state.framing.duration}</p><p><b>Twist</b>{state.framing.twist}</p></div></div></aside></div></div>{tour&&<Onboarding onDone={closeTour}/>}</main>
}

const sectionLabels = {
  conditions: '1. What conditions will learners live inside?',
  constraints: '2. What constraints will force real thinking?',
  choices: '3. What choices can actually change what happens?',
  evidence: '4. What evidence will show the arena is working?',
  interventions: '5. Where might the Gamemaker intervene?',
}

function localOutputBrief(state) {
  const chosen = Object.values(state.generatedMoves || {}).flat().filter(move => state.selectedMoves.includes(move.id))
  const dialReading = controls.map(name => `${name} is ${levels[state.controls[name]-1].toLowerCase()} (${state.controls[name]}/5)`).join('; ')
  const behaviors = [...state.framing.visibleBehaviors, state.framing.otherBehavior].filter(Boolean).join(', ')
  const tension = activeTensions(state)[0]
  return {
    arenaConcept: `${state.selectedConcept?.name || state.topic} places ${formatGradeDescriptor(state.grade)} inside ${state.selectedConcept?.tension || 'a consequential system'}. Rather than receiving the content from outside, they ${state.selectedConcept?.action?.toLowerCase() || 'make and defend choices that alter the arena'}.\n\nThe design makes knowledge useful because the arena responds to learner judgment. ${state.selectedConcept?.rationale || 'The conditions make recall insufficient and visible thinking necessary.'}`,
    sections: {
      conditions: `Learners enter as ${(state.selectedConcept?.roles || ['active decision makers']).join(', ')}. ${dialReading}. Those settings define the terrain without implying that a higher value is inherently better.`,
      constraints: chosen.length ? `The arena uses ${chosen.map(move => move.title).join(', ')}. In practice: ${chosen.map(move => move.implementation).join(' ')}` : `The initial constraint is the central tension itself: ${state.selectedConcept?.tension}. Add a Design Move before running the arena if learners need a sharper forcing condition.`,
      choices: `Learners must have a choice that changes the route, access, consequence, or options available to others. At EMPOWER ${state.controls.EMPOWER}/5 and Autonomy ${state.faders.autonomy}/5, protect the decisions that matter instead of offering cosmetic choice.`,
      evidence: `Look for ${behaviors || 'learners explaining, negotiating, revising, and adapting'}. The arena is working when those behaviors become necessary to move forward; turn a dial when compliance replaces judgment or uncertainty becomes paralysis.`,
      interventions: `Watch the first irreversible decision, the moment new information changes a strong position, and the point when consequences become visible. ${tension ? tension.message : 'Hold back while learners are productively navigating; intervene when the conditions obscure the thinking rather than provoke it.'} Twist protocol: ${state.framing.twist}.`,
    },
    gamemakersNote: `You have built an arena that asks learners to do more than know about ${state.topic}; it asks them to make judgment visible. Your work is to protect the conditions, watch what their choices reveal, and resist solving the most useful tension for them. May the odds—and the thinking—be ever in their favor.`,
  }
}

const pdfStyles=StyleSheet.create({page:{padding:0,fontFamily:'Helvetica',fontSize:10,color:'#29252b'},header:{backgroundColor:'#171119',color:'#fff',padding:'28 40 24'},brand:{fontSize:9,letterSpacing:2.2,color:'#d2ae55'},title:{fontSize:25,fontFamily:'Helvetica-Bold',marginTop:9},meta:{fontSize:9,color:'#b9aebe',marginTop:6},body:{padding:'24 40 34'},intro:{fontSize:11,lineHeight:1.55,marginBottom:12},section:{marginTop:14,borderTop:'1 solid #d9d1dc',paddingTop:9},h2:{fontSize:12,fontFamily:'Helvetica-Bold',color:'#683781',marginBottom:5},copy:{lineHeight:1.48},note:{backgroundColor:'#f1ebf4',padding:13,marginTop:18,lineHeight:1.5},noteLabel:{fontSize:8,fontFamily:'Helvetica-Bold',letterSpacing:1.5,color:'#683781'},footer:{position:'absolute',bottom:14,left:40,right:40,fontSize:7,color:'#817981',display:'flex',flexDirection:'row',justifyContent:'space-between'}})
function ArenaPDF({state}){const brief=state.outputBrief||localOutputBrief(state);return <Document><Page size="LETTER" style={pdfStyles.page}><View style={pdfStyles.header}><Text style={pdfStyles.brand}>THE GAMEMAKER'S TOOLKIT  ↗</Text><Text style={pdfStyles.title}>{state.selectedConcept?.name||'Gamemaker Design Brief'}</Text><Text style={pdfStyles.meta}>{state.grade} · {state.framing.audience} · {state.framing.duration}</Text></View><View style={pdfStyles.body}><Text style={pdfStyles.intro}>{brief.arenaConcept}</Text>{Object.entries(sectionLabels).map(([key,label])=><View style={pdfStyles.section} key={key}><Text style={pdfStyles.h2}>{label}</Text><Text style={pdfStyles.copy}>{brief.sections[key]}</Text></View>)}<View style={pdfStyles.note}><Text style={pdfStyles.noteLabel}>GAMEMAKER'S NOTE</Text><Text style={pdfStyles.copy}>{brief.gamemakersNote}</Text></View></View><View style={pdfStyles.footer}><Text>Framework developed by Sharon Matthews, Vital by Design</Text><Text>{new Date().toLocaleDateString()}</Text></View></Page></Document>}

function Stage3({state,setState,onBack,onStartOver}) {
  const {request,loading,error}=useAI(state.id)
  const started=useRef(false)
  useEffect(()=>{if(started.current||state.outputBrief)return;started.current=true;(async()=>{const brief=await request('outputBrief',buildArenaContext(state),localOutputBrief(state),{hardFailureMessage:'The control room lost the signal. Try capturing your arena again.'});setState(s=>({...s,outputBrief:brief}))})()},[request,state,setState])
  const brief=state.outputBrief||localOutputBrief(state)
  return <main className="summary shell"><div className="summary-top"><button className="back" onClick={onBack}>← Back to Dashboard</button><div className="eyebrow">ARENA CAPTURE / FINAL</div></div><h1>Capture<br/><em>the arena.</em></h1><p className="lede">A synthesized design brief—not a form dump, lesson plan, or worksheet.</p>{loading&&<div className="ai-card">The Gamemaker is synthesizing your design brief…</div>}{error&&<div className="ai-card">{error}</div>}<section className="summary-card"><div className="summary-title"><span>GAMEMAKER DESIGN BRIEF</span><h2>{state.selectedConcept?.name||state.topic}</h2><p>{gradeMetaLabel(state.grade)} · {state.framing.audience} · {state.framing.duration}</p></div><div className="brief-intro">{brief.arenaConcept.split('\n').map((paragraph,index)=><p key={index}>{paragraph}</p>)}</div><div className="north-star-sections">{Object.entries(sectionLabels).map(([key,label])=><article key={key}><span>{label.slice(0,2)}</span><div><h3>{label.slice(3)}</h3><p>{brief.sections[key]}</p></div></article>)}</div><div className="gamemaker-note"><span>GAMEMAKER'S NOTE</span><p>{brief.gamemakersNote}</p></div></section><div className="summary-actions"><PDFDownloadLink className="button" document={<ArenaPDF state={{...state,outputBrief:brief}}/>} fileName="gamemaker-arena-brief.pdf">{({loading:pdfLoading})=>pdfLoading?'Setting up your brief…':'Get Your Arena Brief ↓'}</PDFDownloadLink><button className="button ghost" onClick={onStartOver}>Build a New Arena</button></div></main>
}

function SavedProgressNotice({ onDismiss }) {
  return <div className="saved-progress-toast" role="status" aria-live="polite"><span>Saved progress was reset.</span><button type="button" className="text-button" onClick={onDismiss}>Dismiss</button></div>
}

export default function App(){
  const {sessions,save,remove,resetAll,didReset,clearResetNotice}=useSessions()
  const [state,setState]=useState(blank)
  const [welcome,setWelcome]=useState(()=>sessions.length>0)
  const [pendingVisionStep,setPendingVisionStep]=useState(null)
  useEffect(()=>{if(!welcome&&state.topic)save(state)},[state,welcome])
  const stage=state.stage
  useEffect(()=>{window.scrollTo({top:0,left:0,behavior:'auto'})},[stage,state.visionStep,welcome])
  const go=n=>setState(s=>({...s,stage:n}))
  const currentVisionStep = stage === 1 ? state.visionStep : 5
  const completedVisionStep = stage > 1 ? 5 : completedVisionStepForState(state)
  const handleVisionStageSelect = targetStep => {
    if (targetStep > completedVisionStep || targetStep === currentVisionStep) return
    setPendingVisionStep(targetStep)
  }
  const confirmVisionStageChange = () => {
    if (!pendingVisionStep) return
    setState(s => ({ ...s, stage: 1, visionStep: pendingVisionStep }))
    setWelcome(false)
    setPendingVisionStep(null)
  }
  const handleResetSavedProgress=()=>{
    resetAll()
    setState(blank())
    setWelcome(false)
  }
  return <><Progress stage={stage}/>{didReset&&<SavedProgressNotice onDismiss={clearResetNotice}/>}<button className="reset-progress-button" type="button" onClick={handleResetSavedProgress}>Reset saved progress</button><AnimatePresence mode="wait">{welcome?<motion.div key="welcome" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}><WelcomeBack sessions={sessions} onResume={s=>{setState({...blank(),...s,framing:{...blank().framing,...s.framing}});setWelcome(false)}} onNew={()=>{setState(blank());setWelcome(false)}} onDelete={remove}/></motion.div>:<motion.div key={stage} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.25}}>{stage===1?<ArenaVisioning state={state} setState={setState} onComplete={()=>setState(s=>({...s,stage:2,visionCompleted:true}))} stageNav={<VisionStageNav currentStep={currentVisionStep} completedStep={completedVisionStep} onSelect={handleVisionStageSelect}/>}/>:stage===2?<Stage2 state={state} setState={setState} onBack={()=>go(1)} onNext={()=>go(3)} onVisionStageSelect={handleVisionStageSelect}/>:<Stage3 state={state} setState={setState} onBack={()=>go(2)} onStartOver={()=>{setState(blank());go(1)}}/>}</motion.div>}</AnimatePresence>{pendingVisionStep&&<VisionNavModal step={pendingVisionStep} onConfirm={confirmVisionStageChange} onCancel={()=>setPendingVisionStep(null)}/>}</>
}
