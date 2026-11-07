import { getDb, type DishPreferences } from '@mam/db'
import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { getSessionUser } from './auth.service'
import {
  dishPreferenceInputSchema,
  listPreferencesForUser,
  setPreferenceForUser,
  type SetPreferenceResult,
} from './dish-preferences.service'
import { SESSION_COOKIE } from './session'

function currentUserId(): string | null {
  return getSessionUser(getDb(), getCookie(SESSION_COOKIE))?.id ?? null
}

export const listMyPreferences = createServerFn().handler(
  async (): Promise<DishPreferences | null> => listPreferencesForUser(getDb(), currentUserId()),
)

export const setPreference = createServerFn({ method: 'POST' })
  .validator(dishPreferenceInputSchema)
  .handler(async ({ data }): Promise<SetPreferenceResult> =>
    setPreferenceForUser(getDb(), currentUserId(), data),
  )
