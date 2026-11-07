import type { Locale } from '@mam/i18n'

export type Theme = 'light' | 'dark'

export const THEME_COOKIE = 'mam_theme'
export const PREFERENCE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export function parseTheme(value: string | undefined | null): Theme {
  return value === 'dark' ? 'dark' : 'light'
}

export interface Preferences {
  locale: Locale
  theme: Theme
}
