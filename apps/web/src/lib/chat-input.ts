import { z } from 'zod'

/** Chỉ cần chặn chuỗi rác quá dài; quyền sở hữu do lớp DB kiểm tra. */
export const chatThreadInputSchema = z.object({
  threadId: z.string().trim().min(1).max(80),
})

export type ChatThreadInput = z.infer<typeof chatThreadInputSchema>
