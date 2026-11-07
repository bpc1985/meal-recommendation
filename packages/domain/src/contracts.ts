import { z } from 'zod'

export const mealTypes = ['breakfast', 'lunch', 'dinner'] as const
export type MealType = (typeof mealTypes)[number]

export const regions = ['bac', 'trung', 'nam', 'any'] as const
export type Region = (typeof regions)[number]

/** Nguồn của một gợi ý — dùng để UI nói thật với user về dữ liệu đang xem. */
export const suggestionSources = ['curated', 'ai', 'mock', 'fallback'] as const
export type SuggestionSource = (typeof suggestionSources)[number]

export const roleSchema = z.object({
  slug: z.string().min(1),
  nameVi: z.string().min(1),
  nameEn: z.string().min(1),
  descVi: z.string().default(''),
  descEn: z.string().default(''),
  defaultDailyBudgetVnd: z.number().int().positive(),
  tags: z.array(z.string()).default([]),
  icon: z.string().default('utensils'),
  sortOrder: z.number().int().default(0),
})

export type Role = z.infer<typeof roleSchema>

export const dishSchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  nameVi: z.string().min(1),
  nameEn: z.string().min(1),
  priceVnd: z.number().int().nonnegative(),
  priceMinVnd: z.number().int().nonnegative(),
  priceMaxVnd: z.number().int().nonnegative(),
  mealTypes: z.array(z.enum(mealTypes)).min(1),
  tags: z.array(z.string()),
  region: z.enum(regions),
  prepMinutes: z.number().int().nonnegative(),
  fillLevel: z.number().int().min(1).max(3),
  descVi: z.string().default(''),
  descEn: z.string().default(''),
})

export type Dish = z.infer<typeof dishSchema>

/** Hợp đồng mà module `ai` được phép thấy. Không chứa gì khác ngoài dữ liệu cần để chọn món. */
export const dishCandidateSchema = dishSchema.pick({
  id: true,
  nameVi: true,
  nameEn: true,
  priceVnd: true,
  mealTypes: true,
  tags: true,
  fillLevel: true,
  prepMinutes: true,
})

export type DishCandidate = z.infer<typeof dishCandidateSchema>

export const mealSuggestionSchema = z.object({
  mealType: z.enum(mealTypes),
  dishId: z.string(),
  nameVi: z.string(),
  nameEn: z.string(),
  priceVnd: z.number().int().nonnegative(),
  /** Giữ cả hai ngôn ngữ để đổi locale không phải gọi lại server. */
  reasonVi: z.string().default(''),
  reasonEn: z.string().default(''),
})

export type MealSuggestion = z.infer<typeof mealSuggestionSchema>
