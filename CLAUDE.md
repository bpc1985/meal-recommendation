# CLAUDE.md — Măm (meal recommendation)

> Tệp rules của Claude Code. Giữ nội dung đồng bộ với `AGENTS.md` — sửa file này thì sửa file kia.

## Project instructions

### Workflow

- Always check whether a skill applies before acting. Skills are the first thing to consider, not an afterthought.
- When a skill applies, load it with the `skill` tool and follow it. Do not work from memory or guesswork when a skill already covers the task.
- Never skip required workflows — spec, plan, test, review, and any others the loaded skill defines. Partial compliance is not compliance.
- Do not jump directly to implementation. Establish what is being built and why, then how, then prove it works, before writing production code.

### Order of operations

1. Check for an applicable skill and load it.
2. Follow the workflow it prescribes, in order.
3. Only start implementing once the preceding steps are done and their outputs exist.
4. If a required step cannot be completed, stop and say so instead of working around it.

Với mọi thay đổi logic: viết test chạy **FAIL** trước (TDD), rồi mới sửa code cho test **PASS**.
Mọi code hành vi đều phải có test.

## Tech stack

- pnpm workspaces + Turborepo, Node ≥ 22 (`packageManager: pnpm@12.8.1`), TypeScript 6.0 strict
  (`noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`).
- App: `apps/web` — TanStack Start (React 19, SSR) + Vite 8, Tailwind CSS 4, component shadcn/ui
  trong `packages/ui`.
- DB: SQLite qua Drizzle better-sqlite3, file `data/mam.db` (migrate + seed idempotent).
- AI: Google Gemini qua endpoint tương thích OpenAI (model mặc định `gemini-3.5-flash`, Google đã
  deprecate và tự chuyển sang `gemini-3.6-flash`; đổi bằng `GEMINI_MODEL`) hoặc mock trong
  `packages/ai`; mọi lỗi AI (429/5xx/timeout) → mock fallback + `degraded: true` (ADR-014).
- i18n: dictionary có type trong `packages/i18n` (vi/en), 324 key.

## Commands

| Lệnh                  | Việc                                                                   |
| --------------------- | ---------------------------------------------------------------------- |
| `pnpm dev`            | Dev server cổng 3000                                                   |
|                       | `AI_PROVIDER=mock pnpm --filter @mam/web dev --port 3001 --strictPort` |
|                       | để chạy instance mock song song                                        |
| `pnpm test`           | Unit/integration toàn workspace (Vitest) — hiện **459 test**           |
| `pnpm test:e2e`       | Playwright 26 test, tự dựng server mock cổng 4310                      |
| `pnpm typecheck`      | `tsc --noEmit` từng package                                            |
| `pnpm lint`           | ESLint (`pnpm lint --fix` nếu hợp lệ)                                  |
| `pnpm format`         | Prettier (`pnpm format:check` để kiểm — CỔNG HARD)                     |
| `pnpm i18n:check`     | key thiếu/thừa + chuỗi tiếng Việt hard-code (CỔNG HARD)                |
| `pnpm verify:planner` | Kiểm chứng vét cạn planner (skill `.claude/skills/verify-planner`)     |
| `pnpm ai:check`       | Gọi Gemini thật 1 lần (pick + chat), in status/lỗi upstream            |
| `pnpm db:bootstrap`   | migrate + seed (`pnpm db:reset` để tạo lại từ đầu)                     |
| `pnpm build`          | Build production vào `apps/web/dist`                                   |
| `pnpm start`          | Chạy bản build (`PORT`, `HOST`, `DATABASE_PATH`)                       |

Checkpoint trình duyệt thủ công: `BASE_URL=http://localhost:3001 node scripts/checkpoint-{chat,g,a11y,perf,f}.mjs`.
Chạy trên instance 3001 (mock) để không tốn quota Gemini.

## Cấu trúc

```
apps/web/            TanStack Start: src/routes (trang + /api/chat NDJSON stream),
                     src/server (service thuần: auth, recommend, plan, history, chat),
                     src/lib (tiện ích client + type dùng chung)
packages/ai/         MealAdvisor: gemini.ts / mock.ts, guards.ts, rank.ts
packages/db/         Drizzle schema, migrations, seed, queries.ts
packages/domain/     kiểu dùng chung, ngân sách: splitMealBudget 25/40/35 sáng/trưa/tối
packages/i18n/       dictionary vi/en + format tiền/ngày
packages/ui/         component shadcn/ui (index.ts re-export)
scripts/             checkpoint trình duyệt, i18n check, serve bản build
docs/spec.md         spec + 12 tiêu chí nghiệm thu (S1..S12)
docs/adr/            ADR 0001–0017
tasks/               plan.md + todo.md (trạng thái, acceptance, kết quả từng task)
```

Test đặt cạnh file nguồn, cùng tên: `foo.ts` → `foo.test.ts`. DB test dùng
`createTestDb()` / `createDb(':memory:')` + migrate + seed. Tên test, comment trong code viết
**bằng tiếng Việt** và mô tả hành vi (xem `packages/ai/src/ai.test.ts` làm mẫu). Imports luôn
`import type { … }` cho type (`verbatimModuleSyntax`). Classname ghép qua `cn()`
(`apps/web/src/lib/utils.ts`), component shadcn lấy từ `@mam/ui`.

## Bất biến của domain (phá vỡ là bug)

1. **Giá luôn từ DB** — server tính lại tổng từ bảng `dishes`; AI/advisor/client không được chỉ giá
   (ADR-001). Giá do advisor "nói" phải bị bỏ qua.
2. **Không vượt ngân sách** — guard loại pick làm tổng vượt trần bữa; tổng ngày ≤ ngân sách. Nhóm
   món "vừa ngân sách" ưu tiên món **sát trần** (điểm utilization, T21) — ngân sách là mục tiêu
   chi, không phải chỗ bỏ phí.
3. **Ba bữa không trùng món** — món đã dùng ở bữa trước bị loại khỏi ứng viên bữa sau. Không còn món
   mới vừa trần một bữa thì bữa đó được báo thiếu món (`missingMeals`, chat báo bữa trống), không bao
   giờ dùng lại món cũ.
4. **Khách (guest)**: không có history/chat trên server; dữ liệu trong `localStorage` thôi, và
   không bao giờ lộ dữ liệu khách vào tài khoản đăng nhập.
5. **1 lượt gợi ý = 1–3 hàng `recommendations`**, chung `batch_id`; xoá/mở lại theo `batch_id`,
   scope theo `user_id` trong mọi query.
6. **UI đa ngôn ngữ**: mọi chuỗi UI đi qua dictionary (`packages/i18n`, cả vi/en); không hard-code
   tiếng Việt trong `.tsx` (`pnpm i18n:check` là cổng). Dark mode qua class `dark` + cookie
   `mam_theme`/`mam_locale`.

## Bảo mật & dữ liệu

- Mật khẩu hash `scrypt`; session = SHA-256 của token trong cookie `HttpOnly` `SameSite=Lax`.
- Mọi input server validate bằng Zod; query luôn scope theo `user_id`.
- `.env` và `data/*.db` **không nằm trong git** — không commit, không in ra key trong log.
- Rate limit in-memory theo IP cho chat/recommend.

## Khi "xong" nghĩa là gì

Cổng bắt buộc trước khi báo xong (theo thứ tự):

```bash
pnpm format:check && pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm i18n:check
```

Thêm `pnpm test:e2e` nếu thay đổi luồng UI/flow; chạy lại checkpoint tương ứng
(`scripts/checkpoint-*.mjs`) nếu chạm history/chat/a11y/perf. Số test/benchmark ghi trong
`tasks/todo.md` phải được cập nhật khi thay đổi.

Cập nhật tài liệu theo thay đổi: `docs/spec.md` (tiêu chí S), `tasks/plan.md` & `tasks/todo.md`
(trạng thái task), ADR mới nếu quyết định kiến trúc mới.

## Ranh giới — hỏi trước khi làm

- Thêm dependency bất kỳ (web/ai/db) — nêu lý do + ảnh hưởng bundle.
- Đổi AI model, đổi provider, đổi luồng chọn món (guards/rank), đổi schema DB.
- Thay đổi cách tính giá/tiền — dính bất biến #1.
- Đừng xoá/bỏ qua test, đừng dùng `@ts-ignore`/`eslint-disable` tùy tiện, đừng hạ ngưỡng
  checkpoint — không làm giảm chất lượng để test xanh.
- Repo hiện chưa có git (quyết "để sau"). Không commit gì — liệt kê file đã sửa trong kết quả cuối.

## Trạng thái hiện tại

- Phase 1–7 hoàn tất (T1–T21), checkpoint G đủ cổng xanh; **chỉ còn human review cuối**.
- P8 (`docs/plans/p8-tinh-nang-moi.md`, T25–T30) hoàn tất, operator đã duyệt cả sáu đơn vị (T30
  ngày 2026-11-04). Ảnh và video review: `docs/screenshots/p8/`.
- AI: `AI_PROVIDER=gemini` + `GEMINI_API_KEY` trong `.env` (user tự đặt key). `AI_PROVIDER=openrouter`
  đã bị bỏ — server dừng khi khởi động nếu còn giá trị đó. Hết hạn mức/lỗi upstream → app tự dùng
  mock + banner "AI tạm không khả dụng" — không phải bug.
- Review đang chạy trên `http://localhost:3000` (AI thật) và `http://localhost:3001` (mock).
  Ảnh review cuối: `docs/screenshots/final/`.
