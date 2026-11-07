import { en } from './en'
import { vi, type TranslationKey } from './vi'

export const dictionaries = { vi, en } as const

export type Locale = 'vi' | 'en'

export const locales: readonly Locale[] = ['vi', 'en']
export const DEFAULT_LOCALE: Locale = 'vi'
export const LOCALE_COOKIE = 'mam_locale'

export function parseLocale(value: string | undefined | null): Locale {
  return value === 'en' ? 'en' : DEFAULT_LOCALE
}

type Params = Record<string, string | number>

export type Translator = (key: TranslationKey, params?: Params) => string

function interpolate(template: string, params?: Params): string {
  if (!params) return template

  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}

export function createTranslator(locale: Locale): Translator {
  return (key, params) => interpolate(dictionaries[locale][key], params)
}
