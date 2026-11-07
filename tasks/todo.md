# Task List: Măm

Plan: `tasks/plan.md` · Spec: `docs/spec.md`
Trạng thái: chờ duyệt — chưa bắt đầu task nào.

## Phase 1: Foundation

### T1 — ✅ Scaffold monorepo

**Status:** Done 2026-10-29.
**Mô tả:** Turborepo + pnpm workspaces, `tsconfig.base.json` strict, ESLint flat + Prettier, `turbo.json` với pipeline `dev/build/lint/typecheck/test`. Tạo skeleton cho 5 package với `package.json` + `src/index.ts` rỗng.

**Acceptance:**

- [ ] `pnpm install` sạch, `pnpm typecheck` pass trên skeleton
- [ ] `pnpm lint` pass; `pnpm build` không lỗi
- [ ] `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` bật

**Verify:** `pnpm install && pnpm typecheck && pnpm lint`
**Files:** `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierrc`, `packages/*/package.json`
**Deps:** — · **Size:** M

### T2 — ✅ `packages/db`: schema, client, migration

**Status:** Done 2026-10-29.
**Mô tả:** Toàn bộ schema ở spec §5 bằng Drizzle SQLite; factory tạo client từ `DATABASE_PATH` (WAL, `foreign_keys=ON`); migration đầu tiên; export type.

**Acceptance:**

- [ ] `pnpm db:migrate` tạo đủ 8 bảng + index
- [ ] `pnpm db:reset` xoá và tạo lại DB sạch
- [ ] Cấu hình `ssr.external: ['better-sqlite3']` và `pnpm dev` boot được
- [ ] Test integration dùng `:memory:` insert/select user thành công

**Verify:** `pnpm db:reset && pnpm test -- db`
**Files:** `packages/db/src/{schema.ts,client.ts,index.ts}`, `packages/db/drizzle.config.ts`, `packages/db/migrations/`, `apps/web/vite.config.ts`
**Deps:** T1 · **Size:** M

### T3 — ✅ `packages/domain`: contracts + budget math

**Status:** Done 2026-10-29.
**Mô tả:** Zod schema cho Dish/Role/Budget/MealSuggestion/Plan; `toDailyBudget`, `splitMealBudget`, `remaining`, `sumVnd`. Round xuống 1.000đ. Pure.

**Acceptance:**

- [ ] `meal` → ×3; `month` → /daysInMonth; round xuống 1.000đ
- [ ] Split 25/40/35 luôn cộng lại đúng daily budget (không lệch do làm tròn)
- [ ] Edge case: budget 1.000đ, 31 ngày, amount lẻ — có test
- [ ] 100% branch coverage file `budget.ts`

**Verify:** `pnpm test -- coverage packages/domain`
**Files:** `packages/domain/src/{budget.ts,budget.test.ts,contracts.ts,index.ts}`
**Deps:** T1 · **Size:** S

### T4 — ✅ Seed data

**Status:** Done 2026-10-29.
**Mô tả:** ~100 món Việt (sáng/trưa/tối, chay, vùng miền, độ no, thời gian nấu) + 10 roles (sinh viên, nhân viên văn phòng, freelancer dev, giáo viên, tài xế, công nhân, mẹ bỉm, gymer, shipper, hưu trí). Script idempotent upsert theo `slug`.

**Acceptance:**

- [ ] Chạy `pnpm db:seed` 2 lần → số món không đổi
- [ ] Mỗi role có `default_daily_budget_vnd` hợp lý (sinh viên 60–80k, văn phòng 120–180k…)
- [ ] Mỗi meal type có ≥25 món; ≥15 món chay; có `name_vi` + `name_en` cho tất cả
- [ ] Giá trong khung thực tế VN 2026, ghi chú "ước lượng" trong docs

**Verify:** `pnpm db:reset && pnpm db:seed && pnpm db:seed` + query đếm
**Files:** `packages/db/src/seed/{dishes.ts,roles.ts,index.ts}`, `data/seed-notes.md`
**Deps:** T2 · **Size:** M

#### Checkpoint A — ✅ PASS

- [x] `pnpm db:reset` → DB có 100 món + 10 roles
- [x] `pnpm test` (27 tests) và `pnpm typecheck`, `pnpm lint`, `pnpm build` xanh
- [x] SSR đọc DB qua server function thành công (`better-sqlite3` không bị bundle)
- [ ] Review với human

## Phase 2: Shell

### T5 — ✅ Design system + khung app

**Status:** Done 2026-10-29.
**Mô tả:** Tailwind v4 CSS-first, tokens OKLCH ở spec §8, shadcn init (button, card, input, select, tabs, dialog, switch, badge, skeleton, sonner), root layout (header/footer/nav), theme toggle `.dark` + script chống FOUC.

**Acceptance:**

- [ ] Toggle dark/light đổi ngay, không nhấp nháy khi reload
- [ ] Token light/dark đạt WCAG AA (đo bằng contrast checker)
- [ ] Header responsive: nav collapse ở <768px, target ≥44px
- [ ] `prefers-reduced-motion` tắt animation

**Verify:** `pnpm dev` → kiểm 390/768/1280px + Lighthouse a11y
**Files:** `apps/web/src/styles/globals.css`, `apps/web/src/routes/__root.tsx`, `packages/ui/src/components/*`, `components/theme-toggle.tsx`, `components/site-header.tsx`
**Deps:** T1 · **Size:** M

### T6 — ✅ i18n + formatters

**Status:** Done 2026-10-29.
**Mô tả:** `packages/i18n`: dictionary vi/en có type, `t(key, params)`, `createT(locale)`, locale cookie `mam_locale`, formatter `formatVnd`, `formatDate`, `formatRelative`. Script `i18n:check` phát hiện key lệch + chuỗi vi hard-code trong JSX.

**Acceptance:**

- [ ] Key thiếu ở một locale → lỗi compile (type-level) và `pnpm i18n:check` fail
- [ ] `formatVnd(45000,'vi') === '45.000 ₫'`, `'en' === '₫45,000'`
- [ ] Đổi locale ở header → reload giữ nguyên (cookie)
- [ ] Không hydration mismatch (SSR đọc cookie server-side)

**Verify:** `pnpm test -- i18n && pnpm i18n:check`
**Files:** `packages/i18n/src/{vi.ts,en.ts,index.ts,format.ts}`, `packages/i18n/src/*.test.ts`, `apps/web/src/components/locale-switcher.tsx`, `scripts/i18n-check.ts`
**Deps:** T1, T5 · **Size:** M

#### Checkpoint B — ✅ PASS

- [x] Trang chủ render đúng vi/en + dark/light, xác minh bằng Playwright + Chrome thật (0 console error)
- [x] Không scroll ngang ở 390px; header collapse thành menu hamburger
- [x] Toggle theme + đổi ngôn ngữ persist qua reload (cookie + SSR)
- [ ] Review với human

## Phase 3: Slice 1 — Form → gợi ý

### T7 — ✅ `packages/ai`: adapter, mock, ranker, guards

**Status:** Done 2026-10-29. 15 tests.
**Mô tả:** Interface `MealAdvisor`; `MockAdvisor` render câu trả lời từ deterministic ranker; ranker xếp hạng theo độ khớp tag, `fill_level/price`, đa dạng protein; `applyGuards()` loại dishId lạ và pick làm vượt budget.

**Acceptance:**

- [x] Ranker deterministic: cùng input → cùng output
- [x] Guard loại dishId không có trong candidates
- [x] Guard loại pick làm tổng vượt budget (cộng dồn)
- [x] Rỗng sau guard → trả fallback, `source='fallback'`, không throw
- [x] Không test nào gọi network

**Verify:** `pnpm test -- packages/ai`
**Files:** `packages/ai/src/{types.ts,mock.ts,rank.ts,guards.ts,index.ts}`, `packages/ai/src/*.test.ts`
**Deps:** T3 · **Size:** M

### T8 — ✅ Server fn `recommendMeals`

**Status:** Done 2026-10-29. 8 service tests + 7 schema tests. Logic nằm ở `recommend.service.ts` (test được với DB in-memory), server fn chỉ là wrapper validate + DI.
**Mô tả:** Lấy ứng viên từ DB theo role + budget + meal type + diet tags; gọi advisor; guard; tính tổng bằng DB price; lưu `recommendations` nếu có session; rate limit cơ bản.

**Acceptance:**

- [x] Tổng tiền tính từ DB, không từ AI output
- [x] Budget 60k/ngày → tổng 3 bữa ≤ 60k (hoặc trả `overBudget` + lý do, không âm thầm vượt)
- [x] Input sai (amount âm, unit lạ) → lỗi Zod 400 dễ đọc
- [ ] User đã đăng nhập → có row trong `recommendations` → **dời sang T12** (chưa có session/auth)

**Verify:** `pnpm test -- recommendMeals`
**Files:** `apps/web/src/server/recommend.functions.ts`, `recommend.test.ts`
**Deps:** T2, T3, T4, T7 · **Size:** M

### T9 — ✅ `/recommend` UI (đã tách form / kết quả)

**Status:** Done 2026-10-29. Làm 1 trang 3 section thay vì stepper; không dùng TanStack Form — state thường + Zod (đã chốt trong spec).
**Mô tả:** Một trang với 3 section (vai trò → ngân sách [3 đơn vị] → sở thích/chế độ ăn), submit → kết quả 3 card bữa ăn + budget bar (đã dùng / còn lại) + nút "tạo thực đơn tuần". State thường + Zod, dùng chung schema với server fn.

**Acceptance:**

- [x] Submit hợp lệ < 5s (mock) ra 3 bữa, giá đúng DB
- [x] Đổi đơn vị bữa/ngày/tháng → preview ngân sách/ngày cập nhật ngay
- [x] Trạng thái loading dùng skeleton; lỗi có `role="alert"`
- [x] Mobile 390px: form 1 cột, thẻ món xếp dọc, không scroll ngang
- [x] Toàn bộ copy vi/en, kể cả trạng thái lỗi

**Verify:** `pnpm dev` thủ công 3 kịch bản (sinh viên 60k, văn phòng 150k, freelancer 200k/tháng) + component test
**Files:** `apps/web/src/routes/recommend.tsx`, `components/recommend/*`, `packages/ui/src/components/meal-card.tsx`, `budget-bar.tsx`
**Deps:** T5, T6, T8 · **Size:** L → tách: **T9a** form + state, **T9b** kết quả + budget bar

#### Checkpoint C — ✅ PASS (gate quan trọng nhất)

- [x] Khách: `sinh viên / 60k/ngày` → 3 bữa (15k + 22k + 20k = 57k), không cần API key
- [x] Đổi sang EN sau khi có kết quả → tên món + lý do + toàn bộ copy đổi ngay, không gọi lại server
- [x] Dark mode + mobile 390px: 0 console error, 0 request 4xx, không scroll ngang
- [x] Ngân sách 1.000đ → 3 thẻ "chưa có món" + badge "Phương án dự phòng", không crash
- [ ] Review với human trước khi làm chat

## Phase 4: AI chat

### T10 — OpenRouter adapter + `/api/chat` + rate limit — ✅ DONE

**Mô tả:** `OpenRouterAdvisor` gọi OpenRouter bằng `fetch` + SSE thuần (không dùng AI SDK — ADR-008); route stream NDJSON; rate limiter in-memory theo IP; fail fast khi thiếu key.

**Acceptance:**

- [x] `curl -N` thấy chunk về dần, không buffer (mock: first chunk 65–147ms, 18 chunk, tổng ~380–470ms)
- [x] Key thật: `/api/chat` trả `degraded: false`, câu trả lời đúng locale, thẻ món lấy giá DB
- [x] Thiếu key mà `AI_PROVIDER=openrouter` → throw ngay khi import với message rõ ràng
- [x] Vượt limit → 429 + header `Retry-After` + `retryAfter` + message i18n
- [x] Lỗi upstream → fallback mock + cờ `degraded: true` trong event `meta`

**Verify:** `node scripts/checkpoint-d.mjs`, `pnpm test -- rate-limit`, `curl -N localhost:3000/api/chat`
**Files:** `packages/ai/src/openrouter.ts`, `packages/ai/src/chat-intent.ts`, `apps/web/src/routes/api/chat.ts`, `apps/web/src/server/rate-limit.ts`, `apps/web/src/server/chat.service.ts`
**Ghi chú:** 429/5xx retry 1 lần; timeout 20s. Registered 200 lượt/24h khai báo sẵn, nối ở T12.
Prompt chat khoá ngôn ngữ theo `locale` và cấm AI tự cộng giá; thẻ món khớp cả tên vi/en, không dấu.
`.env` ở gốc repo được `vite.config.ts` nạp cho SSR (ADR-009).
**Deps:** T7 · **Size:** M

### T11 — `/chat` UI — ✅ DONE

**Mô tả:** Chat streaming, message bubbles, dish card lấy giá từ `meta` (DB), prompt mẫu, history localStorage cho khách (20 lượt, nút xoá), CTA sang `/recommend`.

**Acceptance:**

- [x] Chữ hiện dần, input không bị block (nút Dừng khi đang stream)
- [x] Dish card hiển thị giá từ DB, không parse từ text AI
- [x] Reload trang khách vẫn thấy history (localStorage), xoá được
- [x] `role="log"`, `aria-live="polite"`, Enter gửi / Shift+Enter xuống dòng

**Verify:** `pnpm dev` + `node scripts/checkpoint-d.mjs` (4 viewport, 0 console error, 0 overflow)
**Files:** `apps/web/src/routes/chat.tsx`, `components/chat/*`, `apps/web/src/lib/local-history.ts`, `apps/web/src/lib/chat-stream.ts`
**Deps:** T6, T9b, T10 · **Size:** M

#### Checkpoint D — ✅ PASS (mock + OpenRouter thật)

- [x] Chat chạy mock: 3 viewport + EN, streaming, dish card, history, clear
- [x] Rate limit 20 lượt/24h hoạt động, 429 có `Retry-After`, message đổi theo locale
- [x] Adapter OpenRouter phủ bằng fetch giả: success, 429 retry, 5xx fallback, SSE chia nhỏ
- [x] Chạy với `OPENROUTER_API_KEY` thật: chat VI/EN `degraded: false` (5–11s), `/recommend` trả
      "AI chọn" với tổng 50.000 ₫ ≤ 60.000 ₫, không có badge dự phòng, 0 console error
- [x] Key/model hỏng hoặc 429 kéo dài → fallback mock + banner `degraded` (đã gặp thật 1 lần)

## Phase 5: Identity

### T12 — Auth backend

**Mô tả:** scrypt hash (salt ngẫu nhiên, timing-safe compare), bảng session, token 32B lưu SHA-256, cookie HttpOnly SameSite=Lax 30 ngày, rotate khi login; `register/login/logout` server fns với rate limit.

**Acceptance:**

- [x] Password < 8 ký tự bị từ chối; email trùng → lỗi rõ ràng, không lộ user tồn tại ở login
- [x] Cookie `HttpOnly`, `Secure` khi `NODE_ENV=production`
- [x] Logout xoá row + cookie; token cũ dùng lại bị từ chối
- [x] Test: SQL injection qua email không ảnh hưởng (Drizzle param hoá)

**Verify:** `pnpm test -- auth` → 60 test web (password, session, auth.service, rate-limit)
**Files:** `apps/web/src/server/{auth.functions.ts,password.ts,session.ts}`, `*.test.ts`
**Deps:** T2 · **Size:** M

### T13 — Login/Register UI + route guard + settings

**Mô tả:** Trang login/register (state thường + Zod, hiện lỗi field-level), guard `beforeLoad` redirect cho `/plans`, `/history`, `/settings`; trang settings sửa display name, role mặc định, budget mặc định, diet tags, locale.

**Acceptance:**

- [x] Truy cập `/history` khi chưa login → redirect `/login?redirect=/history`, quay lại đúng chỗ sau login
- [x] Settings lưu và có hiệu lực ngay (form recommend prefill)
- [x] Không lộ password trong log/response

**Verify:** `node scripts/checkpoint-e.mjs` (13 bước, cần restart dev server để reset rate limit) + thủ công
**Files:** `apps/web/src/routes/{login.tsx,register.tsx,settings.tsx}`, `components/auth/*`, `apps/web/src/server/profile.functions.ts`
**Deps:** T5, T6, T12 · **Size:** M

#### Checkpoint E

- [x] Register → login → reload → còn session → logout → mất
- [x] User A không thấy dữ liệu user B

Kết quả 2026-10-29: `PASS` cả 13 bước, `ERRORS: 0`, `FAILURES: 0`; cookie `httpOnly=true
sameSite=Lax secure=false days=30`; prefill recommend `budget=75000 vegetarian=true`; user B
thấy `display="" budget=60000`; ảnh ở `docs/screenshots/auth-*.png`.

## Phase 6: Plans

### T14 — Planner pure

**Mô tả:** `buildPlan({days, dailyBudgetVnd, roleSlug, dietTags, dishes, seed})` trả lịch 7/30 ngày × 3 bữa, tôn trọng ngân sách ngày, không lặp món trong 2 ngày liền, cân bằng protein/chay, deterministic theo seed.

**Acceptance:**

- [x] Tổng plan ≤ `days × dailyBudgetVnd`
- [x] Không món nào xuất hiện 2 lần trong cửa sổ 2 ngày
- [x] ≥1 món chay/tuần nếu `dietTags` không loại trừ
- [x] Budget quá thấp để đủ 3 bữa → trả `feasible: false` + gợi ý mức tối thiểu
- [x] Cùng seed → cùng plan (test snapshot)

**Kết quả:** `feasible:false` kèm `minimumDailyBudgetVnd` quét theo bước 1.000đ tới `floor × 4`
(0 = thiếu món, không phải thiếu tiền). Reserve chính xác từng bữa + chia đều phần dư + một lượt
"rẻ nhất" tất định để cùng mức tiền không còn phụ thuộc seed. 29 test domain pass.
**Verify:** `pnpm test -- planner` (100% branch)
**Files:** `packages/domain/src/{planner.ts,planner.test.ts,diet.ts,diet.test.ts}`
**Deps:** T3 · **Size:** M

### T15 — Plan CRUD + UI

**Mô tả:** `createPlan/listPlans/getPlan/deletePlan`; UI danh sách + chi tiết dạng bảng tuần, tạo từ `/plans` hoặc từ kết quả recommend ("lưu thành thực đơn 7 ngày").

**Acceptance:**

- [x] Tạo plan 30 ngày 2.5tr → tổng ≤ 2.5tr, lưu DB đúng `plan_items`
- [x] Xoá plan → cascade xoá items
- [x] Chỉ chủ sở hữu xem/xoá được (test 403)
- [x] Bảng plan responsive: mobile chuyển sang accordion theo ngày

**Kết quả:** `packages/db/src/plans.ts` (transaction header+items, tổng tiền/số món bằng SQL,
`deletePlanForUser` trả false thay vì 403 để không lộ plan người khác); `/plans` có form tạo
(7/30 ngày, ngân sách theo bữa/ngày/tháng, vai trò, chế độ ăn), danh sách + xoá 2 bước;
`/plans/$planId` có bảng desktop và `<details>` mobile; CTA ở `/recommend` lưu đúng input đã tạo
ra kết quả. Ứng viên planner lấy đủ món trong trần giá (top-40 theo độ no từng làm 60k/7 ngày
thất bại dù dữ liệu thừa món rẻ) — có test hồi quy ở `plan.service.test.ts`.
**Verify:** `pnpm test -- plan` + `node scripts/checkpoint-f.mjs`
**Files:** `apps/web/src/server/{plan.service.ts,plan.functions.ts}`, `packages/db/src/plans.ts`,
`lib/{plan-input.ts,plan-types.ts,plan-export.ts}`, `routes/plans/{index.tsx,$planId.tsx}`,
`components/plans/*`
**Deps:** T13, T14 · **Size:** M

### T16 — Export

**Mô tả:** Export markdown (copy clipboard + download `.md`), print stylesheet cho bảng tuần.

**Acceptance:**

- [x] Markdown có tiêu đề, tổng tiền, bảng ngày × bữa, danh sách đi chợ gộp
- [x] Copy thành công có toast; download đúng BOM UTF-8 (mở Excel không lỗi dấu)
- [x] Print: ẩn nav, không cắt bảng

**Kết quả:** `apps/web/src/lib/plan-export.ts` (không đặt ở `packages/domain` vì cần formatter
i18n) — tổng tiền cộng từ items, escape `|` trong tên món, tên file bỏ ký tự cấm; menu copy/tải
BOM/`window.print()`; `@page` + `print:hidden` trong `globals.css`. 7 test lib.
**Verify:** `node scripts/checkpoint-f.mjs` (kiểm tra BOM, 30 bảng ngày, print hook)
**Files:** `apps/web/src/lib/plan-export.ts`, `components/plans/export-menu.tsx`, `styles/globals.css`
**Deps:** T15 · **Size:** S

#### Checkpoint F

- [x] Plan 30 ngày 2.5tr đúng ngân sách, không lặp món
- [x] Export đọc được

Kết quả 2026-10-29: `node scripts/checkpoint-f.mjs` pass 21 bước, `ERRORS: 0`, `FAILURES: 0`.
Plan 30 ngày từ 2.500.000đ/tháng (quy về 83.000đ/ngày, trần 2.490.000đ) ra tổng ≈2,31tr
(2.314.000đ ở lần chạy gần nhất; seed suy từ user nên tổng đổi trong khoảng vài chục nghìn), đủ 90 món, không lặp trong
2 ngày liền; markdown tải về có BOM, 30 bảng ngày + danh sách đi chợ; mobile 30 accordion; xoá
plan rồi mở lại URL cũ ra "Không tìm thấy thực đơn"; CTA recommend lưu được plan 7 ngày ở mức
60.000đ/ngày. Ảnh: `docs/screenshots/plans-*.png`.

## Phase 7: History + Polish

### T17 — History

**Mô tả:** `listHistory` cursor-based, filter theo bữa; trang `/history` hiển thị timeline, mở lại chi tiết, xoá từng mục.

**Acceptance:**

- [x] Sắp mới nhất trước, phân trang 20/lần
- [x] Filter bữa hoạt động; empty state có CTA
- [x] Chỉ thấy dữ liệu của mình (test)
- [x] Xoá mục → biến mất, reload vẫn mất

**Kết quả:** Mỗi lượt gợi ý của user đăng nhập ghi 1–3 row `recommendations` chung `batch_id`
(migration `0001_cooing_songbird.sql`, index `recommendations_batch_idx`); `total_vnd` của row là
giá riêng bữa đó, tổng lượt = `sum` trong batch. `packages/db/src/history.ts` nhóm theo `batch_id`,
cursor `"<createdAt>:<batchId>"` (so tuple, không offset), lọc bữa ở `WHERE` nên tổng khi lọc là
tổng phần đã lọc; `deleteHistoryBatchForUser` scope `user_id` và trả `false` cho batch người khác.
`/history` có chip lọc, load-more, `<details>` giải thích (bỏ nhãn trùng khi reason đã mở đầu bằng
tên bữa), xoá 2 bước, empty state CTA, skeleton/error+retry. Khách không ghi DB — `/history` vẫn
guard đăng nhập.
**Verify:** `pnpm test -- history` (db 8 test + service 4 test + input 5 test) +
`node scripts/checkpoint-g.mjs` (22 bước, gồm user thứ hai không thấy dữ liệu user đầu) +
ảnh `docs/screenshots/history-{vi,mobile,empty,en}.png`
**Files:** `packages/db/src/{history.ts,history.test.ts,schema.ts}`, `migrations/0001_*.sql`,
`apps/web/src/server/{history.service.ts,history.functions.ts,recommend.functions.ts}`,
`lib/{history-input.ts,history-types.ts}`, `routes/history.tsx`, `components/history/history-list.tsx`
**Deps:** T8, T13 · **Size:** M

### T18 — Lưu chat cho registered

**Mô tả:** Khi có session, persist `chat_threads` + `chat_messages`; danh sách thread trong `/chat` sidebar; mở lại thread cũ.

**Acceptance:**

- [x] User đăng nhập chat → thread xuất hiện sau reload
- [x] Khách vẫn chỉ localStorage
- [x] Đổi locale không làm mất thread

**Kết quả:** `packages/db/src/chat.ts` (thread + message, danh sách theo tin nhắn cuối, đọc theo
thứ tự chèn bằng `rowid`, xoá scope `user_id`, cascade tin nhắn) — không cần migration vì bảng đã
có từ T2. `apps/web/src/server/chat-thread.service.ts` mở lượt (`beginChatTurn` lưu thread + câu
hỏi trước khi stream), chốt lượt (`finishChatTurn`, giữ partial khi bấm Dừng, bỏ text rỗng); route
`/api/chat` phát thêm event `thread` đầu stream nên UI biết `threadId` để nhắn tiếp. `getChatThread`
map `dish_ids` → thẻ món đọc từ DB (bỏ id món đã xoá), nên đổi locale vẫn giữ thread và tên món
đổi ngôn ngữ. `/chat` loader lấy user + thread list ở server; sidebar có "Mới", thread đang mở,
giờ cập nhật; khách thấy lời mời đăng nhập; "Xoá hội thoại" của user xoá thread trên server. Sửa
kèm: `vite.config.ts` trước đây ghi đè env shell bằng `.env` (trái ADR-009), giờ chỉ điền biến còn
thiếu — nhờ đó checkpoint chạy được `AI_PROVIDER=mock`.
**Verify:** `pnpm test -- chat` (db 8 test + service 11 test + input 3 test) +
`BASE_URL=http://localhost:3001 node scripts/checkpoint-chat.mjs` (25 bước) + ảnh
`docs/screenshots/chat-{guest,vi,en,mobile}.png`
**Files:** `packages/db/src/{chat.ts,chat.test.ts}`, `packages/db/src/queries.ts` (+`findDishesByIds`),
`apps/web/src/server/{chat-thread.service.ts,chat.functions.ts,chat.service.ts}`,
`routes/api/chat.ts`, `routes/chat.tsx`, `components/chat/{chat-panel,chat-thread-list,chat-message}.tsx`,
`lib/chat-{types,input}.ts`
**Deps:** T10, T11, T13 · **Size:** M

### T19 — i18n sweep + a11y + performance

**Mô tả:** Rà toàn bộ chuỗi, bổ sung aria/label/focus, kiểm contrast, kiểm `prefers-reduced-motion`, tối ưu font loading, LCP.

**Acceptance:**

- [x] `pnpm i18n:check` = 0 vi phạm
- [x] 0 vi phạm axe-core (thay cho Lighthouse ≥ 95 — xem ghi chú)
- [x] Keyboard-only đi hết luồng recommend
- [x] Không layout shift khi load font (`font-display: swap`, CLS ≤ 0.001)

**Kết quả:** a11y kiểm bằng axe-core qua Playwright (`@axe-core/playwright`), không dùng Lighthouse
vì chưa có Playwright config (T20) và ngưỡng điểm Lighthouse dao động khó làm cổng CI — quyết định
này đã được chốt và spec S9 cập nhật theo. `scripts/checkpoint-a11y.mjs` quét 13 lượt (vi: `/`,
`/recommend`, `/chat`, `/login`, `/register`; en: `/`, `/recommend`; dark: `/`, `/recommend`; đã
đăng nhập: `/plans`, `/history`, `/settings`, `/chat`) với tag `wcag2a, wcag2aa, wcag21a, wcag21aa,
wcag22aa, best-practice` → **0 vi phạm**, cộng 47 kiểm tra cấu trúc/bàn phím.

Lỗi thật phát hiện và sửa:

- **Không có skip link** — Tab đầu tiên rơi vào logo. Thêm `SkipLink` trong `__root.tsx` (i18n
  `nav.skipToContent`), `main#main tabIndex={-1}` để Enter chuyển focus thật vào nội dung.
- **`label-content-name-mismatch` ở menu tài khoản** — `aria-label={user.email}` trong khi chữ hiện
  là tên hiển thị (hoặc email bị cắt). Bỏ `aria-label`, để tên accessible lấy từ chữ nhìn thấy.

Font: chuyển từ Google Fonts sang **tự host** 72KB (`apps/web/public/fonts`, 3 weight × 2 subset,
`unicode-range` giữ nguyên của Google) và bỏ 2 `<link>` preconnect + stylesheet. `<strong>` không
dùng ở đâu nên bỏ luôn weight 700.

Hiệu năng — đo trên **bản build production** (`pnpm build` + `pnpm start`, server Node thuần thêm
mới `scripts/serve-build.mjs`), Slow 4G + CPU 4x, 3 lần/trang lấy trung vị
(`scripts/checkpoint-perf.mjs`):

| Trang                | LCP    | FCP    | CLS    | Request | Origin bên thứ ba |
| -------------------- | ------ | ------ | ------ | ------- | ----------------- |
| `/` (trước)          | 1632ms | —      | 0.0005 | 19      | fonts.googleapis  |
| `/` (sau)            | 1656ms | 1656ms | 0.0005 | 18      | 0                 |
| `/recommend` (trước) | 1988ms | —      | 0.0001 | 26      | fonts.googleapis  |
| `/recommend` (sau)   | 2068ms | 2068ms | 0.0001 | 25      | 0                 |

Trung thực mà nói: **LCP/CLS không cải thiện** (chênh lệch nằm trong nhiễu ±5%, FCP luôn bằng LCP vì
trang chờ CSS/JS chứ không chờ font). Thay đổi được giữ lại vì lý do khác: bỏ phụ thuộc mạng ngoài
(fonts.googleapis.com có thể bị chặn/chậm ở VN), không lộ IP người dùng, image Docker tự chạy được
không cần internet, và ít hơn 1 request. Hai thử nghiệm đã **revert** vì không vượt nhiễu: (1)
`preload` 4 file font (home 1632→1692, recommend 2068→1996 — ngược chiều nhau), (2) fallback metric
override (`size-adjust`) vì CLS vốn đã 0.0005, không có gì để sửa.

i18n: xoá 4 key chết (`theme.label`, `budget.perDay`, `budget.perMeal`, `budget.perMonth`) →
**225 key / 225 dùng / 0 thừa**. `pnpm i18n:check` giờ bắt cả key chết, không chỉ key thiếu.

**Verify:** `BASE_URL=http://localhost:3001 node scripts/checkpoint-a11y.mjs` → 47 PASS, `ERRORS: 0`,
`FAILURES: 0`; `pnpm build && pnpm start &` rồi `BASE_URL=http://localhost:3002 node
scripts/checkpoint-perf.mjs` → 6 PASS, LCP ≤ 2500ms và CLS ≤ 0.1 trên cả 2 trang
**Files:** `apps/web/src/routes/__root.tsx`, `apps/web/src/styles/globals.css`,
`apps/web/public/fonts/*` (6 file woff2), `apps/web/src/components/site-header.tsx`,
`packages/i18n/src/{vi,en,i18n.test}.ts`, `scripts/{checkpoint-a11y,checkpoint-perf,serve-build}.mjs`,
`package.json` (+`start`, +`@axe-core/playwright`), `apps/web/package.json` (+`better-sqlite3` để
chạy được bản build)
**Deps:** T9b, T11, T15, T17 · **Size:** M

### T20 — E2E + docs + Docker

**Mô tả:** Playwright happy path (khách recommend → register → save plan → export), README (setup, env, mock vs openrouter, cấu trúc), ADR files, Dockerfile multi-stage chạy `better-sqlite3` + volume `data/`.

**Acceptance:**

- [x] `pnpm test:e2e` xanh trên CI local (headless)
- [x] `docker build && docker run -v $PWD/data:/app/data` chạy được
- [x] README: 3 bước từ clone → chạy
- [x] `docs/adr/0001..0005.md` ghi ADR-001..005

**Kết quả:** E2E chạy trên **dev server thật** nhưng `AI_PROVIDER=mock` và DB riêng
`apps/web/.e2e/mam.db` (xoá + bootstrap mỗi lượt), cổng **4310**, `workers: 1`,
`reuseExistingServer: false` — trước đó test từng báo lỗi a11y không có thật vì một app khác đang
chiếm cổng 3100. `pnpm test:e2e` = **4/4 xanh, ~30s**, chạy 2 lần liên tiếp:

1. happy path: khách nhận 3 bữa → bấm lưu bị chuyển `/login?redirect=%2Frecommend` → đăng ký →
   quay lại → gợi ý lại → lưu thực đơn 7 ngày → trang chi tiết đủ ngày 1..7 → tải `.md` và kiểm nội
   dung thật (`# Thực đơn 7 ngày`, `## Đi chợ`, disclaimer giá) → thực đơn có trong `/plans`.
2. axe-core: vi (`/`, `/recommend`, `/chat`), en (`/`), dark (`/`, `/recommend`) — 0 vi phạm, đúng
   1 `h1`, `lang` khớp locale.

Hạ tầng kèm theo: `packages/db/src/bootstrap.ts` + `scripts/bootstrap.ts` (`db:bootstrap`, migrate +
seed idempotent, dùng chung cho Docker và e2e); `test.include` của Vitest chỉ nhận
`src/**/*.test.ts` để Playwright không bị Vitest nhặt; `tsconfig` include `e2e/**/*.ts`; tắt
`video` (máy chưa có ffmpeg của Playwright). Sửa flaky: hai thread chat tạo trong cùng mili-giây
được sắp thêm theo `coalesce(max(chat_messages.rowid),0)`.

Docs: `README.md` (3 bước, bảng lệnh, kiến trúc, bảo mật, Docker, testing) và **13 ADR**
`docs/adr/0001..0013` — 0001 AI không bịa giá, 0002 budget/ngày, 0003 i18n dictionary, 0004
locale/theme cookie, 0005 session tự quản, 0011 axe thay Lighthouse, 0012 font tự host, 0013 đóng
gói Docker.

Docker: `docker build -t mam .` → image **293MB**; container chạy `node` user, healthcheck xanh.
Kiểm bằng volume rỗng `/tmp/mam-docker-data` rồi đúng lệnh trong acceptance với `$PWD/data`:
`GET /` = 200, bootstrap log `100 dishes, 10 roles`, DB tạo ở host; Playwright đăng ký → gợi ý →
lưu thực đơn 7 ngày thành công (`users=1`, `plans=1`, `plan_items=21` trong DB host). Image không
đặt `NODE_ENV=production` để cookie chạy trên `http://localhost` (ADR-013).

**Verify:** `pnpm test:e2e` (4/4) · `docker build -t mam .` · `docker run --rm -p 3000:3000 -v
"$PWD/data:/app/data" mam`
**Files:** `apps/web/e2e/*.spec.ts`, `apps/web/playwright.config.ts`, `packages/db/src/bootstrap.ts`,
`packages/db/scripts/bootstrap.ts`, `README.md`, `Dockerfile`, `.dockerignore`, `docs/adr/*`,
`docs/spec.md`, `package.json` (+`db:bootstrap`), `apps/web/vite.config.ts`, `apps/web/tsconfig.json`
**Deps:** tất cả · **Size:** M

#### Checkpoint G (Definition of Done)

- [x] 10 success criteria ở `docs/spec.md` §1 pass
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` sạch
- [x] Không có `.env`, key, hay `data/*.db` trong git
- [ ] Review cuối với human

**Kết quả Checkpoint G:**

| Cổng                                 | Kết quả                                                       |
| ------------------------------------ | ------------------------------------------------------------- |
| `pnpm format:check`                  | PASS                                                          |
| `pnpm typecheck`                     | 6/6 package                                                   |
| `pnpm lint`                          | 6/6 package                                                   |
| `pnpm test`                          | **221 test** (domain 29, ai 39, db 38, i18n 12, web 103)      |
| `pnpm build`                         | PASS (web dist + server bundle)                               |
| `pnpm i18n:check`                    | 225 key / 225 dùng / 0 thiếu, 0 thừa                          |
| `pnpm test:e2e`                      | 4/4 (happy path + axe vi/en/dark), ~33s                       |
| `scripts/checkpoint-a11y.mjs`        | 47 PASS, 0 lỗi, 0 fail                                        |
| `scripts/checkpoint-perf.mjs`        | 6 PASS, LCP ≤ 2500ms, CLS ≤ 0.1, 0 origin bên thứ ba          |
| `scripts/checkpoint-g.mjs` (history) | 22 PASS, 0 lỗi, 0 fail                                        |
| Docker build + run (`$PWD/data`)     | `/` 200, đăng ký/gợi ý/lưu plan OK, DB trên host              |
| `.gitignore`                         | `.env`, `data/*.db*`, e2e artifacts, build output đều bị chặn |

Không có git repo (theo quyết định "để sau") nên chưa commit gì; mọi thay đổi vẫn ở working tree.
`.env` chỉ tồn tại trên máy, `data/mam.db` bị ignore — không có secret hay DB nào lọt vào lịch sử
khi khởi tạo repo sau này.

**Còn lại:** human review cuối (checkpoint G).

### T21 — Dùng gần đủ ngân sách (feedback sau review)

**Mô tả:** sau Checkpoint G, human review bắn 2 phản hồi: (1) `/chat` hiện banner "AI tạm không
khả dụng" — chẩn đoán là OpenRouter 429 `free-models-per-day` (hạn mức 50/ngày dùng hết lúc dev,
reset 07:00 30/10), đúng hành vi fallback S2/ADR-001, không phải bug; (2) chọn **Người tập gym
180k/ngày** chỉ trả **115k**, bỏ phí 65k. Nguyên nhân: ranker cộng flat +40 cho mọi món trong
ngân sách (món 25k bằng điểm món 45k), query ứng viên lấy 20 món rẻ nhất trong trần nên cắt mất
món sát trần (trần trưa 72k → cao nhất chỉ 50k). Human chốt phương án **"Dùng gần đủ ngân sách"**
→ spec S3 đổi thành _"tổng ≤ ngân sách; ưu tiên món sát trần từng bữa (không bỏ phí ngân sách)"_.

**Acceptance:**

- [x] Ranker cộng điểm sử dụng ngân sách: món sát trần wins trong nhóm "vừa ngân sách"
- [x] Ứng viên gồm món sát trần (lunch cap 72k có món ≥55k trong top 20)
- [x] Gym 180k/ngày → tổng ≥150k, không lặp món giữa 3 bữa
- [x] Server loại món đã dùng ở bữa trước khỏi ứng viên bữa sau
- [x] Prompt AI nhắc "prefer dishes that use most of the meal budget" (pick + chat)
- [x] Full gates xanh lại

**Kết quả:** gym 180k giờ ra **45k + 60k + 60k = 165k** (đúng trần lý thuyết của split
25/40/35 — "Cơm gà hải nam" bữa trưa, "Gà kho gừng" bữa tối, không trùng món). Ranker thêm
`UTILIZATION_WEIGHT = 30`: trong nhóm vừa ngân sách, điểm cộng `price/mealBudget × 30`, đủ lớn
để thắng chênh lệch fill/quick. Query ứng viên đổi thứ tự `fillLevel desc, priceVnd **desc**,
slug asc` — plan service (limit 100) không bị ảnh hưởng, chat/giới trần thấp vẫn filter đúng.
Service recommend loại món đã dùng khỏi ứng viên bữa sau khi chọn (rỗng thì dùng lại danh sách
đầy đủ để không mất bữa). Prompt tích cực (pick + chat) thêm 1 dòng nhắc ưu tiên dùng hết ngân
sách. Mock advisor test đổi kỳ vọng `picks[0] = 'b'` (món 20k > món 12k vì sát trần 24k).

Chat checkpoint vẫn 25/25 và "3 dish cards" giữ nguyên; history checkpoint 22/22; e2e 4/4.

**Verify:** RED→GREEN theo TDD — 5 test mới/đổi trước khi sửa code (2 fail ở `@mam/ai`,
1 fail ở `@mam/db`, 2 fail ở `apps/web`) · `pnpm test` **225 test** (domain 29, ai 40, db 39,
i18n 12, web 105) · `format:check`/`typecheck` 6/6/`lint` 6/6 · `build`·`i18n:check` 225/225 ·
`pnpm test:e2e` 4/4 · `checkpoint-chat` 25/25 · `checkpoint-g` 22/22 · kiểm runtime trên 3001:
gym 180k → tổng **165.000₫**, `checkpoint` banner không còn do mock
**Files:** `packages/db/src/queries.ts`, `packages/ai/src/rank.ts`, `packages/ai/src/openrouter.ts`,
`apps/web/src/server/recommend.service.ts`, `packages/ai/src/ai.test.ts`,
`packages/db/src/queries.test.ts`, `apps/web/src/server/recommend.service.test.ts`, `docs/spec.md`
**Deps:** T5, T6, T9a · **Size:** M

### T22 — Planner không báo sai "thiếu tiền/thiếu món" (từ kiểm chứng vét cạn)

**Bối cảnh:** `pnpm verify:planner` (skill `.claude/skills/verify-planner`) chạy `buildPlan` thật
trên mọi bộ ≤6 món và so với oracle vét cạn: 22.943 trường hợp planner đòi tăng tiền dù ngân sách
đã đủ (P5), 7.396 trường hợp báo "thiếu món" dù thêm tiền là xếp được (P4). Catalog thật:
`no-egg`, 1 ngày, 45.000đ → infeasible, gợi ý 46.000đ dù có ngày 43.000đ.

**Acceptance:**

- [x] Reserve tính sau khi loại chính món đang xét (bữa trước không "ăn" món duy nhất bữa sau cần)
- [x] Lượt "rẻ nhất" (≥2 ngày) neo ngày đầu vào bộ rẻ nhất còn một ngày khác hẳn vừa ngân sách
- [x] `minimumDailyBudgetVnd` tính chính xác (làm tròn lên bội 1.000đ), bỏ quét `floor..4×floor`
- [x] `pnpm verify:planner` sạch P1–P5; 4 test mới (RED trước khi sửa)

**Kết quả:** verify nhanh **0 vi phạm** (463.680 lần chạy, 90s → 18s vì `minCostFor` chỉ xét
`n` món rẻ nhất mỗi bữa); catalog thật 11.328 lần chạy 1 ngày: 0 sai; plan 30 ngày ~4ms. Mỗi
phần mới đều có phá thử bị bắt (bỏ loại món trong reserve, bỏ neo ngày đầu, `minCostFor` xét 1
món, `TWO_DAY_SLOTS = 3`); ceil→floor chỉ bị unit test giá lẻ bắt.

**Verify:** RED→GREEN theo TDD (3 test fail trước khi sửa, test giá lẻ chứng minh bằng phá thử) ·
`pnpm test` **229 test** (domain 33, ai 40, db 39, i18n 12, web 105) · `format:check` ·
`typecheck` 6/6 · `lint` 6/6 · `build` · `i18n:check` 225/225 · `pnpm test:e2e` 4/4 ·
`checkpoint-f` 0 lỗi · `pnpm verify:planner` OK (deep: 12,4 triệu lần chạy, 0 vi phạm)
**Files:** `packages/domain/src/planner.ts`, `packages/domain/src/planner.test.ts`,
`scripts/verify-planner.ts`, `.claude/skills/verify-planner/SKILL.md`, `package.json`,
`docs/spec.md`, `CLAUDE.md`, `AGENTS.md`, `README.md`
**Deps:** T14 · **Size:** S

### T23 — Thay OpenRouter bằng Google Gemini (ADR-014)

**Bối cảnh:** OpenRouter model free giới hạn 50 req/ngày, hết thì mọi gợi ý rơi về mock. User dùng
key Google của mình, model Gemini 3.5 Flash.

**Acceptance:**

- [x] `packages/ai/src/gemini.ts` (`createGeminiAdvisor`) gọi endpoint tương thích OpenAI của Google,
      Bearer key, model mặc định `gemini-3.5-flash` (đổi qua `GEMINI_MODEL`; rỗng = mặc định)
- [x] Pick dùng `response_format` `json_schema`; Zod + guards + mock fallback giữ nguyên
- [x] `AI_PROVIDER=mock|gemini`, thiếu `GEMINI_API_KEY` → fail fast; `openrouter` → lỗi khởi động
- [x] Không dependency mới; `pnpm ai:check` gọi thật để lộ lỗi mà fallback che đi

**Kết quả:** `pnpm ai:check` với key giả chạm đúng endpoint Google, in
`HTTP 400 "Please pass a valid API key"`. **Chưa chạy với key thật** — chờ user đặt key vào `.env`.

**Verify:** RED→GREEN (3 test adapter + 4 test `advisor.ts` fail trước khi sửa, test model rỗng
fail trước khi sửa) · `pnpm test` **237 test** (domain 33, ai 44, db 39, i18n 12, web 109) ·
`format:check` · `typecheck` 6/6 · `lint` 6/6 · `build` · `i18n:check` 225/225 · `test:e2e` 4/4
**Files:** `packages/ai/src/gemini.ts` (từ `openrouter.ts`), `packages/ai/src/gemini.test.ts`
(từ `openrouter.test.ts`), `packages/ai/src/index.ts`, `packages/ai/src/types.ts`,
`apps/web/src/server/advisor.ts`, `apps/web/src/server/advisor.test.ts`,
`apps/web/src/server/chat.service.test.ts`, `scripts/check-gemini.ts`, `package.json`,
`.env.example`, `docs/adr/0014-gemini-thay-openrouter.md`, `docs/spec.md`, `CLAUDE.md`,
`AGENTS.md`, `README.md`
**Deps:** T10 · **Size:** S

### T24 — Phân trang đánh số cho `/history` (10 lượt/trang)

**Bối cảnh:** `/history` dùng "Tải thêm" theo cursor (20 lượt/lần, nối vào cuối), nên lịch sử dài
thành một danh sách dài mãi. User muốn phân trang, mỗi trang 10 lượt.

**Acceptance:**

- [x] `listHistoryForUser({page, mealType})` → `{items, page, pageCount, total}`, 10/trang, trang
      ngoài khoảng kẹp về `[1, pageCount]`; xoá hẳn cursor (encode/decode, schema, i18n `loadMore`)
- [x] URL `?page=&meal=` (`validateSearch`); rác trong URL bị bỏ; server kẹp trang thì loader
      redirect `replace` để URL khớp (vd. `?page=99` → trang cuối)
- [x] Thanh phân trang `<nav>`: Trước/Sau + số trang có `…` (`paginationItems`), `aria-current`,
      ẩn khi chỉ 1 trang; xoá lượt thì nạp lại trang hiện tại (`router.invalidate({ sync: true })`)

**Kết quả:** e2e mới tạo 11 lượt qua UI thật: trang 1 có 10, trang 2 có 1, URL `?page=2`, back về
trang 1, reload giữ trang, `?page=99` kẹp về 2. Probe 45 lượt (5 trang) trên server mock tạm: axe 0
vi phạm sáng/tối, không tràn ngang ở 390px. Checkpoint G lần đầu bắt lỗi xoá (thẻ đã xoá còn hiện
khi toast bật) → sửa bằng `invalidate({ sync: true })`. Chưa xem trên trình duyệt: dấu `…` (>7
trang; logic có unit test), trạng thái lỗi + thử lại, redirect sau khi xoá lượt cuối của trang cuối.

**Verify:** RED→GREEN (db 8 fail, input 6 fail, `pagination` chưa có module) · `pnpm test`
**251 test** (db 43, ai 44, domain 33, i18n 12, web 119) · `format:check` · `typecheck` 6/6 ·
`lint` 6/6 · `build` · `i18n:check` 228/228 · `pnpm test:e2e` **5/5** · `checkpoint-g` 22/22 ·
`checkpoint-a11y` 0 lỗi (server mock tạm 3002, vì 3001 đang dính rate limit đăng ký)
**Files:** `packages/db/src/history.ts`, `packages/db/src/history.test.ts`,
`apps/web/src/lib/history-input.ts`, `apps/web/src/lib/history-input.test.ts`,
`apps/web/src/lib/history-types.ts`, `apps/web/src/lib/pagination.ts`,
`apps/web/src/lib/pagination.test.ts`, `apps/web/src/server/history.functions.ts`,
`apps/web/src/routes/history.tsx`, `apps/web/src/components/history/history-list.tsx`,
`apps/web/src/components/history/history-pagination.tsx`,
`apps/web/e2e/history-pagination.spec.ts`, `packages/i18n/src/{vi,en}.ts`, `docs/spec.md`,
`CLAUDE.md`, `AGENTS.md`, `README.md`
**Deps:** T17 · **Size:** M

## Phase 8: Năm tính năng mới (`docs/plans/p8-tinh-nang-moi.md`)

Dấu vết quyết định: `docs/plans/p8-trail.md`.

### T25 — ✅ Trang duyệt món `/dishes`

**Bối cảnh:** Catalog 100 món chỉ thấy gián tiếp qua gợi ý và chat. User muốn xem cả danh mục,
tìm và lọc món mà không cần tạo một lượt gợi ý.

**Acceptance:**

- [x] `listAllDishes(db)` trả `DishCard[]` đủ 100 món, sắp theo `slug`; server fn `listDishes`
      không cần đăng nhập
- [x] `filterDishes` thuần: `q` so tên vi/en sau khi bỏ dấu và hạ chữ thường (`com tam` khớp
      `Cơm tấm`), lọc bữa, nhiều tag là AND, khoảng giá có biên, filter rỗng trả đủ
- [x] Filter trên URL `?q=&meal=&tag=&min=&max=`; tham số rác bị bỏ, không sập trang (bộ đọc URL
      chung `search-params.ts` cho mọi trang, kể cả `/history`); reload và Back giữ filter
- [x] Link "Món ăn" trong header desktop và mobile sheet; trạng thái rỗng có nút xoá bộ lọc, focus
      về ô tìm
- [x] Perf: thẻ đầu tiên trong 1,5 lần mốc `/recommend` của trunk, cập nhật filter dưới 50ms trung vị

**Kết quả:** Swarm lần 1 bắt lỗi chặn (`?q=123` và `?tag=5` làm sập trang, HTML SSR 498KB làm tỉ lệ
tải 1,87–1,98, lọc 72–76ms vì mỗi phím gọi `navigate`, header tràn ở 768px, focus rơi về `<body>`).
Sau vòng sửa, swarm lần 2 (5 worker, lane 1–10 và hồi quy toàn app) PASS cả: HTML ~102KB, tỉ lệ tải
1,18–1,29 (giới hạn 1,5), lọc 17,8–19,3ms (giới hạn 50), axe 0 vi phạm ở 9 trạng thái, header 65px
mọi độ rộng. Operator duyệt 2026-11-03, giữ mặc định hết.

**Theo dõi (chưa sửa):**

- Gõ rồi bấm Back trong 300ms có thể bị lượt ghi URL đang chờ đè lại
- `?q=3` gõ tay trên URL bị bỏ (router parse thành số, không phải chuỗi)
- Xoá ô tìm (về 100 thẻ) có trung vị khoảng 55ms, riêng lượt này vượt 50ms
- Tìm kiếm thu hẹp ngay khi gõ (`ca` ẩn "canh")
- Seed gõ nhầm "Cá tím nướng" (đúng là "Cà tím"); operator chọn giữ nguyên
- Trước T27: `.dish-card > div` sẽ đè style lên vùng nút thích/chán, cần class riêng

**Verify:** RED→GREEN theo TDD · `pnpm test` **341 test** (domain 33, ai 44, db 46, i18n 12,
web 206) · chuỗi cổng `CLAUDE.md` xanh · `i18n:check` 294 key · `pnpm test:e2e` **15/15** hai lần,
không flake · perf `scratchpad/p8/perf-t25b/` · ảnh và video `docs/screenshots/p8/T25-review-*`
**Files:** `apps/web/src/routes/dishes.tsx`, `apps/web/src/routeTree.gen.ts`,
`apps/web/src/components/dishes/dish-browser.tsx`, `apps/web/src/lib/dish-filter.ts`,
`apps/web/src/lib/dish-filter.test.ts`, `apps/web/src/lib/dish-labels.test.ts`,
`apps/web/src/lib/search-params.ts`, `apps/web/src/lib/search-params.test.ts`,
`apps/web/src/lib/history-input.ts`, `apps/web/src/lib/history-input.test.ts`,
`apps/web/src/router.tsx`, `apps/web/src/server/catalog.functions.ts`,
`apps/web/src/components/site-header.tsx`, `apps/web/src/styles/globals.css`,
`apps/web/e2e/dishes.spec.ts`, `packages/db/src/queries.ts`, `packages/db/src/queries.test.ts`,
`packages/i18n/src/{vi,en}.ts`, `docs/spec.md`, `CLAUDE.md`, `AGENTS.md`, `README.md`
**Deps:** none · **Size:** M

### T26 — ✅ Xuất thực đơn ra CSV và .xlsx

**Bối cảnh:** Thực đơn chỉ xuất markdown, khó mở bằng bảng tính để chỉnh hay in danh sách đi chợ.

**Acceptance:**

- [x] Hàm thuần `planRows(input)` là nguồn chung cho markdown, CSV và .xlsx; markdown giống trunk
      từng byte (vi, en)
- [x] `buildPlanCsv`: dấu phẩy, ngoặc kép theo RFC 4180, BOM khi tải, giá là số nguyên, dòng cuối là
      tổng; `planFileName(title, startDate, ext)` nhận `md`/`csv`/`xlsx`, cắt theo code point
- [x] `.xlsx` qua dependency mới `write-excel-file@4.1.1` (MIT, 1 dependency con `fflate`), chỉ tải
      lười khi bấm; độ rộng cột, giá `#,##0`, dòng tổng in đậm
- [x] Menu xuất có `plan-export-csv` và `plan-export-xlsx`; e2e tải cả hai và kiểm tên món tiếng
      Việt trong `xl/sharedStrings.xml`

**Kết quả:** Verdict sạch. JS lúc tải trang +0,96KB gzip (giới hạn 2KB), tạo .xlsx 30 ngày trung vị
299ms (giới hạn 1s), chunk lười `write-excel-file` 19,69KB gzip (giới hạn 40KB). CSV và .xlsx khớp DB
với 7 và 30 ngày. Lỗi mới duy nhất swarm bắt được là `planFileName` cắt đôi emoji, root sửa theo TDD.
Operator duyệt 2026-11-03: giữ nhãn menu, giữ CSV dấu phẩy.

**Theo dõi (chưa sửa):**

- CSV chưa chặn formula injection (chưa với tới được vì tên món chỉ từ seed)
- Chưa có test cho toast lỗi khi tạo .xlsx hỏng
- `plan-xlsx.test.ts` import `readZipEntry` từ thư mục `e2e/`
- axe có vi phạm có sẵn từ trước trên trunk: nút tài khoản mobile thiếu tên, dropdown Radix chế độ
  modal đặt `aria-hidden`
- CSV dấu phẩy có thể mở thành 1 cột ở Excel Windows vùng VN; cột ngày khác UI; bảng tính không có
  tổng theo ngày

**Verify:** RED→GREEN (unit và e2e fail trước khi sửa; test cắt emoji fail trước) · lúc code-ready
`pnpm test` 288 test, `test:e2e` 7/7; cổng cuối gộp vào lượt chạy của vòng sửa T25 (341 test, e2e
15/15) · perf `scratchpad/p8/perf-t26/` · ảnh và video `docs/screenshots/p8/T26-review-*`
**Files:** `apps/web/src/lib/plan-export.ts`, `apps/web/src/lib/plan-export.test.ts`,
`apps/web/src/lib/plan-xlsx.ts`, `apps/web/src/lib/plan-xlsx.test.ts`,
`apps/web/src/components/plans/export-menu.tsx`, `apps/web/e2e/happy-path.spec.ts`,
`apps/web/e2e/read-zip.ts`, `apps/web/package.json`, `pnpm-lock.yaml`,
`packages/i18n/src/{vi,en}.ts`, `docs/spec.md`, `README.md`
**Deps:** none · **Size:** M

### T27 — ✅ Lưu món thích và món chán

**Bối cảnh:** User muốn đánh dấu món mình thích hoặc đã chán ngay trên `/dishes`, và xem lại riêng
món đã thích. T28 cần tập món chán để loại khỏi gợi ý, chat và planner.

**Acceptance:**

- [x] Bảng `dish_preferences(user_id, dish_id, kind, created_at)`, khoá chính `(user_id, dish_id)`,
      `CHECK kind in ('like','dislike')`, cascade theo user và món (ADR-015); migration `0002` chỉ
      thêm bảng
- [x] `setDishPreference` upsert, gọi lặp lại vẫn một hàng, `null` xoá, `created_at` đổi khi đổi
      kind; `listDishPreferences` trả `{ liked, disliked }` chỉ của user đó
- [x] Server fn `setPreference` (POST, Zod, khách trả `unauthorized`, món lạ trả `dish_not_found`) và
      `listMyPreferences` (khách trả `null`)
- [x] Mỗi thẻ món có nút thích và chán với `aria-pressed`; khách bấm thì có toast mời đăng nhập,
      không ghi DB, không ghi `localStorage`
- [x] "Chỉ món thích" trên URL `?liked=true`; thẻ biến mất thì focus sang thẻ kế
- [x] Bấm nhanh trên một món: request nối đuôi theo món, lỗi thì UI về trạng thái server xác nhận
      lần cuối
- [x] Perf: tải `/dishes` khi đăng nhập không chậm hơn khách quá 15%, `setPreference` p95 dưới 100ms

**Kết quả:** Swarm lần 1 (5 lane: cổng và perf, live 1–5, live 6–10, audit đúng đắn, audit UX) PASS
cả, không lỗi chặn. Tải `/dishes` đăng nhập so với khách 1,01–1,04× (không có snapshot trunk trước
T27 nên dùng proxy này), `setPreference` p95 khoảng 4 ms, audit đúng đắn bắt đủ 6/6 lần phá thử.
Vòng sửa: focus sang thẻ kế khi thẻ rời danh sách lúc lọc món thích, vòng focus có offset cho nút
và chip đang bật, saver đọc lại trong cùng chuỗi của món và về trạng thái xác nhận lần cuối khi lỗi,
empty state có tiêu đề "Chưa có món thích", toast tiếng Anh thống nhất "Log in", `created_at` đổi
khi đổi kind. Verifier ở head mới 29/29 PASS. Operator duyệt 2026-11-04.

Cùng lúc sửa `apps/web/vite.config.ts` (operator cho phép): `.env` gốc đặt
`NODE_ENV=development`, `loadEnv` của Vite trả nó lại dưới tên `VITE_USER_NODE_ENV`, vòng chép env
đặt biến này nên `pnpm build` ra React bản dev. Giờ bỏ qua `NODE_ENV` và `VITE_USER_NODE_ENV` từ
file. Chunk index client 565 → 370 kB, không còn `jsxDEV`.

**Theo dõi (chưa sửa):**

- Toast che một phần nav (toàn app, không riêng T27)
- Chưa có filter "Món chán" để xem lại món đã chán; cân nhắc ở T28
- Mỗi lần bật tắt render lại 100 thẻ, khoảng 11 ms; chưa memo vì chưa đáng thêm độ phức tạp
- Focus trên dòng đếm kết quả dùng outline mặc định
- Hydration mismatch ở `dishes.spec.ts` "tìm, lọc, reload và back" có từ T26 (snapshot T26 15/15):
  helper gọi `goBack` giữa lúc trang reload đang hydrate
- Khách mở `?liked=true` thì tham số vẫn nằm trên URL

**Verify:** RED→GREEN theo TDD · `pnpm test` **374 test** (domain 33, ai 44, db 54, i18n 12,
web 231) · chuỗi cổng `CLAUDE.md` xanh ở head của verifier · `i18n:check` 303 key ·
`pnpm test:e2e` **19/19** · verifier 29/29 · ảnh và video
`docs/screenshots/p8/T27-review-{like,guest,filter,mobile-dark}.png`, `docs/screenshots/p8/T27-review.webm`
**Files:** `packages/db/src/{schema,index,preferences,preferences.test}.ts`,
`packages/db/migrations/0002_public_random.sql`, `packages/db/migrations/meta/0002_snapshot.json`,
`packages/db/migrations/meta/_journal.json`,
`apps/web/src/server/dish-preferences.{service,service.test,functions}.ts`,
`apps/web/src/lib/{dish-preferences,dish-preferences.test,dish-filter,dish-filter.test}.ts`,
`apps/web/src/components/dishes/{dish-preference-toggle,dish-browser}.tsx`,
`apps/web/src/routes/dishes.tsx`, `apps/web/src/styles/globals.css`,
`packages/i18n/src/{vi,en}.ts`, `apps/web/e2e/dish-preferences.spec.ts`, `apps/web/vite.config.ts`,
`docs/adr/0015-bang-dish-preferences.md`, `docs/spec.md`, `CLAUDE.md`, `AGENTS.md`, `README.md`
**Deps:** T25 · **Size:** M

### T28 — ✅ Áp món thích và món chán vào gợi ý, chat và planner

**Bối cảnh:** T27 lưu món thích và món chán nhưng chưa nơi nào dùng. User chán một món thì không
muốn thấy nó nữa; món đã thích thì muốn được gợi ý trước (ADR-016).

**Acceptance:**

- [x] `findDishCandidates` nhận `excludeDishIds`/`preferDishIds`: không có cả hai thì chạy đúng SQL
      trunk có `LIMIT`; có thì SQL không `LIMIT`, JS bỏ món chán, đưa món thích lên đầu (giữ thứ
      tự), rồi mới cắt về `limit`
- [x] Món chán bị loại khỏi ứng viên của `/recommend`, chat và thực đơn tạo mới, trước khi advisor
      thấy, nên cả Gemini, mock và mock fallback khi Gemini lỗi đều không chọn được
- [x] `LIKED_BONUS = 46` (30 + 2 × 6 + 3 + 1, tính từ trọng số `rank.ts`), chỉ cộng khi món vừa
      ngân sách; lý do `liked` cùng điều kiện; test ca xấu nhất khoá giá trị
- [x] Prompt Gemini pick và chat có cột `liked` và luật ưu tiên món thích
- [x] Planner chỉ loại món chán, `planner.ts` không đổi, hash `verify-planner` vẫn khớp
- [x] `loadSessionPreferences` là nơi duy nhất phân nhánh khách (`NO_PREFERENCES`), dùng ở
      `recommend.functions.ts` và `api/chat.ts`
- [x] Perf: recommend có preferences chậm hơn trunk không quá 10%; khách giống trunk

**Kết quả:** Swarm lần 1: cổng PASS (399 test), live 1–10 PASS (lane 1 phải so trên cùng một DB vì
id món là UUID ngẫu nhiên, dùng làm tie-break), audit đúng đắn bắt 13/14 lần phá thử. Perf FAIL:
recommend chậm hơn trunk 12–15%, quá luật 10%. Vòng sửa: truy vấn có preferences chạy SQL không
`LIMIT` rồi lọc và xếp trong JS, không preferences thì giữ SQL trunk. Recommend còn +4,8–7,1%
(+0,2–0,3 ms), plan 30 ngày nhanh hơn trunk 2–5%. Cùng vòng: `loadSessionPreferences` vá lỗ test
(phá thử trả `NO_PREFERENCES` cho user thì test đỏ), test ca xấu nhất khoá `LIKED_BONUS` (44 và 45
đều đỏ), `reasonsFor` chỉ gắn `liked` khi món vừa ngân sách. Verifier ở head mới: 402 unit, 303 key,
e2e 19/19, `verify:planner` OK, 1080 ca không preferences giống trunk từng byte, 8640 ca có
preferences 0 sai lệch, live 32/32. Verdict sạch; T28 không có cổng review nên chốt 2026-11-04.

**Chờ operator:**

- Món thích rẻ có thể thắng món sát trần, nên tổng ngày có thể giảm (ví dụ 110k xuống 80k). Căng
  với T21 (ưu tiên món sát trần); cần chọn giữ thưởng tuyệt đối hay đổi cách cộng điểm

**Theo dõi (chưa sửa):**

- Chưa có filter "Món chán" trên `/dishes` để xem lại món đã chán
- Chưa có test nối dây ở mức route: truyền tập rỗng ở chỗ gọi trong `recommend.functions.ts` thì
  unit test không bắt
- Prompt Gemini của khách giờ cũng có cột `liked` (luôn `no`)
- Chat Gemini có thể nhắc tên món chán trong phần chữ nếu món đó có ở lượt trước; thẻ món đã lọc

**Ghi nhận trên trunk (có từ trước, chưa sửa, chờ operator):**

- Bất biến #3 vỡ ở 45k/ngày: Chả giò ở cả bữa trưa và tối, do `fresh.length > 0 ? fresh : found`
  trong `recommend.service.ts` (đã sửa 2026-11-04, xem mục "Sửa bất biến #3" bên dưới)
- Gemini lỗi thì `/recommend` gắn nhãn "Dữ liệu mẫu" thay vì nhãn fallback

**Verify:** RED→GREEN theo TDD · `pnpm test` **402 test** (domain 33, ai 56, db 58, i18n 12,
web 243) · chuỗi cổng `CLAUDE.md` xanh ở head của verifier · `i18n:check` 303 key ·
`pnpm test:e2e` **19/19** · `pnpm verify:planner` OK P1–P5 · perf và kiểm chứng
`scratchpad/t28/fix/`, `/tmp/swarm-T28/worker-E/`
**Files:** `packages/ai/src/{types,index,rank,mock,gemini}.ts`,
`packages/ai/src/{ai,gemini,mock-chat}.test.ts`, `packages/db/src/{queries,queries.test}.ts`,
`apps/web/src/server/{dish-preferences.service,dish-preferences.service.test}.ts`,
`apps/web/src/server/{recommend.service,recommend.service.test,recommend.functions}.ts`,
`apps/web/src/server/{chat.service,chat.service.test,plan.service,plan.service.test}.ts`,
`apps/web/src/routes/api/chat.ts`, `docs/adr/0016-ap-mon-thich-mon-chan.md`, `docs/spec.md`,
`.claude/skills/verify-planner/SKILL.md`, `CLAUDE.md`, `AGENTS.md`, `README.md`
**Deps:** T27 · **Size:** M

### T29 — ✅ Tính ngân sách còn lại của tháng

**Bối cảnh:** User đang theo một thực đơn 7 hoặc 30 ngày muốn biết đã chi theo thực đơn bao nhiêu,
còn bao nhiêu, và mỗi ngày còn lại nên tiêu bao nhiêu, rồi gợi ý món theo con số đó.

**Acceptance:**

- [x] Hàm thuần `remainingBudget({ startDate, days, budgetVnd, dayTotals, today })` trả union
      `notStarted` | `inProgress` (`spentVnd`, `remainingVnd`, `daysLeft`, `newDailyVnd`,
      `overspentVnd`) | `finished`; `newDailyVnd` làm tròn xuống bội 1.000đ, chi vượt thì về 0
- [x] Ngân sách gốc là `dailyBudgetVnd × days`, cùng con số với ô "Ngân sách" ở chi tiết, danh
      sách và file markdown (quyết định B của operator)
- [x] "Hôm nay" theo `Asia/Ho_Chi_Minh`, tính ở `getPlan` trên server; `addDays`, `todayIsoDate`,
      `daysBetween` nằm ở `packages/domain/src/calendar.ts`
- [x] Thẻ ba ô số: "Chi theo thực đơn đến hôm qua" kèm dòng giải thích, "Còn lại … cho N ngày",
      "Ngân sách mới mỗi ngày"; chi vượt có cảnh báo và bước tiếp
- [x] Nút "Gợi ý theo ngân sách này" dẫn tới `/recommend?unit=day&amount=Z`; `/recommend` đọc URL
      qua `budgetSchema`, bỏ giá trị rác, có dòng báo nguồn, cuộn tới và focus ô số tiền
- [x] Perf: tải trang chi tiết 30 ngày chậm hơn trunk không quá 10% ở trung vị

**Kết quả:** Swarm lần 1 (5 lane: cổng và perf, live 1–5, live 6–10, audit đúng đắn, audit UX) PASS
cả. Cổng 427 unit; tải trang chi tiết 30 ngày −5,8% đến +9,5% qua 3 lượt, trong luật 10%; live 1–10
PASS; audit đúng đắn bắt 9/10 lần phá thử; audit UX không chặn. Vòng sửa UX: thẻ thành ba ô số, nhãn
"Chi theo thực đơn đến hôm qua" kèm dòng giải thích, `/recommend` có dòng báo ngân sách lấy từ thực
đơn, cuộn và focus ô số tiền, chi vượt có bước tiếp "Thử bớt món đắt ở các ngày còn lại.". Verifier
ở head mới 46/46 PASS. Operator duyệt 2026-11-04 và chọn B cho ngân sách gốc: dùng
`dailyBudgetVnd × days` thay cho `planBudgetVnd` (số user nhập), vì thực đơn tháng 7 ngày hiện
816.666đ lẻ cạnh "Mỗi ngày 116.000đ". Đã bỏ `planBudgetVnd`, `planBudgetOf` và trường `budgetVnd`
của `PlanSummary`; danh sách, file xuất và ô "Ngân sách" về đúng như trunk. Hệ quả đã chấp nhận:
thực đơn 30 ngày 2.500.000/tháng hiện 2.490.000 (83.000 × 30); lane 8 của plan sửa theo.

**Theo dõi (chưa sửa):**

- Nhãn "Tổng chi" phía trên thẻ có thể bị đọc là đã trả; cân nhắc đổi thành "Tổng theo thực đơn"
- Bước tiếp khi chi vượt "bớt món đắt" chưa làm được trên trang cho tới T30 (đổi món)
- Tiêu đề thực đơn ở locale en vẫn là tiếng Việt
- 390px: nút trên header thiếu accessible name (`button-name`), có từ trunk

**Verify:** RED→GREEN theo TDD · `pnpm test` **424 test** sau T29 (domain 48, ai 56, db 58, i18n 12,
web 250); cây làm việc đo được 427 vì có thêm 3 test của bản sửa bất biến #3 đang làm song song ·
chuỗi cổng `CLAUDE.md` xanh · `i18n:check` 317 key · `pnpm test:e2e` **21/21** · verifier 46/46 ·
ảnh và video `docs/screenshots/p8/T29-review-*.png`, `docs/screenshots/p8/T29-review.webm`
**Files:** `packages/domain/src/{calendar,calendar.test,remaining-budget,remaining-budget.test,index}.ts`,
`packages/i18n/src/{vi,en}.ts`, `apps/web/src/server/{plan.service,plan.service.test,plan.functions}.ts`,
`apps/web/src/lib/{plan-types,plan-export,plan-export.test,plan-input,plan-input.test,recommend-input,recommend-input.test}.ts`,
`apps/web/src/components/plans/remaining-budget-card.tsx`,
`apps/web/src/components/recommend/recommend-form.tsx`,
`apps/web/src/routes/plans/{$planId,index}.tsx`, `apps/web/src/routes/recommend.tsx`,
`apps/web/e2e/remaining-budget.spec.ts`, `docs/spec.md`, `docs/plans/p8-tinh-nang-moi.md`,
`CLAUDE.md`, `AGENTS.md`, `README.md`
**Deps:** T26 · **Size:** M

### T30 — ✅ Đổi một món trong thực đơn

**Bối cảnh:** Thực đơn đã lưu không sửa được. User không thích một món thì phải tạo lại cả thực
đơn. T29 gợi ý "bớt món đắt" khi chi vượt nhưng trang chưa có cách làm điều đó (ADR-017).

**Acceptance:**

- [x] Cột `plans.diet_tags` (JSON, `NOT NULL DEFAULT '[]'`, migration `0003_classy_lockheed.sql`
      chỉ thêm cột), lưu mảng đã sắp xếp khi tạo; thực đơn cũ `'[]'`, trang chi tiết có ghi chú
      ngắn khi thực đơn không có chế độ ăn
- [x] Hàm thuần `swapPlanMeal` trong `packages/domain/src/plan-swap.ts`: đúng bữa, khớp chế độ ăn,
      không món chán, không trùng hôm trước/hôm nay/hôm sau, tổng ngày ≤ `dailyBudgetVnd` với giá
      từ DB; vòng xoay theo |giá − giá món gốc| rồi `id`, trả `null` khi hết món
- [x] Món gốc của ô gửi lên dưới tên `anchorDishId`, giữ trong `sessionStorage`
      (`lib/swap-anchor.ts`); server không tin, mốc chỉ đổi thứ tự
- [x] `updatePlanItem` ghi đúng một hàng, scope theo `user_id` qua subquery `plans`;
      `swapPlanMealForUser` đọc và ghi trong một transaction `immediate`; server fn `swapPlanMeal`
      (POST, Zod) trả `no_alternative` / `not_found` / `unauthorized`, DB không đổi
- [x] Nút "Đổi món" có nhãn cho trình đọc màn hình ở bảng desktop và accordion mobile; ô vừa đổi
      sáng lên 1,5 giây, vùng `role="status"` đọc kết quả; tổng ngày, thẻ T29 và file xuất cập nhật
- [x] P6 trong `scripts/verify-planner.ts`; skill `verify-planner` có hash `plan-swap.ts`
- [x] Perf: tải trang chi tiết 30 ngày chậm hơn trunk không quá 10% ở trung vị, đổi món dưới
      300ms ở trung vị

**Kết quả:** Swarm lần 1 (5 worker, gộp kiểm quyết định B của T29 và hai bản sửa bất biến #3):
live 1–10 PASS, audit đúng đắn không lỗi chặn ở code (mọi luật đổi món đúng, anchor chỉ đổi thứ
tự). Verdict FAIL vì ba lỗi chặn: test "thực đơn chay chỉ đổi sang món chay" chập chờn khoảng 40%,
tải trang 30 ngày chậm hơn trunk 29,7% (180 nút, HTML 109 → 282 KB, DOM 1216 → 2480), và sửa
`site-header.tsx` làm tên tài khoản tràn ngang ở ≥640px. Vòng sửa: gốc của test chập chờn là UUID
món sinh ngẫu nhiên mỗi lần seed (không phải `userId`), test tự dựng thực đơn chay 1 ngày, 20/20
xanh; nút dùng class `.meal-swap` chung và icon mask CSS; header bọc `sr-only sm:not-sr-only` ngoài
và `truncate` trong, có e2e riêng ở 390/640/768/1280; anchor qua `sessionStorage`; xác nhận nhìn
thấy được; ghi chú chế độ ăn rút gọn; đọc plan trong transaction; guard `pending` dùng ref.
Verifier ở head mới: gates xanh (459 unit, 324 key, e2e 25/25 hai lần), live 35/36 (lần trượt là
lỗi script kiểm), ảnh và video 34,9 s quay lại; perf với `pnpm start` +8,4%, +10,6%, +9,4% (một
lượt vượt luật). Operator duyệt T30 ngày 2026-11-04 và không đồng ý đặt `NODE_ENV=production`, nên
luật perf phải đạt với `pnpm start` như hiện tại. Vòng perf thứ hai: đo lại trên bản sao đóng băng
được +10,0%, +10,2%, +10,9%; profile cho thấy thân nút đổi món chỉ 2,8% CPU SSR. Ngày đóng trong
accordion mobile không render danh sách món nữa (SSR 90 nút thay vì 180): tải trang +0,0%, +1,9%,
+0,8%, TTFB nhanh hơn trunk 4–8%, HTML 102,9 KB (trunk 108,4 KB), DOM 920 (trunk 1216), đổi món
113 ms. Giao diện không đổi so với bản đã duyệt. Một verifier độc lập ở head sau vòng perf đang
chạy khi ghi mục này.

**Theo dõi (chưa sửa):**

- `pnpm start` (`scripts/serve-build.mjs`) và Dockerfile không đặt `NODE_ENV=production`, nên SSR
  chạy React bản development ở cả trunk lẫn head; đặt biến này SSR nhanh khoảng 2 lần. Operator
  không đồng ý đổi trong T30
- `formatVnd` và `formatDate` dựng `Intl.NumberFormat`/`Intl.DateTimeFormat` mới mỗi lần gọi,
  khoảng 25% CPU SSR của trang chi tiết (có cả ở trunk); chưa cache vì vòng perf đã đạt luật
- Toast che một phần nav (toàn app, đã ghi từ T27)
- `diet_tags = '[]'` không phân biệt thực đơn cũ (tạo trước T30) với thực đơn không chọn chế độ ăn
- Dấu hiệu ô vừa đổi còn mờ
- Nhãn "Tổng chi" phía trên thẻ ngân sách còn lại có thể bị đọc là đã trả (ghi từ T29)
- Chưa có filter "Món chán" trên `/dishes` để xem lại món đã chán (ghi từ T27, T28)
- Tìm trong trang trên mobile không thấy món của ngày đang đóng trong accordion
- `happy-path.spec.ts` fail một lần ở lượt e2e đầu của vòng sửa (ô email báo không hợp lệ ngay sau
  khi chuyển từ login sang register), xanh khi chạy lại; T30 không sửa file này

**Verify:** RED→GREEN theo TDD · `pnpm test` **459 test** · `i18n:check` 324 key ·
`pnpm test:e2e` **26/26** · `pnpm verify:planner` OK P1–P6 (463.680 lần chạy, 452.426 lần đổi;
phá thử bỏ trần ngày → 41.486 vi phạm P6, chỉ chặn hôm trước → 81.282) · checkpoint-f và
checkpoint-a11y 0 lỗi · perf `scratchpad/t30/W/bench-after{1,2,3}.json`, `W/swap-after.json` · ảnh
và video `docs/screenshots/p8/T30-review-{lunch,cycle,none,mobile}.png`,
`docs/screenshots/p8/T30-review.webm`
**Files:** `packages/db/src/{schema,plans,plans.test,client,index,preferences,queries}.ts`,
`packages/db/migrations/0003_classy_lockheed.sql`, `packages/db/migrations/meta/0003_snapshot.json`,
`packages/db/migrations/meta/_journal.json`,
`packages/domain/src/{plan-swap,plan-swap.test,index}.ts`,
`apps/web/src/server/{plan.service,plan.service.test,plan.functions}.ts`,
`apps/web/src/lib/{plan-input,plan-input.test,plan-types,swap-anchor,swap-anchor.test}.ts`,
`apps/web/src/components/plans/meal-swap.tsx`, `apps/web/src/routes/plans/$planId.tsx`,
`apps/web/src/components/site-header.tsx`, `apps/web/src/styles/globals.css`,
`apps/web/e2e/{plan-swap,site-header}.spec.ts`, `packages/i18n/src/{vi,en}.ts`,
`scripts/verify-planner.ts`, `.claude/skills/verify-planner/SKILL.md`,
`docs/adr/0017-doi-mon-va-diet-tags.md`, `docs/spec.md`, `docs/plans/p8-tinh-nang-moi.md`,
`CLAUDE.md`, `AGENTS.md`, `README.md`
**Deps:** T28, T29 · **Size:** M

### Sửa bất biến #3 — ✅ Ba bữa không trùng món ở `/recommend` và chat

**Bối cảnh:** Swarm T28 ghi nhận trên trunk: khách 45.000 ₫/ngày nhận Chả giò cả bữa trưa lẫn bữa
tối, do nhánh `fresh.length > 0 ? fresh : found` trong `recommend.service.ts` dùng lại món cũ khi
hết món mới. Chat cả ngày (`buildSections` trong `packages/ai/src/mock.ts`) lặp món giống vậy.
Operator duyệt sửa ngày 2026-11-04, không chọn cách; áp mặc định "để trống bữa và báo thiếu món",
vì nới trần bữa sẽ vi phạm trần bữa của bất biến #2.

**Acceptance:**

- [x] `/recommend`: món đã chọn ở bữa trước vào `excludeDishIds` cùng món chán, trước khi cắt
      `limit`; bữa hết món mới vừa trần vào `missingMeals` và không gọi advisor (không tốn lượt
      Gemini)
- [x] Chat mock: `buildSections` loại món bữa trước đã chọn khỏi ứng viên bữa sau; bữa trống in câu
      `noDishForMeal` riêng trong `CHAT_COPY` vi/en của `mock.ts` (không thêm key i18n)
- [x] Prompt chat Gemini có dòng cấm gợi ý một món cho hai bữa trong ngày và bảo báo bữa không có
      món thay vì lặp
- [x] Món thích, loại món chán và trần ngân sách giữ nguyên

**Kết quả:** Quét khách 30k–80k ở `/recommend`: trùng món 14/51 → 0/51, bữa thiếu 10 → 24, không
lượt nào vượt ngân sách. Quét chat khách 30k–80k: trùng món 2/11 (45k, 50k) → 0/11, không lượt nào
vượt ngân sách. 3 test mới cho `/recommend` và 5 test mới cho chat (4 mock, 1 prompt), đều đỏ trước
khi sửa. Checkpoint chat 25/25. Kiểm độc lập gộp vào swarm T30 (worker D): `/recommend` và chat giữ
bất biến #3.

**Theo dõi (chưa sửa):**

- Chat Gemini là văn bản tự do, nên phần chữ vẫn có thể nhắc một món cho hai bữa; thẻ món đã khử
  trùng

**Verify:** RED→GREEN theo TDD · gate 452 unit lúc sửa chat xong (domain 57, ai 61, db 62, i18n 12,
web 260), e2e 21/21, checkpoint chat 25/25 · quét `scratchpad/scan-before.log`,
`scratchpad/scan-after.log`, ảnh `inv3-shots/before-45k.png`, `after-45k.png`
**Files:** `apps/web/src/server/{recommend.service,recommend.service.test}.ts`,
`packages/ai/src/{mock,mock-chat.test,gemini,gemini.test}.ts`, `docs/spec.md` §7, `CLAUDE.md`,
`AGENTS.md`
**Deps:** T28 · **Size:** S

## Light theme refresh — 2026-11-07

**Phạm vi:** trình bày light mode, không đổi logic hay thêm dependency.

**Acceptance:**

- [x] Palette kem/nâu/terracotta, card trắng ấm, viền và ô nhập phân biệt rõ.
- [x] Hero trang chủ mới, danh sách vai trò dễ quét, ba thẻ giá trị đánh số.
- [x] Kiểm trực quan desktop 1440px, mobile 390/320px không tràn ngang; copy vi/en giữ nguyên.
- [x] Dark giữ token/bố cục cũ, chuyển theme và reload giữ lựa chọn.
- [x] Gợi ý mock 60.000 ₫ tạo ba bữa tổng 57.000 ₫, còn 3.000 ₫.
- [x] Cổng format → typecheck → lint → unit → build → i18n; checkpoint a11y.
- [x] E2e toàn bộ: 26/26.

**Verify:** 459 unit test (web chạy mới, các package còn lại từ Turbo cache); build thành công;
i18n 324 key; checkpoint a11y 0 vi phạm/0 lỗi, có kiểm bàn phím và reduced motion.
Print giữ nền trắng/chữ đen, không mang gradient light vào bản in. Không thêm test vì chỉ đổi
CSS/class trình bày; dùng browser smoke và suite hiện có.
E2e có cảnh báo hydration ở test chủ động mở accordion trước hydrate; 26/26 vẫn pass.
Không thay đổi logic accordion trong đợt refresh này.

**Files:** `apps/web/src/styles/globals.css`, `apps/web/src/routes/index.tsx`,
`docs/spec.md`, `tasks/plan.md`, `tasks/todo.md`.

## Design refinement — 2026-11-07

**Phạm vi:** trình bày và copy tham khảo ngân sách; không đổi logic nghiệp vụ, không thêm dependency.
Thay thế cách trình bày của đợt light refresh phía trên; giữ lịch sử kết quả cũ.

**Acceptance:**

- [x] Bỏ gradient, hero đóng khung, badge và số thứ tự giá trị; thay thẻ giá trị bằng đoạn văn.
- [x] Vai trò/ngân sách dùng danh sách có nghĩa, giá căn phải; tiêu đề vi/en không giả làm nút chọn.
- [x] Form gợi ý chung một bề mặt, lựa chọn chưa bật không tô nền; giữ rõ selected/focus/loading.
- [x] Header nền đặc, CTA phụ giảm trọng lượng; sheet inset 16px, animation 150ms, nút đóng 44px.
- [x] Light/dark và vi/en đã xem trực tiếp; home/recommend/dishes/login ở 320/390/768/1440px
      không tràn ngang.
- [x] Gợi ý mock dev và production: ba bữa tổng 57.000 ₫ trên 60.000 ₫, còn 3.000 ₫.
- [x] Cổng format → typecheck → lint → 459 unit → build → i18n 323 key đều đạt.
- [x] Checkpoint a11y: 0 lỗi/vi phạm; bàn phím và reduced motion đạt.
- [x] Checkpoint perf production Slow 4G/CPU ×4: home LCP 1896ms/CLS 0.0074,
      recommend LCP 2128ms/CLS 0.0002; trung vị ba lượt, không có origin bên thứ ba.
- [x] E2e toàn bộ: 26/26.

**Verify:** browser smoke trực tiếp trên server mock và bản build; production không có runtime error.
Chỉ đổi CSS/markup/copy, không đổi trạng thái hay contract nghiệp vụ. Bỏ key eyebrow chết
ở cả hai dictionary (324 → 323 key).
Lượt e2e đầu: 22/26 đạt; bốn failure đều từ giả định chiều cao header/nút ≤40px, không phải
tràn hay xuống dòng. Bỏ các assertion pixel cố định (không đổi sang ngưỡng 44px); kiểm vị trí
dòng chữ thực tế, overflow, overlap và accessible name thay thế/giữ nguyên theo hành vi.
Lượt e2e đầy đủ sau cập nhật: **26/26 đạt**. Có log hydration mismatch ở bộ lọc `/dishes`
và accordion mở trước hydrate; không khẳng định bộ e2e không có lỗi console. Hai luồng vẫn
đạt test; không đổi logic lọc/accordion trong phạm vi thiết kế này.

**Files:** `apps/web/src/styles/globals.css`, `apps/web/src/routes/index.tsx`,
`apps/web/src/components/site-header.tsx`, `apps/web/src/components/recommend/recommend-form.tsx`,
`apps/web/src/components/ui/{button,sheet}.tsx`, `packages/i18n/src/{vi,en}.ts`,
`apps/web/e2e/{dishes,site-header}.spec.ts`, `docs/spec.md`, `tasks/plan.md`, `tasks/todo.md`.

## Ghi chú thực thi

- T9 vượt ngưỡng M (5+ file) nên đã tách **T9a** (form/state) và **T9b** (kết quả/budget bar).
- Không task nào chạm >5 file ở phần logic; T19/T20 chạm nhiều file nhưng là rà soát, không phải feature.
- Task P2 (không làm trong plan này): tool-calling cho chat, so sánh nhiều model. `/dishes` browse
  đã làm ở T25.
