import { createRouter } from '@tanstack/react-router'
import { parseSearch } from './lib/search-params'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    parseSearch,
  })
}
