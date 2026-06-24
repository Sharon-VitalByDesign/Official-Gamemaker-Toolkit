const LOWERCASE_WORDS = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'yet', 'so', 'in', 'on', 'at', 'to', 'of', 'up'])
const ALWAYS_CAPITALIZE = new Map([
  ['holocaust', 'Holocaust'],
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
