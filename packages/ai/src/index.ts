export { applyGuards, type GuardResult } from './guards'
export { parseChatIntent, type ChatIntent } from './chat-intent'
export { createMockAdvisor } from './mock'
export { createGeminiAdvisor, readSseText, type GeminiOptions } from './gemini'
export { parseDietTags, rankCandidates, scoreCandidate } from './rank'
export type {
  AdvisorLocale,
  AdvisorPick,
  ChatContext,
  ChatMessage,
  ChatRequest,
  ChatRole,
  ChatStream,
  ChatStreamEvent,
  DishPreferenceSets,
  MealAdvisor,
  PickRequest,
  PickResult,
  RankedCandidate,
} from './types'
export { advisorLocales, chatRoles, NO_PREFERENCES } from './types'
