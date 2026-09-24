/**
 * localStorage is used only for small, disposable preferences -- which session
 * is open, whether the table diagram is showing. Anything that would hurt to
 * lose lives in IndexedDB behind a repository.
 *
 * Every access is guarded: Safari private mode, blocked site data and
 * storage-quota errors all throw here, and none of them should break the app.
 */

const PREFIX = 'handforge:'

export const PREFERENCE_KEYS = {
  activeSession: 'activeSession',
  showTableDiagram: 'showTableDiagram',
} as const

export type PreferenceKey = (typeof PREFERENCE_KEYS)[keyof typeof PREFERENCE_KEYS]

export function readPreference(key: PreferenceKey): string | null {
  try {
    return localStorage.getItem(PREFIX + key)
  } catch {
    return null
  }
}

export function writePreference(key: PreferenceKey, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(PREFIX + key)
    else localStorage.setItem(PREFIX + key, value)
  } catch {
    // Preferences are a convenience; losing them is not an error worth surfacing.
  }
}

export function readBooleanPreference(key: PreferenceKey, fallback: boolean): boolean {
  const raw = readPreference(key)
  if (raw === null) return fallback
  return raw === 'true'
}
