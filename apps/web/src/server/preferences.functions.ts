import { LOCALE_COOKIE, parseLocale, type Locale } from '@mam/i18n'
import { createServerFn } from '@tanstack/react-start'
import { getCookie, setCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import {
  PREFERENCE_COOKIE_MAX_AGE,
  THEME_COOKIE,
  parseTheme,
  type Preferences,
  type Theme,
} from '../lib/preferences'

const cookieOptions = {
  path: '/',
  sameSite: 'lax',
  maxAge: PREFERENCE_COOKIE_MAX_AGE,
} as const

const themeSchema = z.object({ theme: z.enum(['light', 'dark']) })
const localeSchema = z.object({ locale: z.enum(['vi', 'en']) })

/** Đọc 1 lần ở root loader để SSR render đúng theme/ngôn ngữ — tránh FOUC và hydration mismatch. */
export const getPreferences = createServerFn().handler(async (): Promise<Preferences> => {
  return {
    locale: parseLocale(getCookie(LOCALE_COOKIE)),
    theme: parseTheme(getCookie(THEME_COOKIE)),
  }
})

export const setThemePreference = createServerFn({ method: 'POST' })
  .validator(themeSchema)
  .handler(async ({ data }): Promise<Theme> => {
    setCookie(THEME_COOKIE, data.theme, cookieOptions)
    return data.theme
  })

export const setLocalePreference = createServerFn({ method: 'POST' })
  .validator(localeSchema)
  .handler(async ({ data }): Promise<Locale> => {
    setCookie(LOCALE_COOKIE, data.locale, cookieOptions)
    return data.locale
  })
