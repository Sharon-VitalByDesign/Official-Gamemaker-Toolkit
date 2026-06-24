import { formatGradeDescriptor } from './grades'

export function sanitizeGeneratedText(value, grade) {
  if (typeof value === 'string') {
    return value
      .replace(/\b(K-2|3-5|6-8|9-12)\s+learners\b/g, formatGradeDescriptor(grade))
      .replace(/\bfor\s+(K-2|3-5|6-8|9-12)\b/g, `for ${grade || '$1'}`)
      .replace(/\ba\s+(K-2|3-5|6-8|9-12)\s+arena\b/g, `a ${grade || '$1'} arena`)
      .trim()
  }
  if (Array.isArray(value)) return value.map(item => sanitizeGeneratedText(item, grade))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeGeneratedText(item, grade)]))
  }
  return value
}
