import { getDb, listRoles, updateUserProfile } from '@mam/db'
import { DIET_TAGS } from '@mam/domain'
import { PREFERENCE_COOKIE_MAX_AGE } from '../lib/preferences'
import { LOCALE_COOKIE, type Locale } from '@mam/i18n'
import { createServerFn } from '@tanstack/react-start'
import { getCookie, setCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { getSessionUser, toPublicUser, type PublicUser } from './auth.service'
import { SESSION_COOKIE } from './session'

export const profileInputSchema = z.object({
  displayName: z.string().trim().max(80),
  roleSlug: z.string().trim().min(1).max(60),
  dailyBudgetVnd: z.number().int().min(1_000).max(100_000_000),
  dietTags: z.array(z.enum(DIET_TAGS)).max(DIET_TAGS.length).default([]),
  locale: z.enum(['vi', 'en']),
})

export type ProfileInput = z.infer<typeof profileInputSchema>

export type ProfileResponse =
  { ok: true; user: PublicUser } | { ok: false; error: 'unauthorized' | 'invalid_role' }

export const updateProfile = createServerFn({ method: 'POST' })
  .validator(profileInputSchema)
  .handler(async ({ data }): Promise<ProfileResponse> => {
    const db = getDb()
    const user = getSessionUser(db, getCookie(SESSION_COOKIE))

    if (!user) return { ok: false, error: 'unauthorized' }

    if (!listRoles(db).some((role) => role.slug === data.roleSlug)) {
      return { ok: false, error: 'invalid_role' }
    }

    const row = updateUserProfile(db, user.id, {
      displayName: data.displayName.length > 0 ? data.displayName : null,
      roleSlug: data.roleSlug,
      dailyBudgetVnd: data.dailyBudgetVnd,
      dietTags: data.dietTags,
      locale: data.locale,
    })

    if (!row) return { ok: false, error: 'unauthorized' }

    setCookie(LOCALE_COOKIE, data.locale satisfies Locale, {
      path: '/',
      sameSite: 'lax',
      maxAge: PREFERENCE_COOKIE_MAX_AGE,
    })

    return { ok: true, user: toPublicUser(row) }
  })
