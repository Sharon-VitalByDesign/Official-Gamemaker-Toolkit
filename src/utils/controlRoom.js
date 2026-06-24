import toolkit from '../data/toolkit.json'

export const CONTROL_COLORS = {
  SHAPE: '#3B82F6',
  CHALLENGE: '#C0392B',
  EMPOWER: '#5B2C83',
  SCOREBOARD: '#2E8B7A',
}

export const FADER_COLORS = {
  time: '#E05C4B',
  access: '#E8877B',
  information: '#E8A89E',
  ambiguity: '#8B5CF6',
  autonomy: '#A78BFA',
  stakes: '#4FB8A5',
  collaboration: '#60A5FA',
  feedback: '#7DCFC4',
}

export const FADER_ENDPOINTS = {
  time: { left: 'Spacious', right: 'Compressed' },
  access: { left: 'Fully Restricted', right: 'Fully Open' },
  ambiguity: { left: 'Fully Specified', right: 'Deliberately Open' },
  information: { left: 'Everything Provided', right: 'Significant Gaps' },
  autonomy: { left: 'Teacher-Directed', right: 'Self-Directed' },
  stakes: { left: 'Private & Low-Stakes', right: 'Public & High-Stakes' },
  collaboration: { left: 'Fully Solo', right: 'Fully Interdependent' },
  feedback: { left: 'After Completion', right: 'Continuous & Real-Time' },
}

const OPACITY_SCALE = { 1: 0.2, 2: 0.4, 3: 0.6, 4: 0.8, 5: 1 }

export function glowOpacityForValue(value) {
  return OPACITY_SCALE[Math.max(1, Math.min(5, Number(value) || 3))]
}

export function hexToRgba(hex, alpha = 1) {
  const normalized = hex.replace('#', '')
  const source = normalized.length === 3 ? normalized.split('').map(char => `${char}${char}`).join('') : normalized
  const int = Number.parseInt(source, 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function snapshotSettings(state) {
  return {
    controls: { ...state.controls },
    faders: { ...state.faders },
  }
}

export function getChangedSettingKeys(previous, next) {
  if (!previous) return []
  const changed = []
  for (const key of Object.keys(next.controls || {})) {
    if (previous.controls?.[key] !== next.controls?.[key]) changed.push(key)
  }
  for (const key of Object.keys(next.faders || {})) {
    if (previous.faders?.[key] !== next.faders?.[key]) changed.push(key)
  }
  return changed
}

export function getFaderDescriptionSignature(state) {
  return [
    state.selectedConcept?.id || 'no-concept',
    state.topic || 'no-topic',
    state.grade || 'no-grade',
  ].join('::')
}

export function buildFaderDescriptionFallback(state) {
  const arena = state.selectedConcept?.name || state.topic || 'this arena'
  const topic = state.topic || 'the topic'
  return Object.fromEntries(toolkit.faders.map(item => [item.id, {
    1: `In ${arena}, ${item.downDescription.toLowerCase()}. That makes ${topic} feel stable enough for learners to gather themselves before committing.`,
    2: `In ${arena}, ${item.label.toLowerCase()} stays mostly on the low side. Learners still have support, but they begin to feel which conditions are being gently tightened.`,
    3: `In ${arena}, ${item.label.toLowerCase()} sits in deliberate balance. Learners have enough structure to move, but not enough to ignore the decisions in front of them.`,
    4: `In ${arena}, ${item.label.toLowerCase()} is turned high. Learners need to respond while the conditions are still shifting beneath their feet.`,
    5: `In ${arena}, ${item.upDescription.toLowerCase()}. The setting itself becomes part of the arena, not just the background around it.`,
  }]))
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeFaderDescription(arena, description) {
  if (!description) return description
  if (!arena || arena === 'this arena') return description
  const arenaPattern = escapeRegex(arena)
  return description
    .replace(new RegExp(`^In ${arenaPattern}:\\s*In ${arenaPattern}[:,]?\\s*`, 'i'), `In ${arena}: `)
    .replace(new RegExp(`^In ${arenaPattern},\\s*In ${arenaPattern}[:,]?\\s*`, 'i'), `In ${arena}, `)
}

export function faderDescriptionFor(state, item, descriptions) {
  const arena = state.selectedConcept?.name || state.topic || 'this arena'
  const rawDescription = descriptions?.[item.id]?.[state.faders[item.id]] || buildFaderDescriptionFallback(state)?.[item.id]?.[state.faders[item.id]] || `In ${arena}, ${item.label.toLowerCase()} is shaping the next decision.`
  return normalizeFaderDescription(arena, rawDescription)
}

export function getSignalTooltip(rule) {
  if (!rule) return ''
  return `${rule.label}: ${rule.explanation} Suggested action: ${rule.suggestion}`
}

export function getSuggestedFaderAdjustment(state, item) {
  const value = state.faders[item.id]
  if (item.id === 'access' && state.faders.time >= 4 && value >= 4) {
    return 'Time is compressed but Access is fully open — consider restricting Access to match the urgency, or giving learners more time to use the available resources.'
  }
  if (item.id === 'time' && state.controls.CHALLENGE >= 4 && value <= 2) {
    return 'CHALLENGE is high but Time is still spacious — consider compressing Time so learners have to commit before certainty arrives.'
  }
  if (item.id === 'information' && state.controls.CHALLENGE >= 4 && value <= 2) {
    return 'CHALLENGE is high but Information Completeness is still generous — consider increasing the gaps so learners must notice what is missing and seek it.'
  }
  if (item.id === 'autonomy' && state.controls.EMPOWER >= 4 && value <= 2) {
    return 'EMPOWER is high but Autonomy is still teacher-directed — consider increasing Autonomy so learner choices actually change the route.'
  }
  if (item.id === 'stakes' && state.controls.SCOREBOARD >= 4 && value <= 2) {
    return 'SCOREBOARD is strong but Stakes / Visibility is still private — consider raising the visibility so success criteria matter in public, not only on paper.'
  }
  if (item.id === 'feedback' && state.controls.SCOREBOARD >= 4 && value <= 2) {
    return 'SCOREBOARD is clear but Feedback Timing lands only at the end — consider moving feedback earlier so learners can adjust while the arena is still live.'
  }
  if (item.id === 'ambiguity' && state.controls.EMPOWER >= 4 && value <= 2) {
    return 'EMPOWER is high but Ambiguity is tightly specified — consider opening the problem a bit more so learners have to frame part of the challenge themselves.'
  }
  if (item.id === 'collaboration' && state.controls.SHAPE >= 4 && value <= 2) {
    return 'SHAPE is highly engineered but Collaboration Mode is still solo — consider adding interdependence so the structure forces learners to rely on one another.'
  }
  return ''
}

const SIGNAL_SECTION_KEYS = {
  condition: ['SHAPE', 'time', 'access', 'information', 'collaboration'],
  learnerImpact: ['EMPOWER', 'ambiguity', 'autonomy'],
  watchFor: ['CHALLENGE', 'SCOREBOARD', 'stakes', 'feedback'],
}

function colorForKey(key) {
  return CONTROL_COLORS[key] || FADER_COLORS[key] || '#C9A84C'
}

function activeColorForSection(keys, state, allMode = false) {
  const colors = new Set(keys.flatMap(key => {
    if (allMode) {
      const controlValue = state.controls?.[key]
      const faderValue = state.faders?.[key]
      if ((typeof controlValue === 'number' && controlValue !== 3) || (typeof faderValue === 'number' && faderValue !== 3)) return [colorForKey(key)]
      return []
    }
    return [colorForKey(key)]
  }))
  if (!colors.size) return ''
  return colors.size > 1 ? '#C9A84C' : [...colors][0]
}

export function getTransientSignalHighlights(changedKeys, state) {
  return Object.fromEntries(Object.entries(SIGNAL_SECTION_KEYS).map(([section, keys]) => {
    const relevant = changedKeys.filter(key => keys.includes(key))
    return [section, activeColorForSection(relevant, state)]
  }))
}

export function getPersistentSignalHighlights(state) {
  return Object.fromEntries(Object.entries(SIGNAL_SECTION_KEYS).map(([section, keys]) => [section, activeColorForSection(keys, state, true)]))
}

export function getDialSignalRule(name, tensions) {
  return tensions.find(rule => (rule.affectedControls || []).includes(name)) || null
}
