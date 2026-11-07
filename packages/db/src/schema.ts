import { sql } from 'drizzle-orm'
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { MealType, Region, SuggestionSource } from '@mam/domain'

const id = () =>
  text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())

const createdAt = () =>
  integer('created_at', { mode: 'number' })
    .notNull()
    .$defaultFn(() => Date.now())

export const users = sqliteTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  locale: text('locale').notNull().default('vi'),
  roleSlug: text('role_slug'),
  dailyBudgetVnd: integer('daily_budget_vnd', { mode: 'number' }),
  dietTags: text('diet_tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  createdAt: createdAt(),
})

export const sessions = sqliteTable(
  'sessions',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'number' }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [index('sessions_user_id_idx').on(table.userId)],
)

export const roles = sqliteTable('roles', {
  slug: text('slug').primaryKey(),
  nameVi: text('name_vi').notNull(),
  nameEn: text('name_en').notNull(),
  descVi: text('desc_vi').notNull().default(''),
  descEn: text('desc_en').notNull().default(''),
  defaultDailyBudgetVnd: integer('default_daily_budget_vnd', { mode: 'number' }).notNull(),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  icon: text('icon').notNull().default('utensils'),
  sortOrder: integer('sort_order', { mode: 'number' }).notNull().default(0),
})

export const dishes = sqliteTable(
  'dishes',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    nameVi: text('name_vi').notNull(),
    nameEn: text('name_en').notNull(),
    priceVnd: integer('price_vnd', { mode: 'number' }).notNull(),
    priceMinVnd: integer('price_min_vnd', { mode: 'number' }).notNull(),
    priceMaxVnd: integer('price_max_vnd', { mode: 'number' }).notNull(),
    mealTypes: text('meal_types', { mode: 'json' }).$type<MealType[]>().notNull(),
    tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
    region: text('region').$type<Region>().notNull().default('any'),
    prepMinutes: integer('prep_minutes', { mode: 'number' }).notNull().default(15),
    fillLevel: integer('fill_level', { mode: 'number' }).notNull().default(2),
    descVi: text('desc_vi').notNull().default(''),
    descEn: text('desc_en').notNull().default(''),
    isSeed: integer('is_seed', { mode: 'boolean' }).notNull().default(true),
    createdAt: createdAt(),
  },
  (table) => [index('dishes_price_idx').on(table.priceVnd)],
)

export const recommendations = sqliteTable(
  'recommendations',
  {
    id: id(),
    /** Một lượt gợi ý 3 bữa = 3 row cùng `batchId`; history nhóm theo cột này. */
    batchId: text('batch_id'),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    roleSlug: text('role_slug').notNull(),
    budgetUnit: text('budget_unit').notNull(),
    budgetAmount: integer('budget_amount', { mode: 'number' }).notNull(),
    dailyBudgetVnd: integer('daily_budget_vnd', { mode: 'number' }).notNull(),
    mealType: text('meal_type').$type<MealType>().notNull(),
    dishIds: text('dish_ids', { mode: 'json' }).$type<string[]>().notNull(),
    totalVnd: integer('total_vnd', { mode: 'number' }).notNull(),
    rationaleVi: text('rationale_vi').notNull().default(''),
    rationaleEn: text('rationale_en').notNull().default(''),
    source: text('source').$type<SuggestionSource>().notNull(),
    model: text('model'),
    createdAt: createdAt(),
  },
  (table) => [
    index('recommendations_user_created_idx').on(table.userId, table.createdAt),
    index('recommendations_batch_idx').on(table.batchId),
  ],
)

export const plans = sqliteTable(
  'plans',
  {
    id: id(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    startDate: text('start_date').notNull(),
    days: integer('days', { mode: 'number' }).notNull(),
    budgetUnit: text('budget_unit').notNull(),
    budgetAmount: integer('budget_amount', { mode: 'number' }).notNull(),
    dailyBudgetVnd: integer('daily_budget_vnd', { mode: 'number' }).notNull(),
    roleSlug: text('role_slug').notNull(),
    /** Chế độ ăn lúc tạo, để đổi món lọc lại đúng. Thực đơn tạo trước T30 có `[]`. */
    dietTags: text('diet_tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (table) => [index('plans_user_created_idx').on(table.userId, table.createdAt)],
)

export const planItems = sqliteTable(
  'plan_items',
  {
    id: id(),
    planId: text('plan_id')
      .notNull()
      .references(() => plans.id, { onDelete: 'cascade' }),
    dayIndex: integer('day_index', { mode: 'number' }).notNull(),
    mealType: text('meal_type').$type<MealType>().notNull(),
    dishId: text('dish_id')
      .notNull()
      .references(() => dishes.id, { onDelete: 'restrict' }),
    priceVnd: integer('price_vnd', { mode: 'number' }).notNull(),
  },
  (table) => [index('plan_items_plan_day_idx').on(table.planId, table.dayIndex)],
)

export const chatThreads = sqliteTable(
  'chat_threads',
  {
    id: id(),
    userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull().default(''),
    locale: text('locale').notNull().default('vi'),
    createdAt: createdAt(),
  },
  (table) => [index('chat_threads_user_created_idx').on(table.userId, table.createdAt)],
)

export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: id(),
    threadId: text('thread_id')
      .notNull()
      .references(() => chatThreads.id, { onDelete: 'cascade' }),
    role: text('role').$type<'user' | 'assistant'>().notNull(),
    content: text('content').notNull(),
    dishIds: text('dish_ids', { mode: 'json' }).$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (table) => [index('chat_messages_thread_created_idx').on(table.threadId, table.createdAt)],
)

export const dishPreferenceKinds = ['like', 'dislike'] as const
export type DishPreferenceKind = (typeof dishPreferenceKinds)[number]

/** Một user một trạng thái mỗi món (khoá chính kép): không thể vừa thích vừa chán. */
export const dishPreferences = sqliteTable(
  'dish_preferences',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    dishId: text('dish_id')
      .notNull()
      .references(() => dishes.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: dishPreferenceKinds }).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.dishId] }),
    check('dish_preferences_kind_check', sql`${table.kind} in ('like', 'dislike')`),
  ],
)

export const schema = {
  users,
  sessions,
  roles,
  dishes,
  recommendations,
  plans,
  planItems,
  chatThreads,
  chatMessages,
  dishPreferences,
}
