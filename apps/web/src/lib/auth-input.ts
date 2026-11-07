import type { TranslationKey } from '@mam/i18n'
import { z } from 'zod'

export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 200

const emailField = z.string().trim().pipe(z.email().max(254))

export const loginInputSchema = z.object({
  email: emailField,
  password: z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH),
})

export const registerInputSchema = loginInputSchema.extend({
  displayName: z.string().trim().max(80).optional(),
})

export type LoginInput = z.infer<typeof loginInputSchema>
export type RegisterInput = z.infer<typeof registerInputSchema>

export type AuthField = 'email' | 'password' | 'displayName'
export type AuthFieldErrors = Partial<Record<AuthField, TranslationKey>>

const FIELD_ERROR_KEY: Record<AuthField, TranslationKey> = {
  email: 'auth.error.email',
  password: 'auth.error.password',
  displayName: 'auth.error.generic',
}

/** Map lỗi Zod sang key i18n để form hiện lỗi ngay dưới từng field. */
export function toFieldErrors(error: z.ZodError): AuthFieldErrors {
  const errors: AuthFieldErrors = {}

  for (const issue of error.issues) {
    const field = issue.path[0]

    if (field === 'email' || field === 'password' || field === 'displayName') {
      errors[field] ??= FIELD_ERROR_KEY[field]
    }
  }

  return errors
}
