import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Document, Page, PDFDownloadLink, StyleSheet, Text, View } from '@react-pdf/renderer'
import toolkit from './data/toolkit.json'
import ArenaVisioning from './components/stage1/ArenaVisioning'
import { useAI } from './hooks/useAI'
import { buildArenaContext, buildOutputBriefContext } from './utils/contextBuilder'
import { buildFaderDescriptionFallback, CONTROL_COLORS, FADER_COLORS, FADER_ENDPOINTS, faderDescriptionFor, getChangedSettingKeys, getDialSignalRule, getFaderDescriptionSignature, getPersistentSignalHighlights, getSignalTooltip, getSuggestedFaderAdjustment, getTransientSignalHighlights, glowOpacityForValue, hexToRgba, snapshotSettings } from './utils/controlRoom'
import { ONBOARDED_KEY, SESSION_PREFIX, safeGetItem, safeKeys, safeRemoveItem, safeSetItem } from './utils/storage'
import { formatGradeDescriptor } from './utils/grades'
import { sanitizeArenaTitle, sanitizeGeneratedText } from './utils/titleCase'

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
  faders: Object.fromEntries(toolkit.faders.map(f => [f.id, 3])), faderDescriptions: null, faderDescriptionSignature: '', selectedMoves: [], generatedMoves: {}, outputBrief: null
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
  return {
    arenaConcept: brief.arenaConcept,
    sections: nextSections,
    gamemakersNote: brief.gamemakersNote,
  }
}

function sanitizeBriefForRender(state, brief) {
  const safeBrief = sanitizeOutputBrief(brief)
  if (!safeBrief) return null
  const namedPhrases = [state.topic, state.selectedConcept?.name].filter(Boolean)

  return {
    arenaConcept: sanitizeGeneratedText(safeBrief.arenaConcept, { namedPhrases }),
    sections: Object.fromEntries(Object.entries(safeBrief.sections).map(([key, value]) => [key, sanitizeGeneratedText(value, { namedPhrases })])),
    gamemakersNote: sanitizeGeneratedText(safeBrief.gamemakersNote, { namedPhrases }),
  }
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

function sanitizeFaderDescriptions(raw) {
  const groups = object(raw)
  if (!groups) return null
  const next = {}
  for (const item of toolkit.faders) {
    const entry = object(groups[item.id])
    if (!entry) return null
    next[item.id] = {}
    for (const value of [1, 2, 3, 4, 5]) {
      if (typeof entry[value] !== 'string') return null
      next[item.id][value] = entry[value]
    }
  }
  return next
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
    faderDescriptions: sanitizeFaderDescriptions(source.faderDescriptions),
    faderDescriptionSignature: text(source.faderDescriptionSignature),
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

function previewPartsFor(state) {
  const c = state.controls, f = state.faders
  const shape = c.SHAPE >= 4 ? 'tight boundaries make every choice visible' : c.SHAPE <= 2 ? 'the boundaries stay deliberately open' : 'the frame gives direction without solving the route'
  const challenge = c.CHALLENGE >= 4 ? 'Learners work under real pressure and must commit before certainty arrives.' : c.CHALLENGE <= 2 ? 'There is generous room to rehearse, notice patterns, and revise.' : 'The challenge asks for judgment without turning into a guessing game.'
  const empower = c.EMPOWER >= 4 ? 'You hand learners meaningful control over how the arena unfolds.' : c.EMPOWER <= 2 ? 'You hold most of the route-setting power, so make the purpose of those boundaries explicit.' : 'Authority is shared: you hold the frame while learners shape the path.'
  const watch = f.stakes >= 4 && f.feedback <= 2 ? 'Watch for public stakes arriving before learners have a useful signal.' : f.ambiguity >= 4 ? 'Watch for productive uncertainty tipping into simple confusion.' : 'Watch what learners do when their first plan stops working.'
  const arena = state.selectedConcept?.name || state.topic || 'this arena'
  return {
    condition: `In ${arena}, ${shape}.`,
    learnerImpact: `${challenge} ${empower}`,
    watchFor: watch,
  }
}

function previewFor(state) {
  const preview = previewPartsFor(state)
  return `${preview.condition} ${preview.learnerImpact} ${preview.watchFor}`
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

function VisionStageNav({ currentStep, completedStep, onSelect, trailingChip = null }) {
  return <nav className="vision-stage-nav" aria-label="Arena visioning navigation">{visionStageDefinitions.map(item => {
    const isCurrent = item.step === currentStep
    const isCompleted = item.step < currentStep || completedStep === 5
    const isClickable = item.step <= completedStep && !isCurrent
    return <button key={item.step} type="button" className={`vision-stage-chip ${isCurrent ? 'active' : ''} ${isCompleted ? 'done' : ''}`} disabled={!isClickable} onClick={() => isClickable && onSelect(item.step)}>
      <span className="vision-stage-chip-index">{item.icon}</span>
      <span className="vision-stage-chip-label">{item.label}</span>
    </button>
  })}{trailingChip ? trailingChip.onClick ? <button type="button" className={`vision-stage-chip ${trailingChip.active ? 'active' : ''}`} disabled={trailingChip.disabled} onClick={trailingChip.onClick}>
    <span className="vision-stage-chip-index">{trailingChip.icon}</span>
    <span className="vision-stage-chip-label">{trailingChip.label}</span>
  </button> : <div className={`vision-stage-chip vision-stage-chip-static ${trailingChip.active ? 'active' : ''}`}><span className="vision-stage-chip-index">{trailingChip.icon}</span><span className="vision-stage-chip-label">{trailingChip.label}</span></div> : null}</nav>
}

function VisionNavModal({ step, onConfirm, onCancel }) {
  const label = visionStageDefinitions.find(item => item.step === step)?.label || 'that stage'
  return <div className="vision-modal-backdrop" role="presentation"><div className="vision-modal" role="dialog" aria-modal="true" aria-labelledby="vision-nav-modal-title"><span className="eyebrow">ARENA WARNING</span><h2 id="vision-nav-modal-title">Return to {label}?</h2><p>Going back to {label} will let you change your selections. Your current dial settings and selected moves will be saved. Do you want to continue?</p><div className="vision-modal-actions"><button type="button" className="button ghost" onClick={onCancel}>Cancel</button><button type="button" className="button" onClick={onConfirm}>Continue</button></div></div></div>
}

function WelcomeBack({ sessions, onResume, onNew, onDelete }) {
  return <main className="welcome shell"><div className="eyebrow">CONTROL ROOM MEMORY</div><h1>Welcome back,<br/><em>Gamemaker.</em></h1><p>Your arenas are still here. Pick up a signal or start clean.</p><div className="session-list">{sessions.map(s => <article className="session-card" key={s.id}><div><span>{new Date(s.updatedAt).toLocaleDateString()}</span><h2>{s.topic || 'Untitled arena'}</h2><p>Stage {s.stage} · {s.selectedMoves.length} selected moves</p></div><div className="session-actions"><button className="button small" onClick={() => onResume(s)}>Resume</button><button className="icon-button" aria-label={`Delete ${s.topic}`} onClick={() => onDelete(s.id)}>×</button></div></article>)}</div><div className="welcome-actions"><button className="button ghost" onClick={onNew}>Start a New Arena</button></div><small>Your arenas are saved on this device only.</small></main>
}

function BigDial({ name, value, onChange, signalRule, description }) {
  const angle = -130 + (value-1)*65, center=82, radius=58
  const drag = useRef(null)
  const color = CONTROL_COLORS[name]
  const glow = glowOpacityForValue(value)
  const update = (clientY) => { if (!drag.current) return; const delta=(drag.current-clientY)/24; const next=Math.max(1,Math.min(5,Math.round(value+delta))); if(next!==value){onChange(next);drag.current=clientY} }
  return <div className={`dial-wrap ${signalRule?'suggested':''}`} style={{ '--dial-color': color, '--dial-glow': hexToRgba(color, glow), '--dial-box-glow': value === 5 ? `0 0 26px ${hexToRgba(color, 0.35)}` : 'none' }}><div className="dial-readout"><span>{name}</span><b>{levels[value-1]}</b></div><svg className="dial" viewBox="0 0 164 164" role="slider" aria-label={name} aria-valuemin="1" aria-valuemax="5" aria-valuenow={value} tabIndex="0" onKeyDown={e=>{if(e.key==='ArrowRight'||e.key==='ArrowUp')onChange(Math.min(5,value+1));if(e.key==='ArrowLeft'||e.key==='ArrowDown')onChange(Math.max(1,value-1))}} onPointerDown={e=>{drag.current=e.clientY;e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>update(e.clientY)} onPointerUp={()=>drag.current=null}>
    <circle className="dial-track" cx={center} cy={center} r={radius} pathLength="100" strokeDasharray="72 28" transform="rotate(140 82 82)"/><circle className="dial-progress" cx={center} cy={center} r={radius} pathLength="100" strokeDasharray={`${(value-1)*18} 100`} transform="rotate(140 82 82)" style={{ stroke: hexToRgba(color, glow), filter: `drop-shadow(0 0 7px ${hexToRgba(color, Math.min(1, glow + 0.15))})` }}/>
    <g transform={`rotate(${angle} 82 82)`}><circle className="knob" cx="82" cy="82" r="42"/><line className="needle" x1="82" y1="47" x2="82" y2="60"/><circle className="indicator" cx="82" cy="48" r="4" style={{ fill: color, filter: `drop-shadow(0 0 6px ${hexToRgba(color, 0.85)})` }}/></g>{[0,1,2,3,4].map(i=><line key={i} className="tick" x1="82" y1="15" x2="82" y2="22" transform={`rotate(${-130+i*65} 82 82)`}/>)}</svg>{signalRule && <span className="suggestion-dot" title={getSignalTooltip(signalRule)} aria-label={getSignalTooltip(signalRule)}>SIGNAL</span>}<div className="dial-buttons"><button onClick={()=>onChange(Math.max(1,value-1))}>−</button><span>0{value}</span><button onClick={()=>onChange(Math.min(5,value+1))}>+</button></div><p className="dial-context">{description}</p></div>
}

function Fader({ state, item, value, onChange, descriptions, arenaName }) {
  const reading = faderDescriptionFor(state, item, descriptions)
  const suggestion = getSuggestedFaderAdjustment(state, item)
  const fill = hexToRgba(FADER_COLORS[item.id], glowOpacityForValue(value))
  const labelTint = hexToRgba(FADER_COLORS[item.id], 0.78)
  const endpoints = FADER_ENDPOINTS[item.id]
  return <label className={`fader ${suggestion?'suggested':''}`} style={{ '--pct':`${(value-1)*25}%`, '--fader-fill': fill, '--fader-label-tint': labelTint }}>
    <div><span>{item.label}</span><b>0{value}</b></div>
    <input aria-label={item.label} aria-valuetext={`${value} of 5: ${reading}`} type="range" min="1" max="5" value={value} onChange={e=>onChange(+e.target.value)}/>
    <div className="fader-extremes"><span>{endpoints.left}</span><span>{endpoints.right}</span></div>
    <div className="fader-ticks">{[1,2,3,4,5].map(x=><i key={x}/>)}</div>
    <small>{reading}</small>
    {suggestion && <em>{suggestion}</em>}
  </label>
}

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

function MoveBank({ state, setState, onGenerate, generating, loadingMessage }) {
  const [active,setActive]=useState('')
  const shown=active ? state.generatedMoves?.[active] || [] : []
  const selectedMoveRecords = Object.values(state.generatedMoves || {}).flat().filter(move => state.selectedMoves.includes(move.id))
  const choose=async category=>{setActive(category);if(!state.generatedMoves?.[category])await onGenerate(category)}
  const toggle=id=>setState(s=>({...s,selectedMoves:s.selectedMoves.includes(id)?s.selectedMoves.filter(x=>x!==id):[...s.selectedMoves,id]}))
  return <div className="move-panel"><div className="panel-heading"><div><span>MOVE BANK</span><h2>Design Moves</h2></div></div><p className="move-intro">Choose a move type. The control room will translate it into this arena.</p><div className="move-categories">{toolkit.designMoves.map(d=><button type="button" className={active===d.name?'active':''} onClick={()=>choose(d.name)} key={d.name}><strong>{d.name}</strong><small>{d.definition}</small></button>)}</div><div className="move-list">{generating&&<div className="move-loading">{loadingMessage || 'The Gamemaker is building moves…'}</div>}{!active&&!generating&&<div className="move-empty">Select a Design Move to generate specific interventions.</div>}{shown.map(move=><button type="button" className={`move-card ${state.selectedMoves.includes(move.id)?'selected':''}`} onClick={()=>toggle(move.id)} key={move.id}><span>{active}</span><strong>{move.title}</strong><p>{move.description}</p><small>{move.implementation}</small><b>{state.selectedMoves.includes(move.id)?'✓':'+'}</b></button>)}</div><div className="selected-moves-panel"><div className="selected-strip"><span>SELECTED MOVES</span><strong>{state.selectedMoves.length.toString().padStart(2,'0')}</strong></div>{selectedMoveRecords.length ? <div className="selected-moves-list">{selectedMoveRecords.map(move => <article key={move.id} className="selected-move-item"><div className="selected-move-copy"><strong>{move.title}</strong><p>{move.implementation}</p></div><button type="button" className="selected-move-remove" onClick={()=>toggle(move.id)} aria-label={`Remove ${move.title} from selected moves`}>Remove</button></article>)}</div> : <div className="move-empty selected-empty">No moves selected yet.</div>}</div></div>
}

function Onboarding({onDone}) { const [step,setStep]=useState(0); const copy=[['The big four','These are your primary controls—the big dials on your arena.'],['Fine calibration','These faders tune the conditions inside each control.'],['Read the room','Your live preview changes as you adjust. Watch what the system notices.']]; return <div className="tour"><span>0{step+1} / 03</span><h3>{copy[step][0]}</h3><p>{copy[step][1]}</p><button onClick={()=>step<2?setStep(step+1):onDone()}>{step<2?'Next signal →':'Enter the control room'}</button><button className="tour-skip" onClick={onDone}>Skip</button></div> }

function Stage2({state,setState,onBack,onNext,onVisionStageSelect}) {
  const [previewSignal,setPreviewSignal]=useState(previewPartsFor(state))
  const [liveSignal,setLiveSignal]=useState(null)
  const [mobilePreview,setMobilePreview]=useState(false)
  const [tour,setTour]=useState(()=>!safeGetItem(ONBOARDED_KEY))
  const [openSections,setOpenSections]=useState({ terrain: true, calibration: false, moves: false })
  const [moveLoading,setMoveLoading]=useState(false)
  const [moveLoadingMessageIndex,setMoveLoadingMessageIndex]=useState(0)
  const [showAllHighlights,setShowAllHighlights]=useState(false)
  const [signalHighlights,setSignalHighlights]=useState({ condition: '', learnerImpact: '', watchFor: '' })
  const liveSignalAI = useAI(state.id)
  const moveAI = useAI(state.id)
  const faderAI = useAI(state.id)
  const { request: requestLiveSignal, loading: liveSignalLoading, error: liveSignalError } = liveSignalAI
  const { request: requestMove } = moveAI
  const { request: requestFaderDescriptions } = faderAI
  const settledSettingsRef = useRef(null)
  const highlightTimeoutRef = useRef(null)
  const showAllHighlightsRef = useRef(false)
  const moveLoadingMessages=['The Gamemaker is building moves…','Forging the next intervention…','Sharpening the pressure points…','Loading the control panel…']
  const tensions=activeTensions(state)
  const selected=Object.values(state.generatedMoves||{}).flat().filter(m=>state.selectedMoves.includes(m.id))
  const arenaName=state.selectedConcept?.name||state.topic
  const faderDescriptionSignature = getFaderDescriptionSignature(state)
  const effectiveFaderDescriptions = state.faderDescriptions || buildFaderDescriptionFallback(state)

  useEffect(()=>{showAllHighlightsRef.current=showAllHighlights},[showAllHighlights])
  useEffect(()=>()=>{if(highlightTimeoutRef.current)clearTimeout(highlightTimeoutRef.current)},[])

  useEffect(()=>{const id=setTimeout(()=>setPreviewSignal(previewPartsFor(state)),300);return()=>clearTimeout(id)},[state.controls,state.faders,state.topic,state.selectedConcept])

  useEffect(()=>{
    if(state.faderDescriptions && state.faderDescriptionSignature===faderDescriptionSignature) return
    let cancelled=false
    ;(async()=>{
      const fallback=buildFaderDescriptionFallback(state)
      const data=await requestFaderDescriptions('faderDescriptions',{...buildArenaContext(state),faderDefinitions:toolkit.faders,faderEndpoints:FADER_ENDPOINTS},fallback,{silentFallback:true})
      if(cancelled||!data) return
      setState(s=>({...s,faderDescriptions:data,faderDescriptionSignature:faderDescriptionSignature}))
    })()
    return()=>{cancelled=true}
  },[faderDescriptionSignature,requestFaderDescriptions,setState,state.faderDescriptionSignature,state.faderDescriptions,state.selectedConcept,state.topic,state.grade])

  useEffect(()=>{
    const previousSnapshot = settledSettingsRef.current
    const changedKeys = previousSnapshot ? getChangedSettingKeys(previousSnapshot, snapshotSettings(state)) : []
    const id=setTimeout(async()=>{
      const data=await requestLiveSignal('liveSignal',{...buildArenaContext(state),faderDefinitions:toolkit.faders,recentlyAdjusted:changedKeys},null,{silentFallback:true})
      if(data) setLiveSignal(data)
      settledSettingsRef.current=snapshotSettings(state)
      if(showAllHighlightsRef.current){
        if(highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
        setSignalHighlights(getPersistentSignalHighlights(state))
        return
      }
      if(changedKeys.length){
        const nextHighlights=getTransientSignalHighlights(changedKeys,state)
        setSignalHighlights(nextHighlights)
        if(highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
        highlightTimeoutRef.current=setTimeout(()=>setSignalHighlights({ condition: '', learnerImpact: '', watchFor: '' }),4000)
      }
    },1500)
    return()=>clearTimeout(id)
  },[requestLiveSignal,state.controls,state.faders,state.selectedConcept,state.topic,state.grade,state.framing])

  useEffect(()=>{
    if(showAllHighlights){
      if(highlightTimeoutRef.current) clearTimeout(highlightTimeoutRef.current)
      setSignalHighlights(getPersistentSignalHighlights(state))
    }else{
      setSignalHighlights({ condition: '', learnerImpact: '', watchFor: '' })
    }
  },[showAllHighlights,state.controls,state.faders])

  useEffect(()=>{
    if(!moveLoading){setMoveLoadingMessageIndex(0);return}
    const id=setInterval(()=>setMoveLoadingMessageIndex(index=>(index+1)%moveLoadingMessages.length),2400)
    return()=>clearInterval(id)
  },[moveLoading])

  const generateMoves=async category=>{const roles=state.selectedConcept?.roles||['learners'];const moveDefinition=toolkit.designMoves.find(move=>move.name===category);const fallbackMovesByCategory={['Create Constraint']:[{title:'Create Constraint: Narrow the Choices',description:`Reduce the number of viable routes inside ${state.selectedConcept?.name||state.topic} so learners must weigh trade-offs rather than collect more options.`,implementation:`Allow ${roles[0]||'one role'} access to only one critical resource at a time, then require a public commitment before any new evidence is released.`},{title:'Create Constraint: Lock the Timeline',description:`Make timing part of the problem so delay itself becomes consequential.`,implementation:`Set a short decision window for ${roles[1]||roles[0]||'a second role'} and make missed timing permanently close one possible path forward for the group.`},{title:'Create Constraint: Limit the Channel',description:`Restrict how information can move so learners must communicate with greater precision.`,implementation:`Permit ${roles[2]||roles[0]||'observers'} to share only one brief update per round, forcing the team to decide what is essential before acting.`}],['Create Visibility']:[{title:'Create Visibility: Public Reasoning Log',description:`Make the thinking in ${state.selectedConcept?.name||state.topic} visible so shifts in judgment can be tracked, challenged, and refined.`,implementation:`Require each role to post its current claim, the evidence behind it, and the condition that would make it change course before the next round begins.`},{title:'Create Visibility: Consequence Wall',description:`Put consequences where everyone can see them so decisions cannot disappear into private notes.`,implementation:`After each major choice, add the downstream effect to a shared board and require the next team to respond directly to what was set in motion.`},{title:'Create Visibility: Audience Checkpoint',description:`Use an external witness to surface what is persuasive, missing, or destabilizing.`,implementation:`Pause halfway through and have a watching group identify which decision seems strongest, which evidence is weakest, and what uncertainty is still shaping the arena.`}],['Create Interdependence']:[{title:'Create Interdependence: Split the Evidence',description:`Distribute what matters across roles so no one learner can solve ${state.selectedConcept?.name||state.topic} alone.`,implementation:`Give each role a different piece of the evidence and require at least two roles to combine their information before any binding decision can be made.`},{title:'Create Interdependence: Shared Risk',description:`Make one group’s choice alter the constraints everyone else must now operate within.`,implementation:`When ${roles[0]||'the first role'} acts, change the time, access, or visibility conditions for the other roles so every move becomes a collective problem.`},{title:'Create Interdependence: Relay Decision',description:`Structure the arena so one team must begin where another leaves off.`,implementation:`Have each role pass forward not just information but a live commitment, forcing the next role to adapt rather than restart from neutral ground.`}],['Create Agency']:[{title:'Create Agency: Choose the Rule',description:`Let learners alter one operating condition inside ${state.selectedConcept?.name||state.topic} so their choices reshape the terrain, not just the answer.`,implementation:`Offer two possible arena rules and require the group to adopt one before beginning, then live with the consequences of that structural choice.`},{title:'Create Agency: Claim the Priority',description:`Require roles to decide what value or outcome they will protect first.`,implementation:`Before the central conflict peaks, have each learner publicly name the priority they will defend and forbid them from protecting all goals at once.`},{title:'Create Agency: Spend the Power',description:`Give learners a limited opportunity to change the arena and force them to decide when it is worth using.`,implementation:`Provide one control-room token that can reopen access, slow time, or reveal evidence, and let the group decide when the intervention matters most.`}],['Create Asymmetry']:[{title:'Create Asymmetry: Unequal Briefing',description:`Give different roles uneven access to power, information, or credibility so the arena cannot be read from one neutral center.`,implementation:`Assign one role a full brief, one role partial evidence, and one role social authority, then require them to negotiate without flattening those imbalances.`},{title:'Create Asymmetry: Protected Knowledge',description:`Make one perspective carry knowledge others cannot verify on their own.`,implementation:`Let a single role see a hidden consequence before everyone else and decide when, how, or whether to reveal it to the group.`},{title:'Create Asymmetry: Uneven Stakes',description:`Ensure that the same decision costs different roles very different things.`,implementation:`Attach a specific loss to each role if the wrong choice is made, so agreement requires more than surface consensus.`}],['Create Urgency']:[{title:'Create Urgency: Expiring Option',description:`Make one promising route disappear if learners hesitate too long.`,implementation:`Tell the group that one critical option expires after the next discussion round, forcing them to move before they feel fully ready.`},{title:'Create Urgency: Countdown Release',description:`Release conditions in timed bursts so learners must decide while the picture is still forming.`,implementation:`Deliver new evidence every few minutes, but require a provisional decision before the final piece arrives.`},{title:'Create Urgency: Immediate Consequence',description:`Shorten the gap between action and impact so delay becomes part of the problem.`,implementation:`After each decision, immediately reveal one concrete effect on another role’s options, resources, or safety.`}],['Create Uncertainty']:[{title:'Create Uncertainty: Conflicting Signals',description:`Introduce evidence that points in two plausible directions so certainty has to be earned.`,implementation:`Give two roles different accounts of the same event and require the group to act before resolving which account is more trustworthy.`},{title:'Create Uncertainty: Hidden Variable',description:`Keep one structural condition invisible until learners have already committed.`,implementation:`Ask the class to choose a path, then reveal a missing condition that changes what that choice now means.`},{title:'Create Uncertainty: Partial Reveal',description:`Let the arena unfold with deliberate gaps so learners must infer what matters next.`,implementation:`Release only enough evidence to support two competing interpretations and require learners to justify which uncertainty they are willing to carry.`}],['Create Opportunity']:[{title:'Create Opportunity: Unexpected Opening',description:`Offer a high-leverage path that learners can choose to pursue, ignore, or exploit.`,implementation:`Midway through the arena, reveal a new alliance, resource, or audience that could change the outcome if the group reorganizes around it.`},{title:'Create Opportunity: Earn the Shortcut',description:`Make a powerful option available only if learners can justify why they should use it.`,implementation:`Present a strategic shortcut, but require the group to defend publicly what they would gain, risk, and lose by taking it.`},{title:'Create Opportunity: Rewrite the Next Step',description:`Give learners a chance to open a new route that did not exist at the start.`,implementation:`After the first irreversible decision, let the class propose one new option for what happens next and vote on whether it truly belongs in the arena.`}]}[category]||[];const fallback={moves:(fallbackMovesByCategory.length?fallbackMovesByCategory:[1,2,3].map(index=>({title:`${category}: ${index===1?'Open the Fork':index===2?'Shift the Signal':'Make the Consequence Visible'}`,description:`A ${category.toLowerCase()} move shaped for ${state.selectedConcept?.name||state.topic}.`,implementation:`Give ${roles[(index-1)%roles.length]||'learners'} a consequential decision tied directly to ${state.selectedConcept?.tension||state.topic}; reveal the result before the next choice.`}))).map((move,index)=>({id:`${category.toLowerCase().replace(/\W/g,'-')}-${index+1}`,...move}))};setMoveLoading(true);try{const data=await requestMove('moves',{...buildArenaContext(state),requestedMove:category,requestedMoveDefinition:moveDefinition?.definition||'',requestedMoveExamples:moveDefinition?.examples||[],selectedMoves:selected},fallback,{silentFallback:true});setState(s=>({...s,generatedMoves:{...(s.generatedMoves||{}),[category]:data.moves.map((move,index)=>({...move,id:move.id||`${category}-${index}`}))}}))}finally{setMoveLoading(false)}}
  const closeTour=()=>{safeSetItem(ONBOARDED_KEY,'1');setTour(false)}
  const terrainSummary = controls.map(name => `${name}: ${levels[state.controls[name]-1]}`).join(' · ')
  const calibrationSummary = `${toolkit.faders[0].label}: ${state.faders[toolkit.faders[0].id]} · ${toolkit.faders[1].label}: ${state.faders[toolkit.faders[1].id]} · ${toolkit.faders[2].label}: ${state.faders[toolkit.faders[2].id]} · +${Math.max(0, toolkit.faders.length - 3)} more`
  const movesSummary = state.selectedMoves.length ? `${state.selectedMoves.length} moves selected` : 'No moves selected yet'
  const toggleSection = key => setOpenSections(current => ({ ...current, [key]: !current[key] }))
  const hasPendingSignalUpdate = settledSettingsRef.current ? getChangedSettingKeys(settledSettingsRef.current, snapshotSettings(state)).length > 0 : !liveSignal
  const displayedSignal = hasPendingSignalUpdate ? previewSignal : (liveSignal || previewSignal)
  const signalSections = [
    { id: 'condition', label: 'CURRENT CONDITION', text: displayedSignal.condition },
    { id: 'learnerImpact', label: 'WHAT THIS DOES TO LEARNERS', text: displayedSignal.learnerImpact },
    { id: 'watchFor', label: 'WHAT TO WATCH FOR', text: displayedSignal.watchFor },
  ]

  return <main className="dashboard"><header className="dash-header"><button className="back" onClick={onBack}>← Vision</button><div className="brand"><span>THE GAMEMAKER’S TOOLKIT</span><b>ARENA CONTROL / LIVE</b></div><button className="button small" onClick={onNext}>Capture Arena →</button></header><div className="dashboard-shell shell"><VisionStageNav currentStep={5} completedStep={5} onSelect={onVisionStageSelect} trailingChip={{ icon: '🎛️', label: 'Control Room', active: true }}/><div className="dash-grid"><section className="control-panel"><div className="status-line"><span><i/> SYSTEM ACTIVE</span><p>{arenaName}</p></div>{liveSignalError&&<div className="ai-card">{liveSignalError}</div>}<AccordionSection icon="⚙️" title="SHAPE THE TERRAIN" description="Set the four core conditions that define the arena." summary={terrainSummary} accent="#3B82F6" open={openSections.terrain} onToggle={() => toggleSection('terrain')}><div className="big-controls">{controls.map(name=><BigDial key={name} name={name} value={state.controls[name]} description={controlReading(state,name,state.controls[name])} signalRule={getDialSignalRule(name,tensions)} onChange={value=>setState(s=>({...s,controls:{...s.controls,[name]:value}}))}/>)}</div></AccordionSection><AccordionSection icon="🎚️" title="FINE CALIBRATION" description="Tune the eight internal conditions shaping how the arena feels." summary={calibrationSummary} accent="#2E8B7A" open={openSections.calibration} onToggle={() => toggleSection('calibration')}><div className="fader-bank"><div className="bank-label"><span>FINE CALIBRATION</span><b>08 CHANNELS</b></div><div className="fader-grid">{toolkit.faders.map(item=><Fader key={item.id} state={state} item={item} value={state.faders[item.id]} descriptions={effectiveFaderDescriptions} arenaName={arenaName} onChange={value=>setState(s=>({...s,faders:{...s.faders,[item.id]:value}}))}/>)}</div></div></AccordionSection><AccordionSection icon="⚡" title="DESIGN MOVES" description="Generate and collect interventions that sharpen this arena." summary={movesSummary} accent="#E91E8C" open={openSections.moves} onToggle={() => toggleSection('moves')}><MoveBank state={state} setState={setState} onGenerate={generateMoves} generating={moveLoading} loadingMessage={moveLoadingMessages[moveLoadingMessageIndex]}/></AccordionSection></section><aside className={`preview-panel ${mobilePreview?'open':''}`}><button type="button" className="preview-handle" onClick={()=>setMobilePreview(!mobilePreview)}>YOUR ARENA, RIGHT NOW <span>{mobilePreview?'↓':'↑'}</span></button><div className="preview-inner"><div className="signal-topline"><div className="eyebrow">THE GAMEMAKER IS WATCHING</div><button type="button" className={`highlight-toggle ${showAllHighlights?'active':''}`} title="See how every dial and fader is shaping your arena right now" aria-pressed={showAllHighlights} onClick={()=>setShowAllHighlights(value=>!value)}>Show All Highlights</button></div><h2>Your Arena,<br/>Right Now</h2><div className="signal-sentences">{signalSections.map(section=><article key={section.id} className={`signal-sentence ${signalHighlights[section.id]?'active':''}`} style={{ '--signal-highlight': signalHighlights[section.id] || 'transparent' }}><span>{section.label}</span><p>{section.text}</p></article>)}</div>{liveSignalLoading&&<small className="signal-status">Local signal active · richer synthesis incoming</small>}<div className="meter"><span>FRICTION SIGNAL</span><div><i style={{width:`${Math.max(18,100-tensions.length*23)}%`}}/></div><b>{tensions.length===0?'QUIET':tensions.length>2?'HIGH FRICTION':'WATCH'}</b></div><div className="tensions"><h3>TENSION INDICATORS</h3>{tensions.length? tensions.map(t=><article className={t.severity} key={t.id}><i/><div><strong>{t.label}</strong><p>{t.explanation}</p><small>Suggested action: {t.suggestion}</small></div></article>):<article className="clear"><i/><div><strong>No notable tension yet</strong><p>The controls are readable. Adjust with purpose; no value is inherently better.</p></div></article>}</div><div className="context-card"><span>ARENA FRAME</span><p><b>Audience</b>{state.framing.audience}</p><p><b>Duration</b>{state.framing.duration}</p><p><b>Twist</b>{state.framing.twist}</p></div></div></aside></div></div>{tour&&<Onboarding onDone={closeTour}/>}</main>
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
  const conceptName = state.selectedConcept?.name || state.topic
  const gradeDescriptor = formatGradeDescriptor(state.grade)
  const roleLine = (state.selectedConcept?.roles || ['active decision makers']).join(', ')
  const actionLine = state.selectedConcept?.action || 'make and defend choices that alter the arena'
  const rationaleLine = state.selectedConcept?.rationale || 'The conditions make recall insufficient and visible thinking necessary.'
  const moveLines = chosen.length
    ? chosen.map(move => `${move.title} — ${move.implementation}`).join(' ')
    : 'No specific moves have been selected yet. Return to the Control Room and choose at least one Design Move to sharpen the constraints in this arena.'

  return sanitizeBriefForRender(state, {
    arenaConcept: `${conceptName} drops ${gradeDescriptor} into a living system where they cannot stay outside the problem and simply describe it. Learners enter as ${roleLine}, and the arena asks them to move from inside the tension rather than watch it from a safe distance.\n\nAs the conditions tighten, they must ${actionLine.charAt(0).toLowerCase()}${actionLine.slice(1)}. ${rationaleLine}`,
    sections: {
      conditions: `Learners enter as ${(state.selectedConcept?.roles || ['active decision makers']).join(', ')}. ${dialReading}. Those settings define the terrain without implying that a higher value is inherently better.`,
      constraints: moveLines,
      choices: `Learners must have a choice that changes the route, access, consequence, or options available to others. At EMPOWER ${state.controls.EMPOWER}/5 and Autonomy ${state.faders.autonomy}/5, protect the decisions that matter instead of offering cosmetic choice.`,
      evidence: `Look for ${behaviors || 'learners explaining, negotiating, revising, and adapting'}. The arena is working when those behaviors become necessary to move forward; turn a dial when compliance replaces judgment or uncertainty becomes paralysis.`,
      interventions: `Watch the first irreversible decision, the moment new information changes a strong position, and the point when consequences become visible. ${tension ? tension.message : 'Hold back while learners are productively navigating; intervene when the conditions obscure the thinking rather than provoke it.'} Twist protocol: ${state.framing.twist}.`,
    },
    gamemakersNote: `You have built an arena that asks learners to do more than know about ${state.topic}; it asks them to make judgment visible. Your work is to protect the conditions, watch what their choices reveal, and resist solving the most useful tension for them. May the odds—and the thinking—be ever in their favor.`,
  }) || {
    arenaConcept: '',
    sections: { conditions: '', constraints: '', choices: '', evidence: '', interventions: '' },
    gamemakersNote: '',
  }
}

const pdfStyles=StyleSheet.create({page:{padding:0,fontFamily:'Helvetica',fontSize:10,color:'#29252b'},header:{backgroundColor:'#171119',color:'#fff',padding:'28 40 24'},brand:{fontSize:9,letterSpacing:2.2,color:'#d2ae55'},title:{fontSize:25,fontFamily:'Helvetica-Bold',marginTop:9},meta:{fontSize:9,color:'#b9aebe',marginTop:6},body:{padding:'24 40 34'},intro:{fontSize:11,lineHeight:1.55,marginBottom:12},section:{marginTop:14,borderTop:'1 solid #d9d1dc',paddingTop:9},h2:{fontSize:12,fontFamily:'Helvetica-Bold',color:'#683781',marginBottom:5},copy:{lineHeight:1.48},note:{backgroundColor:'#f1ebf4',padding:13,marginTop:18,lineHeight:1.5},noteLabel:{fontSize:8,fontFamily:'Helvetica-Bold',letterSpacing:1.5,color:'#683781'},footer:{position:'absolute',bottom:14,left:40,right:40,fontSize:7,color:'#817981',display:'flex',flexDirection:'row',justifyContent:'space-between'}})
function ArenaPDF({state}){const brief=sanitizeBriefForRender(state,state.outputBrief)||localOutputBrief(state);return <Document><Page size="LETTER" style={pdfStyles.page}><View style={pdfStyles.header}><Text style={pdfStyles.brand}>THE GAMEMAKER'S TOOLKIT  ↗</Text><Text style={pdfStyles.title}>{state.selectedConcept?.name||'Gamemaker Design Brief'}</Text><Text style={pdfStyles.meta}>{state.grade} · {state.framing.audience} · {state.framing.duration}</Text></View><View style={pdfStyles.body}><Text style={pdfStyles.intro}>{brief.arenaConcept}</Text>{Object.entries(sectionLabels).map(([key,label])=><View style={pdfStyles.section} key={key}><Text style={pdfStyles.h2}>{label}</Text><Text style={pdfStyles.copy}>{brief.sections[key]}</Text></View>)}<View style={pdfStyles.note}><Text style={pdfStyles.noteLabel}>GAMEMAKER'S NOTE</Text><Text style={pdfStyles.copy}>{brief.gamemakersNote}</Text></View></View><View style={pdfStyles.footer}><Text>Framework developed by Sharon Matthews, Vital by Design</Text><Text>{new Date().toLocaleDateString()}</Text></View></Page></Document>}

function Stage3({state,setState,onBack,onStartOver}) {
  const {request,loading,error}=useAI(state.id)
  const started=useRef(false)
  useEffect(()=>{if(started.current||state.outputBrief)return;started.current=true;(async()=>{const brief=await request('outputBrief',buildOutputBriefContext(state),localOutputBrief(state),{hardFailureMessage:'The control room lost the signal. Try capturing your arena again.'});setState(s=>({...s,outputBrief:sanitizeBriefForRender(s,brief) || localOutputBrief(s)}))})()},[request,state,setState])
  const brief=sanitizeBriefForRender(state,state.outputBrief)||localOutputBrief(state)
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
  return <><Progress stage={stage}/>{didReset&&<SavedProgressNotice onDismiss={clearResetNotice}/>}<button className="reset-progress-button" type="button" onClick={handleResetSavedProgress}>Reset saved progress</button><AnimatePresence mode="wait">{welcome?<motion.div key="welcome" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}><WelcomeBack sessions={sessions} onResume={s=>{setState({...blank(),...s,framing:{...blank().framing,...s.framing}});setWelcome(false)}} onNew={()=>{setState(blank());setWelcome(false)}} onDelete={remove}/></motion.div>:<motion.div key={stage} initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-8}} transition={{duration:.25}}>{stage===1?<ArenaVisioning state={state} setState={setState} onComplete={()=>setState(s=>({...s,stage:2,visionCompleted:true}))} stageNav={<VisionStageNav currentStep={currentVisionStep} completedStep={completedVisionStep} onSelect={handleVisionStageSelect} trailingChip={{ icon:'🎛️', label:'Control Room', active:false, disabled:!state.visionCompleted, onClick:state.visionCompleted?()=>go(2):undefined }}/>} />:stage===2?<Stage2 state={state} setState={setState} onBack={()=>go(1)} onNext={()=>go(3)} onVisionStageSelect={handleVisionStageSelect}/>:<Stage3 state={state} setState={setState} onBack={()=>go(2)} onStartOver={()=>{setState(blank());go(1)}}/>}</motion.div>}</AnimatePresence>{pendingVisionStep&&<VisionNavModal step={pendingVisionStep} onConfirm={confirmVisionStageChange} onCancel={()=>setPendingVisionStep(null)}/>}</>
}
