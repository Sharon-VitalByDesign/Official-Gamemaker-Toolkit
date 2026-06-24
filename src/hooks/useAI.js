import { useCallback, useState } from 'react'
import { schemas, validators } from '../utils/aiContracts'
import { safeGetItem, safeSetItem } from '../utils/storage'
import { sanitizeGeneratedText } from '../utils/text'

export function useAI(sessionId) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const countKey = `${sessionId}_ai_requests`

  const request = useCallback(async (type, context, fallback, options = {}) => {
    const { silentFallback = false, hardFailureMessage = '', withMeta = false } = options
    const parsedCount = Number(safeGetItem(countKey))
    const count = Number.isFinite(parsedCount) && parsedCount >= 0 ? parsedCount : 0
    const finalize = (data, source) => {
      const sanitized = sanitizeGeneratedText(data, context?.gradeLevel)
      return withMeta ? { data: sanitized, source } : sanitized
    }
    if (count >= 15) {
      setError('Your control room has reached its session limit. Your PDF has everything you need, Gamemaker.')
      return finalize(fallback, 'rate-limit')
    }
    setLoading(true); setError('')
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch('/api/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, context, schema: schemas[type] }) })
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || 'AI request failed')
        if (!validators[type]?.(body.data)) throw new Error('The response did not match its contract')
        safeSetItem(countKey, String(count + 1))
        setLoading(false)
        return finalize(body.data, 'ai')
      } catch (requestError) {
        if (attempt === 1 && !silentFallback && hardFailureMessage) setError(hardFailureMessage)
      }
    }
    setLoading(false)
    return finalize(fallback, 'fallback')
  }, [countKey])

  return { request, loading, error }
}
