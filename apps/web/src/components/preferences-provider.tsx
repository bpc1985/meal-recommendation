import {
  createTranslator,
  formatDate,
  formatDateTime,
  formatNumber,
  formatVnd,
  type Locale,
  type Translator,
} from '@mam/i18n'
import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react'
import { setLocalePreference, setThemePreference } from '@/server/preferences.functions'
import type { Preferences, Theme } from '@/lib/preferences'

interface PreferencesContextValue {
  locale: Locale
  theme: Theme
  t: Translator
  formatMoney: (amount: number) => string
  formatCount: (value: number) => string
  formatDay: (date: Date | string | number) => string
  formatDateTime: (date: Date | string | number) => string
  setLocale: (locale: Locale) => void
  setTheme: (theme: Theme) => void
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null)

export function PreferencesProvider({
  initial,
  children,
}: {
  initial: Preferences
  children: ReactNode
}) {
  const [locale, setLocaleState] = useState<Locale>(initial.locale)
  const [theme, setThemeState] = useState<Theme>(initial.theme)

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    document.documentElement.classList.toggle('dark', next === 'dark')
    document.documentElement.style.colorScheme = next
    void setThemePreference({ data: { theme: next } })
  }, [])

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    document.documentElement.lang = next
    void setLocalePreference({ data: { locale: next } })
  }, [])

  const value = useMemo<PreferencesContextValue>(
    () => ({
      locale,
      theme,
      t: createTranslator(locale),
      formatMoney: (amount: number) => formatVnd(amount, locale),
      formatCount: (value: number) => formatNumber(value, locale),
      formatDay: (date: Date | string | number) => formatDate(date, locale),
      formatDateTime: (date: Date | string | number) => formatDateTime(date, locale),
      setLocale,
      setTheme,
    }),
    [locale, theme, setLocale, setTheme],
  )

  return <PreferencesContext value={value}>{children}</PreferencesContext>
}

export function usePreferences(): PreferencesContextValue {
  const context = use(PreferencesContext)

  if (!context) {
    throw new Error('usePreferences must be used inside PreferencesProvider')
  }

  return context
}
