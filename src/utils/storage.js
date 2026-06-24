export const SESSION_PREFIX = 'gamemaker_session_'
export const ONBOARDED_KEY = 'gamemaker_onboarded'

function getStorage() {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function safeGetItem(key) {
  try {
    return getStorage()?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function safeSetItem(key, value) {
  try {
    getStorage()?.setItem(key, value)
    return true
  } catch {
    return false
  }
}

export function safeRemoveItem(key) {
  try {
    getStorage()?.removeItem(key)
    return true
  } catch {
    return false
  }
}

export function safeKeys() {
  try {
    const storage = getStorage()
    return storage ? Object.keys(storage) : []
  } catch {
    return []
  }
}
