import { countDishes, getDb, listAllDishes, listRoles as listRolesQuery } from '@mam/db'
import { createServerFn } from '@tanstack/react-start'

export const listRoles = createServerFn().handler(async () => listRolesQuery(getDb()))

export const getCatalogStats = createServerFn().handler(async () => ({
  dishes: countDishes(getDb()),
}))

export const listDishes = createServerFn().handler(async () => listAllDishes(getDb()))
