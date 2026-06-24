const LOWERCASE_WORDS = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'yet', 'so', 'in', 'on', 'at', 'to', 'of', 'up'])
const ALWAYS_CAPITALIZE = new Map([
  ['holocaust', 'Holocaust'],
  ['jewish', 'Jewish'],
  ['nazi', 'Nazi'],
  ['american', 'American'],
  ['british', 'British'],
  ['french', 'French'],
  ['german', 'German'],
  ['polish', 'Polish'],
  ['loyalist', 'Loyalist'],
  ['patriot', 'Patriot'],
  ['revolution', 'Revolution'],
])

function capitalizeWord(word) {
  if (!word) return word
  const lower = word.toLowerCase()
  if (ALWAYS_CAPITALIZE.has(lower)) return ALWAYS_CAPITALIZE.get(lower)
  return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`
}

function formatToken(token, isFirstWord) {
  const parts = token.split(/([:/-])/)
  let wordIndex = 0

  return parts.map(part => {
    if (/^[:/-]$/.test(part) || !/[A-Za-z]/.test(part)) return part
    const lower = part.toLowerCase()
    const shouldLowercase = !isFirstWord && wordIndex === 0 && LOWERCASE_WORDS.has(lower)
    const formatted = shouldLowercase ? lower : capitalizeWord(part)
    wordIndex += 1
    return formatted
  }).join('')
}

export function sanitizeArenaTitle(value) {
  if (typeof value !== 'string') return value
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (!trimmed) return ''

  const tokens = trimmed.split(' ')
  let capitalizeNext = true

  return tokens.map(token => {
    const formatted = formatToken(token, capitalizeNext)
    capitalizeNext = /[:?!]$/.test(token)
    if (!capitalizeNext) capitalizeNext = false
    return formatted
  }).join(' ')
}

function capitalizeProperNouns(value) {
  let output = value
  for (const [lower, proper] of ALWAYS_CAPITALIZE.entries()) {
    output = output.replace(new RegExp(`\\b${lower}\\b`, 'gi'), proper)
  }
  return output
}

function collapseRepeatedSentences(value) {
  const parts = value.match(/[^.!?]+[.!?]*/g)
  if (!parts) return value
  const seen = new Set()
  const kept = []

  for (const part of parts) {
    const normalized = part.trim().replace(/\s+/g, ' ').replace(/\.{2,}/g, '.')
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    kept.push(normalized)
  }

  return kept.join(' ').trim()
}

export function sanitizeGeneratedText(value) {
  if (typeof value !== 'string') return value
  const trimmed = value.trim().replace(/[ \t]+/g, ' ')
  if (!trimmed) return ''

  const paragraphs = trimmed.split(/\n+/).map(paragraph => {
    const withoutDoublePeriods = paragraph.replace(/\.{2,}/g, '.')
    const deduped = collapseRepeatedSentences(withoutDoublePeriods)
    return capitalizeProperNouns(deduped).replace(/\s+([,.;:!?])/g, '$1').trim()
  }).filter(Boolean)

  return paragraphs.join('\n\n')
}
