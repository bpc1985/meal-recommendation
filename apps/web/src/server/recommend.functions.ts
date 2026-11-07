import { getDb } from '@mam/db'
import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'
import { getAdvisor } from './advisor'
import { loadSessionPreferences } from './dish-preferences.service'
import { saveRecommendationBatch } from './history.service'
import { recommendInputSchema } from '../lib/recommend-input'
import { buildRecommendation, type RecommendationResult } from './recommend.service'
import { SESSION_COOKIE } from './session'

export const recommendMeals = createServerFn({ method: 'POST' })
  .validator(recommendInputSchema)
  .handler(async ({ data }): Promise<RecommendationResult> => {
    const db = getDb()
    const { user, preferences } = loadSessionPreferences(db, getCookie(SESSION_COOKIE))
    const result = await buildRecommendation(db, {
      ...data,
      preferences,
      advisor: getAdvisor(),
    })

    // Khách không ghi DB (spec §5); user đăng nhập có lịch sử server-side.
    if (user) {
      saveRecommendationBatch(db, user.id, { roleSlug: data.roleSlug, budget: data.budget }, result)
    }

    return result
  })
