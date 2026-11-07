# Spec: Măm — Gợi ý bữa ăn theo vai trò & ngân sách

**Status:** Accepted — S1–S10 pass Checkpoint G; S11–S12 thêm cho P8 (2026-11-04, cả hai pass)
**Date:** 2026-10-29 (cập nhật lần cuối: 2026-11-07)
**Intent:** `docs/intent/meal-recommendation.md`

---

## 0. Capability Map

Dự án gồm nhiều capability kiểm thử độc lập được. Ranh giới và thứ tự build chốt ở đây;
spec chi tiết từng module nằm trong chính file này theo mục lục module (một file để tránh
phân mảnh tài liệu cho dự án một người, nhưng id module là nguồn tham chiếu ổn định).

| Module id   | Trách nhiệm                                                                   | Phụ thuộc                       |
| ----------- | ----------------------------------------------------------------------------- | ------------------------------- |
| `shell`     | Layout, i18n vi/en, theme light/dark, design tokens, a11y primitives          | —                               |
| `catalog`   | Seed ~100 món Việt + roles, truy vấn/lọc món, trang duyệt `/dishes`           | —                               |
| `budget`    | Toán VND: chuẩn hoá đơn vị bữa/ngày/tháng, phân bổ 3 bữa, kiểm tra không vượt | —                               |
| `ai`        | Adapter Gemini + mock, prompt, structured output, guards chống bịa giá        | `catalog` (contract only)       |
| `recommend` | Chọn ứng viên từ DB, xếp hạng, gọi AI, fallback deterministic                 | `catalog`, `budget`, `ai`       |
| `identity`  | Đăng ký/đăng nhập/đăng xuất, session SQLite, rate limit                       | —                               |
| `plans`     | Sinh thực đơn 7/30 ngày trong budget, lưu, xuất markdown/CSV/.xlsx            | `catalog`, `budget`, `identity` |
| `history`   | Lưu & xem lại lượt gợi ý, thread chat của user                                | `identity`, `recommend`         |

**Thứ tự build:** `shell`+`catalog`+`budget` → `recommend` (slice dọc đầu tiên: form → kết quả)
→ `ai`+chat → `identity` → `plans` → `history` → polish.

Hướng phụ thuộc một chiều, không cycle. `ai` chỉ biết contract `DishCandidate` (do `catalog`
định nghĩa trong `packages/domain`), không import DB.

---

## 1. Objective

Người Việt mở web, chọn vai trò ("sinh viên", "nhân viên văn phòng", "freelancer dev", hoặc tự
nhập), nhập ngân sách theo bữa/ngày/tháng, và nhận gợi ý sáng–trưa–tối **có giá thật, không
vượt ngân sách**. Hai đường vào: form UI (nhanh, không cần AI) và chat AI (tư vấn, giải thích).
User đăng ký lưu được lịch sử và tạo thực đơn cả tuần/tháng trong cùng ngân sách.

### User stories

1. **Khách** vào `/`, thấy form 3 bước (vai trò → ngân sách → sở thích), nhận 3 bữa kèm giá và
   tổng tiền, biết ngay còn dư/thiếu bao nhiêu.
2. **Khách** mở `/chat`, gõ "trưa nay 50k, ăn chay, ở quận 3", nhận câu trả lời streaming kèm
   card món ăn lấy từ DB.
3. **Khách** tạo thực đơn 7 ngày, xem trước, rồi bị yêu cầu đăng ký để lưu.
4. **User** đăng ký, xem lịch sử gợi ý chia trang (10 lượt/trang, mới nhất trước), mở lại bất kỳ lượt nào.
5. **User** tạo thực đơn 30 ngày với 2.5tr, thấy tổng chi ≤ 2.5tr, xuất markdown, CSV hoặc .xlsx
   để đi chợ.
6. **User** đổi ngôn ngữ EN và dark mode; mọi thứ được lưu vào profile.
7. **User** sửa hồ sơ: ngân sách mặc định, chế độ ăn (chay / không cay / dị ứng), vai trò mặc định.
8. **Khách** mở `/dishes`, tìm món không cần gõ dấu (`com tam` ra Cơm tấm), lọc theo bữa, tag và
   khoảng giá; filter nằm trên URL nên reload và back giữ nguyên.
9. **User** bấm thích hoặc chán từng món trên `/dishes`, reload vẫn giữ, và bật "Chỉ món thích"
   (`?liked=true`) để chỉ xem món đã thích. **Khách** bấm thì được mời đăng nhập, không lưu gì cả,
   kể cả `localStorage` (ADR-015).
10. **User** đã chán một món thì không còn thấy nó trong gợi ý, chat hay thực đơn tạo mới; món đã
    thích và vừa ngân sách được ưu tiên trong gợi ý và chat (ADR-016).
11. **User** mở thực đơn đã lưu, bấm vào một món để đổi sang món khác cùng bữa có giá gần nhất; bấm
    tiếp thì sang món kế tiếp rồi quay về món gốc. Món mới vẫn khớp chế độ ăn của thực đơn, không
    phải món chán, không lặp với hôm trước và hôm sau, và tổng ngày không vượt ngân sách (ADR-017).

### Success = đo được

| #   | Điều kiện                                                                                            | Cách đo                        |
| --- | ---------------------------------------------------------------------------------------------------- | ------------------------------ |
| S1  | `pnpm install && pnpm dev` chạy được, trang chủ load < 2s local                                      | thủ công                       |
| S2  | Không có `GEMINI_API_KEY` vẫn ra gợi ý đúng (mock mode)                                              | `pnpm test` + thủ công         |
| S3  | Mọi gợi ý có giá lấy từ DB; tổng ≤ ngân sách; ưu tiên món sát trần từng bữa (không bỏ phí ngân sách) | unit test `recommend`/`budget` |
| S4  | Tổng thực đơn 7/30 ngày ≤ ngân sách, không lặp món trong 2 ngày liền                                 | unit test `plans`              |
| S5  | Đăng ký → đăng nhập → reload vẫn còn session; logout xoá session                                     | integration test               |
| S6  | History hiển thị đúng lượt của user, không lộ của user khác                                          | integration test               |
| S7  | Không còn chuỗi tiếng Việt hard-code trong component; `pnpm i18n:check` pass                         | script                         |
| S8  | Dark mode không FOUC, lưu qua reload                                                                 | thủ công + e2e                 |
| S9  | 0 vi phạm axe-core (WCAG 2.0/2.1 A+AA, 2.2 AA) ở mọi trang; mobile 390px không scroll ngang          | `scripts/checkpoint-a11y.mjs`  |
| S10 | Chat stream chữ về theo từng chunk, không block UI                                                   | thủ công                       |
| S11 | Thẻ ngân sách còn lại khớp tính tay trên `dailyBudgetVnd × days` và ngày trước hôm nay (giờ VN)      | unit + e2e `remaining-budget`  |
| S12 | Đổi món giữ đúng bữa, chế độ ăn, không món chán, không lặp hôm trước/hôm sau, tổng ngày ≤ ngân sách  | unit + P6 `verify:planner`     |

---

## 2. Tech Stack

Phiên bản xác minh ngày 2026-10-29 qua npm registry.

| Layer         | Chọn                                                     | Version                                   | Ghi chú                                                                                               |
| ------------- | -------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Monorepo      | Turborepo + pnpm workspaces                              | `turbo ^2.11`                             | `pnpm@10`                                                                                             |
| Language      | TypeScript                                               | `6.0.3`                                   | `strict`, `noUncheckedIndexedAccess`. Hạ từ 7.0 vì `typescript-eslint` chưa hỗ trợ TS 7 (xem ADR-006) |
| Framework     | TanStack Start (React 19)                                | `@tanstack/react-start ^1.169`            | Vite 8, SSR, server functions                                                                         |
| Router        | TanStack Router                                          | `^1.170`                                  | file-based, type-safe                                                                                 |
| Data fetching | TanStack Query                                           | `^5.105`                                  | dùng cho client state của chat/history                                                                |
| Styling       | Tailwind CSS                                             | `^4.3`                                    | CSS-first config, OKLCH tokens                                                                        |
| UI            | shadcn/ui + Radix + lucide-react                         | CLI `shadcn@latest`                       | copy-in components, không runtime dep                                                                 |
| DB            | SQLite + Drizzle ORM                                     | `better-sqlite3 ^13`, `drizzle-orm ^0.45` | file `data/mam.db`                                                                                    |
| AI            | `fetch` + SSE thuần (ADR-008) → Google Gemini            | không dependency                          | Endpoint tương thích OpenAI của Google (ADR-014); mock provider tự viết                               |
| Validation    | Zod                                                      | `^4.6`                                    | dùng chung client/server                                                                              |
| Forms         | State thường + Zod                                       | —                                         | 3 form nhỏ, không cần thư viện form; validate bằng cùng schema với server fn (xem ADR-007)            |
| i18n          | Dictionary có type, tự viết                              | —                                         | ADR-003                                                                                               |
| Theme         | `next-themes` hoặc script inline                         | `^0.4`                                    | ADR-004                                                                                               |
| Xuất .xlsx    | `write-excel-file` (MIT, 1 dependency con `fflate`)      | `4.1.1`                                   | `import('write-excel-file/browser')` khi bấm, chunk lười 19,69KB gzip (T26)                           |
| Test          | Vitest + Playwright                                      | `^5.0`, `^1.64`                           | unit + 1 e2e happy path                                                                               |
| Lint/format   | ESLint 9 flat + Prettier + `prettier-plugin-tailwindcss` | —                                         |                                                                                                       |

### ADR tóm tắt

- **ADR-001 — AI không bịa giá.** Hai chế độ: `curated` (mặc định: server lấy ≤20 ứng viên từ DB,
  AI chỉ _chọn và giải thích_, giá lấy từ DB) và `free` (AI được đề xuất món ngoài DB, giá gắn nhãn
  "ước tính" và `source: 'ai'`). Mặc định `curated` để đảm bảo S3.
- **ADR-002 — Budget chuẩn hoá về `dailyBudgetVnd`.** Mọi đơn vị input được quy về ngân sách/ngày
  - phân bổ bữa (mặc định 25% sáng / 40% trưa / 35% tối). Nhờ vậy planner tuần/tháng chỉ cần một
    phép nhân, và mọi so sánh budget dùng một đơn vị duy nhất.
- **ADR-003 — i18n bằng dictionary có type, không dùng thư viện.** Chỉ 2 locale, ~250 chuỗi, cần
  type-safety và không muốn coupling build-time với framework. `t('recommend.submit')` trả union
  literal; thiếu key = lỗi compile. Locale lưu cookie `mam_locale`, đồng bộ vào profile khi đăng nhập.
  _(Nếu sau này cần >3 locale hoặc dịch bởi người ngoài → chuyển sang Paraglide.)_
- **ADR-004 — Locale & theme qua cookie, không prefix URL.** Đơn giản hơn, không đổi route structure;
  đánh đổi: không share link giữ ngôn ngữ. Chấp nhận cho phạm vi hiện tại.
- **ADR-005 — Session tự quản.** Bảng `sessions`, token 32 byte random, lưu SHA-256, cookie HttpOnly
  SameSite=Lax, hạn 30 ngày, rotate khi login. Password hash bằng `scrypt` (`node:crypto`) — tránh
  native dep thêm ngoài `better-sqlite3`. Chi tiết tham số hash, dummy hash chống dò user, khoá
  rate limit: [ADR-010](adr/0010-auth-session.md).

### Biến môi trường

```bash
DATABASE_PATH=./data/mam.db          # mặc định, đã có trong .env.example
MAM_LOCALE=vi                        # locale mặc định
NODE_ENV=production                  # bật Secure cho cookie session
AI_PROVIDER=gemini|mock              # mặc định mock để demo không cần key
GEMINI_API_KEY=                      # bắt buộc khi AI_PROVIDER=gemini
GEMINI_MODEL=                        # tuỳ chọn, mặc định gemini-3.5-flash (ADR-014)
```

Khởi động mà `AI_PROVIDER=gemini` nhưng thiếu key → **fail fast** với message rõ ràng,
không silently fallback (tránh user tưởng AI chạy).

---

## 3. Commands

```bash
pnpm install                      # cài toàn bộ workspace
pnpm dev                          # turbo: web ở http://localhost:3000
pnpm build                        # build tất cả package + app
pnpm typecheck                    # tsc --noEmit toàn workspace
pnpm lint                         # eslint
pnpm format                       # prettier --write
pnpm test                         # vitest run (unit + integration, test cạnh source)
pnpm test:watch                   # vitest watch
pnpm test:e2e                     # playwright test (tự dựng server mock + DB riêng ở cổng 4310)
pnpm start                        # chạy apps/web/dist bằng Node (sau pnpm build)
pnpm db:generate                  # drizzle-kit generate
pnpm db:migrate                   # áp migration vào DATABASE_PATH
pnpm db:seed                      # seed roles + ~100 món (idempotent, upsert theo slug)
pnpm db:bootstrap                 # migrate + seed, dùng cho Docker/e2e (idempotent)
pnpm db:reset                     # xoá db + migrate + seed (chỉ dev)
pnpm db:studio                    # drizzle-kit studio
pnpm i18n:check                   # phát hiện chuỗi vi hard-code + key thiếu giữa 2 locale
```

Seed idempotent: chạy lại không nhân đôi dữ liệu; `slug` là unique key.

---

## 4. Project Structure

```
.
├── apps/
│   └── web/                          # TanStack Start app
│       ├── src/
│       │   ├── routes/
│       │   │   ├── __root.tsx
│       │   │   ├── index.tsx             # landing + quick form
│       │   │   ├── recommend.tsx         # form UI 3 bước
│       │   │   ├── chat.tsx              # AI chat
│       │   │   ├── plans/index.tsx       # danh sách thực đơn (auth)
│       │   │   ├── plans/$planId.tsx     # chi tiết thực đơn (auth)
│       │   │   ├── history.tsx           # lịch sử (auth)
│       │   │   ├── dishes.tsx            # duyệt 100 món, filter trên URL (?q=&meal=&tag=&min=&max=&liked=true)
│       │   │   ├── login.tsx  register.tsx
│       │   │   ├── settings.tsx          # profile + preferences (auth)
│       │   │   └── api/chat.ts           # streaming endpoint cho chat
│       │   ├── components/               # feature components theo module
│       │   ├── server/                   # server functions (.functions.ts)
│       │   ├── styles/globals.css        # tokens + tailwind
│       │   ├── start.ts  server.ts  router.tsx
│       ├── e2e/                          # playwright: happy path + axe-core
│       └── playwright.config.ts          # server mock, DB .e2e/mam.db
├── packages/
│   ├── db/          # schema, migrations, seed, client
│   ├── domain/      # ZOD contracts, budget math, planner (pure, no IO)
│   ├── ai/          # provider adapter, prompts, schemas
│   ├── i18n/        # dictionaries vi/en + type-safe t()
│   └── ui/          # shadcn components, tokens, primitives
├── data/            # mam.db (gitignored)
├── docs/            # intent, spec, ADR, design notes
├── tasks/           # plan.md, todo.md
└── turbo.json, pnpm-workspace.yaml, tsconfig.base.json
```

**Quy tắc ranh giới:** `packages/domain` không import DB/React/Node. `packages/ai` không import DB.
`packages/db` không import React. Server functions là nơi duy nhất nối DB ↔ domain ↔ ai.

---

## 5. Data Model (SQLite)

```
users(id TEXT PK, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      display_name TEXT, locale TEXT DEFAULT 'vi', role_slug TEXT,
      daily_budget_vnd INTEGER, diet_tags TEXT, created_at INTEGER)

sessions(id TEXT PK, user_id TEXT NOT NULL REFERENCES users, token_hash TEXT UNIQUE,
         expires_at INTEGER, created_at INTEGER)

roles(slug TEXT PK, name_vi, name_en, desc_vi, desc_en,
      default_daily_budget_vnd INTEGER, tags TEXT, icon TEXT, sort_order INTEGER)

dishes(id TEXT PK, slug TEXT UNIQUE, name_vi, name_en,
       price_vnd INTEGER NOT NULL, price_min_vnd INTEGER, price_max_vnd INTEGER,
       meal_types TEXT NOT NULL,          -- json: ["breakfast","lunch","dinner"]
       tags TEXT,                         -- json: ["vegetarian","quick","high_protein","spicy"]
       region TEXT,                       -- bac|trung|nam|any
       prep_minutes INTEGER, fill_level INTEGER,  -- 1..3 độ no
       desc_vi, desc_en, is_seed INTEGER DEFAULT 1)

recommendations(id TEXT PK, batch_id TEXT NULL, user_id TEXT NULL, role_slug TEXT,
                budget_unit TEXT, budget_amount INTEGER, daily_budget_vnd INTEGER,
                meal_type TEXT, dish_ids TEXT, total_vnd INTEGER,
                rationale_vi TEXT, rationale_en TEXT,
                source TEXT,        -- curated|ai|mock|fallback
                model TEXT, created_at INTEGER)

plans(id TEXT PK, user_id TEXT NOT NULL, title TEXT, start_date TEXT,
      days INTEGER, budget_unit TEXT, budget_amount INTEGER, daily_budget_vnd INTEGER,
      role_slug TEXT, diet_tags TEXT NOT NULL DEFAULT '[]',  -- json, sắp xếp khi tạo (ADR-017)
      created_at INTEGER)

plan_items(id TEXT PK, plan_id TEXT REFERENCES plans ON DELETE CASCADE,
           day_index INTEGER, meal_type TEXT, dish_id TEXT, price_vnd INTEGER)

dish_preferences(user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE,
                 dish_id TEXT NOT NULL REFERENCES dishes ON DELETE CASCADE,
                 kind TEXT NOT NULL CHECK (kind IN ('like','dislike')),
                 created_at INTEGER NOT NULL,   -- giờ chọn kind hiện tại
                 PRIMARY KEY (user_id, dish_id))  -- một trạng thái mỗi món (ADR-015)

chat_threads(id TEXT PK, user_id TEXT NULL, title TEXT, locale TEXT, created_at INTEGER)
chat_messages(id TEXT PK, thread_id TEXT REFERENCES chat_threads ON DELETE CASCADE,
              role TEXT, content TEXT, dish_ids TEXT, created_at INTEGER)
```

Index: `recommendations(user_id, created_at desc)`, `recommendations(batch_id)`,
`plan_items(plan_id, day_index)`, `sessions(token_hash)`, `dishes(price_vnd)`,
`chat_messages(thread_id, created_at)`.

**Anonymous không ghi DB.** `recommendations`/`chat_threads` với `user_id NULL` chỉ tồn tại khi
sau này cần analytics — MVP không ghi. Khách dùng được mọi tính năng nhưng không có lịch sử gợi ý
(`/history` yêu cầu đăng nhập); chat của khách nằm ở `localStorage` (key `mam_chat_history_v1`).
Điều này giữ đúng "Out of scope" về privacy và tránh phải dọn rác. Món thích và món chán của
khách cũng không lưu ở đâu: `dish_preferences` chỉ có hàng của user đăng nhập.

### 5.1 Một "lượt" gợi ý = một `batch_id`

Mỗi request `recommendMeals` của user đăng nhập ghi 1–3 row `recommendations` (mỗi bữa tìm được
món là một row) dùng chung `batch_id` (UUID) và `created_at`. Nhờ vậy:

- `total_vnd` của row là giá **riêng bữa đó**; tổng lượt = `sum(total_vnd)` trong batch. Không có
  cột tổng riêng để khỏi lệch khi một bữa thiếu món.
- `dish_ids` của row là mảng một phần tử — giữ nguyên cột cũ để không phá dữ liệu/analytics.
- Lịch sử nhóm theo `batch_id`, nên xoá một lượt = xoá cả batch; `NULL` (row cũ trước migration)
  không hiện trong lịch sử.

---

## 6. API Surface (server functions + 1 route)

| Endpoint                        | Method | Auth             | Input → Output                                                                                                               |
| ------------------------------- | ------ | ---------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `recommendMeals`                | fn     | optional         | `{roleSlug, budget:{unit,amount}, mealType, dietTags[], mode}` → `{meals: MealSuggestion[], totalVnd, remainingVnd, source}` |
| `createPlan`                    | fn     | required         | `{days:7\|30, budget, roleSlug, startDate, dietTags[], title}` → `{ok:true, planId, totalVnd}` \| `{ok:false, error}`        |
| `listPlans` / `getPlan`         | fn     | required         | — → plan summaries (tổng tiền + số món tính bằng SQL) / `{plan, items}` hoặc `null`                                          |
| `deletePlan`                    | fn     | required         | `{planId}` → `{ok}` (chỉ chủ sở hữu; plan người khác coi như không tồn tại)                                                  |
| `swapPlanMeal`                  | fn     | required         | POST `{planId, dayIndex, mealType, anchorDishId?}` → `{ok:true, dishId, nameVi, nameEn, priceVnd}` \| `{ok:false, error}`    |
| `listHistory`                   | fn     | required         | `{page?, mealType?}` → `{items[], page, pageCount, total}` (10 lượt/trang, mới nhất trước, trang kẹp vào `[1, pageCount]`)   |
| `listDishes`                    | fn     | —                | — → `DishCard[]` (đủ 100 món, sắp theo `slug`; lọc ở client bằng `filterDishes`)                                             |
| `listMyPreferences`             | fn     | optional         | — → `{liked: string[], disliked: string[]}` của user, khách → `null` (ADR-015)                                               |
| `setPreference`                 | fn     | required         | POST `{dishId, kind: 'like'\|'dislike'\|null}` → `{ok:true}` \| `{ok:false, error:'unauthorized'\|'dish_not_found'}`         |
| `deleteHistory`                 | fn     | required         | `{batchId}` → `{ok}` (chỉ chủ sở hữu; batch người khác coi như không tồn tại)                                                |
| `register` / `login` / `logout` | fn     | — / — / required | email+password → session cookie; register tạo session luôn                                                                   |
| `fetchSessionUser`              | fn     | optional         | — → `PublicUser \| null` (không có `passwordHash`)                                                                           |
| `updateProfile`                 | fn     | required         | locale, role, budget, dietTags                                                                                               |
| `listChatThreads`               | fn     | required         | — → 20 thread gần nhất (title, updatedAt, messageCount); khách → `[]`                                                        |
| `getChatThread`                 | fn     | required         | `{threadId}` → `{thread, messages[]}` hoặc `null` (chỉ chủ sở hữu)                                                           |
| `deleteChatThread`              | fn     | required         | `{threadId}` → `{ok}` (xoá cascade tin nhắn)                                                                                 |
| `POST /api/chat`                | route  | optional         | `{messages, context, locale, threadId?}` → NDJSON stream: `thread` / `text` / `dish` / `meta` / `done`                       |

Mọi input validate bằng Zod ở **server**, không tin client. Mọi output có kiểu suy ra từ Zod
(`z.infer`) và dùng chung trong `packages/domain`.

**Rate limit** (in-memory, per IP + per user): anonymous 20 lượt AI/24h, registered 200/24h
(quota đăng nhập khoá theo `user:<id>`, khách theo IP). Vượt → 429 kèm header `Retry-After`,
`retryAfter` và message i18n. Login 10 lần/15 phút theo `ip:email`; register 5 lần/giờ theo IP.
Ghi chú: in-memory nghĩa là reset khi restart và không scale ngang — chấp nhận cho single-node
(ADR-008).

### 6.1 Auth & session

- **Mật khẩu:** `scrypt` (`node:crypto`) với N=16384, r=8, p=1, keylen 64, salt 16 byte; lưu
  `scrypt$N$r$p$salt$hash` (base64url) để tăng cost sau này mà không phải migrate. So sánh
  `timingSafeEqual`; hash hỏng/sai định dạng trả `false` chứ không ném lỗi.
- **Không lộ user tồn tại:** login với email lạ vẫn chạy scrypt trên một `DUMMY_HASH` cố định rồi
  trả cùng `invalid_credentials` như sai mật khẩu. Register trùng email trả `email_taken`
  (chấp nhận lộ vì đây là luồng tạo tài khoản); UNIQUE của DB là chốt cuối cho race.
- **Session:** token 32 byte random (`base64url`) chỉ nằm trong cookie; DB lưu SHA-256 hex, hạn 30
  ngày, dọn row hết hạn mỗi lần đọc. Login xoá hết session cũ của user (rotate) rồi tạo token mới.
  Logout xoá row + cookie; token cũ dùng lại trả 401/`null`.
- **Cookie:** `mam_session`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age=30 ngày`;
  `Secure` chỉ bật khi `NODE_ENV=production`.
- **Guard:** `beforeLoad` của `/plans`, `/history`, `/settings` gọi `fetchSessionUser`, chưa đăng
  nhập thì redirect `/login?redirect=<path>`; `safeRedirect` chỉ nhận path nội bộ (chặn open
  redirect và vòng lặp `/login`). Đăng nhập/đăng ký xong quay lại đúng `redirect`.
- **Locale:** profile lưu `locale`; `updateProfile` set luôn cookie `mam_locale` nên đổi ngôn ngữ
  trong Settings có hiệu lực ngay, không cần reload.

### 6.2 Plans & planner contract

`buildPlan({days, dailyBudgetVnd, roleSlug, dietTags, dishes, seed})` trong
`packages/domain/src/planner.ts` là hàm thuần, không đọc DB, không tự nghĩ ra giá:

- `days` 1..31 (UI chỉ chào 7/30), `dailyBudgetVnd` nguyên dương; input sai ném `RangeError`.
- Mỗi ngày đúng 3 bữa `breakfast → lunch → dinner`, mỗi món phục vụ đúng bữa đó.
- Trần ngân sách từng ngày được giữ bằng "reserve": một món chỉ là ứng viên cho bữa hiện tại nếu
  giá của nó + chi phí nhỏ nhất cho các bữa sau (trừ món đã dùng hôm nay/hôm qua **và chính món
  đó**) ≤ phần ngân sách còn lại — nên không bữa nào "ăn" mất món duy nhất mà bữa sau cần.
- Không món nào lặp lại trong cửa sổ 2 ngày (hôm nay + hôm qua). Ít nhất một món chay mỗi khối
  7 ngày khi dữ liệu còn món chay và ngân sách cho phép.
- `seed` cố định → cùng lịch; planner thử 8 biến thể jitter rồi một lượt "rẻ nhất" tất định để
  không có chuyện cùng một mức tiền mà seed này xếp được, seed khác thất bại. Lượt "rẻ nhất" (≥2
  ngày) neo ngày đầu vào bộ món rẻ nhất mà vẫn còn một ngày khác hẳn nó vừa ngân sách: có hai ngày
  như vậy thì xếp được mọi số ngày, nên planner **xếp được bất cứ khi nào có lịch hợp lệ**.
- Không xếp được → `feasible:false`, `days:[]`, `totalVnd:0`, kèm `minimumDailyBudgetVnd` là mức
  ngân sách/ngày nhỏ nhất (làm tròn lên bội 1.000đ) thực sự xếp được đúng `days` ngày — tính chính
  xác (1 ngày: bộ 3 món rẻ nhất; ≥2 ngày: cặp hai ngày khác hẳn nhau), không quét dò; `0` nghĩa là
  thiếu món chứ không phải thiếu tiền. Kiểm chứng vét cạn có chặn: `pnpm verify:planner`. UI dùng con số này để gợi ý tăng ngân sách thay vì báo lỗi chung.
- `createPlanForUser` lấy ứng viên từ DB theo trần `dailyBudgetVnd` (không lọc top theo độ no — món
  rẻ vẫn phải có mặt), rồi suy seed bằng FNV-1a từ `userId|startDate|days|budget|role|dietTags` để
  cùng một request luôn ra cùng thực đơn mà không cần lưu seed.
- Thực đơn tạo mới của user đăng nhập **loại món chán** khỏi ứng viên (`excludeDishIds`, lọc trước
  khi cắt số ứng viên mỗi bữa). Planner không cộng điểm món thích: `planner.ts` không đổi, kiểm
  chứng `pnpm verify:planner` giữ nguyên (ADR-016). Thực đơn đã lưu không bị sửa lại.

UI: `/plans` (tạo + danh sách + xoá 2 bước) và `/plans/$planId` (bảng desktop, accordion
`<details>` trên mobile, xuất markdown copy/tải `.md` có BOM/in, tải CSV (dấu phẩy, ngoặc kép
RFC 4180, BOM, giá là số nguyên, dòng tổng), tải .xlsx (`write-excel-file@4.1.1` chỉ tải lười khi
bấm, giá định dạng `#,##0`, dòng tổng in đậm)). Ba định dạng cùng dựng từ hàm thuần `planRows`.
CTA ở `/recommend` lưu đúng ba bữa vừa xem thành thực đơn 7 ngày với input đã tạo ra kết quả (không
phải state form sửa sau đó).

**Ngân sách còn lại (T29).** Trang chi tiết thực đơn có thẻ "Ngân sách còn lại" do hàm thuần
`remainingBudget({startDate, days, budgetVnd, dayTotals, today})` trong
`packages/domain/src/remaining-budget.ts` tính, trả union theo `kind`:

- `notStarted` khi hôm nay trước ngày bắt đầu; `finished` khi đã qua ngày cuối (tổng theo thực
  đơn trên ngân sách); `inProgress` kèm `spentVnd`, `remainingVnd`, `daysLeft` (kể cả hôm nay),
  `newDailyVnd`, `overspentVnd`.
- Ngân sách gốc `budgetVnd = dailyBudgetVnd × days`, cùng con số với ô "Ngân sách" ở chi tiết, danh
  sách thực đơn và file markdown (quyết định B của operator, 2026-11-04). Vì `dailyBudgetVnd` đã làm
  tròn xuống 1.000đ, thực đơn 30 ngày 2.500.000/tháng có ngân sách gốc 83.000 × 30 = 2.490.000.
- "Chi theo thực đơn đến hôm qua" là tổng `plan_items` của các ngày đứng trước hôm nay, không phải
  số tiền user đã trả. "Hôm nay" là ngày theo `Asia/Ho_Chi_Minh`, server tính rồi truyền vào hàm
  thuần.
- `newDailyVnd` làm tròn xuống bội 1.000đ. Chi vượt thì còn lại và ngân sách mới về 0, phần vượt
  hiện thành cảnh báo kèm gợi ý bước tiếp.
- Nút "Gợi ý theo ngân sách này" dẫn tới `/recommend?unit=day&amount=Z`. `/recommend` đọc `unit`
  và `amount` từ URL qua `budgetSchema`, giá trị rác bị bỏ và form giữ mặc định. Điền sẵn từ URL
  thì có dòng báo nguồn, trang cuộn tới và focus ô số tiền.

**Đổi món (T30, ADR-017).** Mỗi ô món ở trang chi tiết là một nút "Đổi món" có nhãn cho trình đọc
màn hình, ở cả bảng desktop lẫn accordion mobile. Hàm thuần `swapPlanMeal(plan, target, candidates)`
trong `packages/domain/src/plan-swap.ts` trả món thay thế hoặc `null`:

- Ứng viên hợp lệ phục vụ đúng bữa, khớp `plans.diet_tags`, không phải món chán của user, không
  trùng món nào của hôm trước, hôm sau và hai bữa còn lại của hôm nay, và giá cộng hai bữa còn lại
  ≤ `dailyBudgetVnd`. Giá là giá đọc từ bảng `dishes`.
- Vòng xoay: món gốc của ô đứng đầu, sau đó ứng viên theo |giá − giá món gốc| tăng dần, hoà thì theo
  `id`. Mỗi lần bấm lấy món đứng sau món hiện tại, nên bấm liên tiếp đi hết các món gần giá nhất
  rồi quay về món gốc. Client gửi món gốc dưới tên `anchorDishId` và giữ nó trong `sessionStorage`
  theo plan, ngày, bữa (`apps/web/src/lib/swap-anchor.ts`). Server không tin giá trị này: nó chỉ
  đổi thứ tự, tập ứng viên hợp lệ không phụ thuộc vào nó.
- Server function `swapPlanMeal` (POST, Zod) đọc thực đơn, chọn món và ghi trong một transaction
  `immediate`. `updatePlanItem` ghi đúng một hàng, scope theo `user_id` qua subquery trên `plans`.
  Thực đơn của user khác trả `not_found`, khách trả `unauthorized`, hết món thay thế trả
  `no_alternative`; cả ba trường hợp DB không đổi.
- Đổi xong trang nạp lại dữ liệu: tổng ngày, tổng thực đơn, thẻ ngân sách còn lại và file xuất theo
  giá mới. Ô vừa đổi sáng lên 1,5 giây (giảm chuyển động thì nền tĩnh), và một vùng `role="status"`
  đọc kết quả cho trình đọc màn hình.
- `plans.diet_tags` lưu khi tạo (migration `0003`, mảng đã sắp xếp). Thực đơn tạo trước T30 có
  `'[]'`; thực đơn không có chế độ ăn nào hiện ghi chú "Chưa chọn chế độ ăn, món đổi không lọc theo
  chế độ ăn.".
- Accordion mobile chỉ render danh sách món của ngày đang mở, nên tìm trong trang trên mobile không
  thấy món của ngày đóng.
- Kiểm chứng: P6 trong `pnpm verify:planner` bấm đổi 2 lần ở mọi ô của mọi thực đơn hợp lệ trong
  phạm vi và kiểm lại P1 sau mỗi lần (tiêu chí S12).

### 6.3 History contract

- **Ghi:** `recommendMeals` tự lưu một batch khi cookie `mam_session` resolve ra user; khách không
  ghi gì. Lượt không có món nào thì không tạo batch rỗng.
- **Đọc:** `listHistory({page?, mealType?})` trả `{items, page, pageCount, total}`: tối đa 10 lượt
  một trang, sắp theo `(max(created_at), batch_id)` giảm dần, offset `(page-1)*10`. `total` là số
  batch khớp user + filter; `pageCount = max(1, ceil(total/10))`. Trang xin vượt quá được kẹp vào
  `[1, pageCount]` và `page` trả về là trang đã kẹp — lịch sử trống là `page 1/1, total 0`. Zod chặn
  `page` không phải số nguyên trong `[1, 100000]`.
- **Filter bữa:** `mealType` lọc ở `WHERE`, nên chỉ batch có bữa đó mới xuất hiện, và batch trả về
  chỉ còn đúng bữa đó — `totalVnd` khi đang lọc là tổng của phần đã lọc (không phải tổng cả lượt).
- **Xoá:** `deleteHistory({batchId})` xoá mọi row của batch trong phạm vi `user_id`; batch của
  người khác trả `{ok:false}` (không phân biệt "không tồn tại" với "không phải của bạn").
- **UI:** `/history` (guard đăng nhập) có chip lọc bữa, phân trang đánh số, `<details>` giải
  thích, xoá 2 bước. Trang và bữa nằm trên URL (`/history?page=2&meal=lunch`) nên back/reload/chia
  sẻ link đều đúng; `page` bị bỏ khỏi URL khi là 1, giá trị rác trên URL bị bỏ qua (về trang 1, mọi
  bữa) thay vì báo lỗi. Đổi chip lọc về trang 1. Server kẹp trang thì route redirect (replace) sang
  trang đã kẹp, nên `?page=999` và xoá lượt cuối của trang cuối đều rơi về trang cuối mới. Router
  sở hữu loading và bỏ response cũ (`loaderDeps` = search); xoá xong `router.invalidate({sync})`
  để trang hiện tại đầy lại 10 lượt.
- **Phân trang:** `<nav aria-label>` có Trước/Sau và số trang là link thật (bấm chuột giữa mở tab
  mới), trang hiện tại `aria-current="page"`, Trước/Sau ở hai đầu là `aria-disabled` (không phải
  link), ẩn khi chỉ có 1 trang. Cửa sổ số trang do `paginationItems(page, pageCount)` tính: ≤7 trang
  hiện hết; nhiều hơn thì trang đầu, trang cuối, trang hiện tại ±1, khoảng trống thành `…` (vd. 12
  trang, trang 5 → `1 … 4 5 6 … 12`).
- **Phụ thuộc DB:** ghi/đọc/xoá nằm ở `packages/db/src/history.ts`, test DB thuần (batch, phân
  trang, lọc, isolation, xoá) chạy trên SQLite in-memory; mapping từ `RecommendationResult` sang
  row nằm ở `apps/web/src/server/history.service.ts`.

### 6.4 Chat persistence

- **Ai lưu:** chỉ user đăng nhập. Khách vẫn chỉ `localStorage` (`mam_chat_history_v1`, 20 lượt
  gần nhất) — `chat_threads.user_id` NULL để trống cho analytics tương lai.
- **Khi nào lưu:** route `/api/chat` gọi `beginChatTurn` **trước** khi stream chạy (thread + câu hỏi
  đã nằm trong DB nếu user đóng tab giữa chừng), và `finishChatTurn` ở cuối stream. Bấm "Dừng" vẫn
  lưu phần chữ đã nhận; câu trả lời rỗng thì không ghi row.
- **Thread:** không truyền `threadId` → tạo thread mới với `title` = câu hỏi đầu (gộp khoảng trắng,
  cắt 60 ký tự). `threadId` không thuộc user → **tạo thread mới**, không ghi vào thread người khác.
- **Đọc:** `getChatThread` trả messages theo thứ tự chèn (cùng mili-giây vẫn đúng nhờ `rowid`), và
  map `dish_ids` → `ChatDish` bằng tên/giá đọc từ DB, bỏ qua id món đã bị xoá. Vì vậy đổi locale
  không làm mất thread và thẻ món vẫn đổi ngôn ngữ đúng.
- **Sidebar:** 20 thread gần nhất, sắp theo tin nhắn cuối (nhắn tiếp thread cũ sẽ đưa lên đầu).
  `/chat` loader lấy user + danh sách thread ở server nên lần render đầu không nháy rỗng; client tự
  mở thread mới nhất. "Xoá hội thoại" của user = xoá thread trên server (khách chỉ xoá localStorage).

---

## 7. AI Design (module `ai`)

- Adapter interface:
  ```ts
  interface MealAdvisor {
    readonly kind: 'gemini' | 'mock'
    pick(req: PickRequest, candidates: DishCandidate[]): Promise<PickResult>
    stream(req: ChatRequest, candidates: DishCandidate[]): Promise<ChatStream>
  }

  // ChatStream = { degraded: boolean; events: AsyncIterable<ChatStreamEvent> }
  // ChatStreamEvent = { type: 'text'; text: string } | { type: 'dish'; dishId: string }
  ```
  `degraded` báo provider lỗi và đã chuyển sang câu trả lời deterministic; `dish` cho UI biết
  cần vẽ thẻ món, còn giá/tên lấy từ `meta` do server đọc DB.
- **Prompt** (curated): system prompt nêu vai trò user, ngân sách/ngày, bữa đang xét, danh sách
  ứng viên dạng `id | tên | giá | tag`; yêu cầu trả JSON theo schema Zod:
  `{ picks: [{dishId, reason_vi, reason_en}], tip_vi, tip_en }`. Không cho AI tự tính tổng — server tính lại.
- **Guards:** `dishId` không có trong candidates → loại; tổng vượt budget → loại pick cuối;
  kết quả rỗng sau guard → fallback deterministic (xếp hạng theo `value = fill_level / price`
  - độ khớp tag + đa dạng protein).
- **Chat:** pre-fetch ≤20 ứng viên theo context, nhét vào system prompt, stream qua Gemini
  bằng `fetch` + SSE thuần (ADR-008). Câu chat có số tiền + tên bữa ("ăn trưa 40k") được hiểu là
  ngân sách cho bữa đó; chỉ có số tiền thì là ngân sách/ngày. Tool-calling để AI tự query DB là P2.
  AI trả lời theo `locale` của UI (kể cả khi user gõ ngôn ngữ khác), chỉ nhắc lại giá từng món và
  không được tự cộng tổng; thẻ món khớp tên vi/en, bỏ qua hoa thường và dấu.
- **Món thích và món chán** (ADR-016): với user đăng nhập, `findDishCandidates` bỏ món chán và
  đưa món thích lên đầu **trước khi** cắt 20 ứng viên; không có lựa chọn nào (kể cả khách) thì chạy
  đúng truy vấn cũ có `LIMIT`. Advisor không bao giờ thấy món chán, nên Gemini, mock và lượt mock
  fallback khi Gemini lỗi đều không chọn được nó; `dishId` lạ vẫn bị guard loại. Ranker cộng
  `LIKED_BONUS = 46` (lớn hơn chênh 45 điểm tối đa giữa hai món vừa ngân sách) cho món thích vừa
  ngân sách, kèm lý do `liked`; món thích vượt trần không được cộng. Prompt Gemini có cột `liked`.
  Áp dụng cho cả `/recommend` và chat. Session được đọc một lần qua `loadSessionPreferences`.
- **Ba bữa không trùng món** (bất biến #3): `/recommend` đưa món đã chọn ở bữa trước vào
  `excludeDishIds` cùng món chán. Hết món mới vừa trần bữa thì bữa đó vào `missingMeals` và không
  gọi advisor, không dùng lại món cũ (trần bữa của bất biến #2 không được nới). Chat mock
  (`buildSections` trong `packages/ai/src/mock.ts`) loại món bữa trước đã chọn khỏi ứng viên bữa
  sau; bữa hết món thì in câu riêng `noDishForMeal` ("Chưa có món nào cho bữa … vừa ngân sách … mà
  chưa gợi ý ở bữa khác."). Prompt chat Gemini có dòng cấm gợi ý một món cho hai bữa trong ngày và
  bảo báo bữa không có món thay vì lặp. Quyết định của operator ngày 2026-11-04: để trống bữa và
  báo thiếu món.
- **Mock provider:** không phải text giả — chạy chính fallback deterministic rồi render thành câu
  trả lời template vi/en, phát theo chunk (server nghỉ ~18ms/chunk để UI thấy chữ hiện dần).
  Nhờ vậy demo offline vẫn _đúng nghiệp vụ_, và test không cần network.
- Timeout 20s, 1 retry cho lỗi 429/5xx; lỗi → fallback deterministic + `degraded: true` và banner
  "AI tạm không khả dụng".

---

## 8. UI / Design System (module `shell`)

Hướng thẩm mỹ 2026–2027: **warm minimalism + bento**, nền trung tính ấm, một accent chủ đạo
(terracotta) và một accent dữ liệu (teal), bo góc lớn, đổ bóng mềm nhiều lớp, không gradient rực.

- Tokens OKLCH trong `globals.css`, đặt tên theo shadcn (`--background`, `--primary`, …).
  - Light: nền kem `oklch(0.965 0.018 80)`, chữ nâu đậm `oklch(0.265 0.025 50)`,
    card trắng ấm `oklch(0.995 0.006 85)`, primary terracotta `oklch(0.5 0.135 38)`,
    accent dữ liệu teal `oklch(0.55 0.09 195)`, `--radius: 0.875rem`.
    Viền ấm, ô nhập sáng và bóng mềm giúp phân biệt các lớp bề mặt.
  - Dark: nền `oklch(0.19 0.008 60)`, card `oklch(0.235 0.01 60)`, primary sáng hơn
    `oklch(0.78 0.13 52)`; viền dùng alpha trắng 12%. Refresh light không thay đổi dark.
  - Mọi cặp fg/bg phải đạt **WCAG AA (≥4.5:1)** — kiểm bằng
    `BASE_URL=http://localhost:3001 node scripts/checkpoint-a11y.mjs` (S9).
- Typography: `Be Vietnam Pro` (hỗ trợ dấu tiếng Việt tốt) cho UI; heading dùng cùng family
  weight 600, tracking `-0.01em`. Số tiền dùng `font-variant-numeric: tabular-nums`.
  Font **tự host** trong `apps/web/public/fonts` — chỉ 3 weight thực dùng (400/500/600) × 2 subset
  (`vietnamese`, `latin`), 72KB tổng, `font-display: swap`. Không còn request tới
  `fonts.googleapis.com`, nên trang không phụ thuộc mạng ngoài và không lộ IP người dùng cho bên thứ ba.
- Layout: container 1180px, bento grid 12 cột; card món ăn tỷ lệ 3:2 với khoảng trắng rộng.
- Trang chủ light: hero nền kem/đào nhẹ, tiêu đề lớn, CTA rõ; vai trò và ngân sách thành hàng
  (hai cột desktop, một cột mobile), ba thẻ giá trị có số thứ tự. Giữ nguyên copy vi/en,
  dữ liệu và hành vi. Trang khác dùng chung palette mới; kiểu trang trí chỉ áp dụng màn hình,
  không thay đổi kiểu in thực đơn.
- Chuyển động: 150–200ms ease-out, tôn trọng `prefers-reduced-motion`; skeleton thay spinner.
- Mobile-first: breakpoints 390 / 768 / 1024 / 1280. Không horizontal scroll ở 320px.
- Accessibility: focus-visible ring 2px offset 2px, label thật cho mọi input, `aria-live` cho kết
  quả gợi ý và lỗi, target ≥44px, chat có `role="log"`.
- Dark mode: `.dark` class, mặc định theo `prefers-color-scheme`, lưu cookie + localStorage,
  script inline trong `<head>` để chống FOUC.

---

## 9. Code Style

```ts
// packages/domain/src/budget.ts — pure, không IO
import { z } from 'zod'

export const budgetUnits = ['meal', 'day', 'month'] as const
export type BudgetUnit = (typeof budgetUnits)[number]

export const budgetSchema = z.object({
  unit: z.enum(budgetUnits),
  amount: z.number().int().positive().max(100_000_000),
})

export type Budget = z.infer<typeof budgetSchema>

const MEAL_SPLIT = { breakfast: 0.25, lunch: 0.4, dinner: 0.35 } as const

/** Quy mọi đơn vị về ngân sách/ngày, làm tròn xuống tới 1.000đ. */
export function toDailyBudget(budget: Budget, daysInMonth = 30): number {
  const daily =
    budget.unit === 'meal'
      ? budget.amount * 3
      : budget.unit === 'day'
        ? budget.amount
        : budget.amount / daysInMonth
  return Math.floor(daily / 1_000) * 1_000
}
```

Quy ước: file `kebab-case`, type PascalCase, hàm camelCase, hằng số SCREAMING_SNAKE.
Không `any`; `unknown` + parse Zod ở boundary. Comment giải thích **why**, không mô tả code.

---

## 10. Testing Strategy

| Tầng                    | Công cụ                   | Ở đâu                           | Bắt buộc                                            |
| ----------------------- | ------------------------- | ------------------------------- | --------------------------------------------------- |
| Unit (domain)           | Vitest                    | `packages/domain/*.test.ts`     | Budget math & planner: 100% branch coverage         |
| Unit (ai)               | Vitest                    | `packages/ai/*.test.ts`         | Guards, fallback, mock provider — không gọi network |
| Integration (server fn) | Vitest + SQLite in-memory | `apps/web/src/server/*.test.ts` | Auth, history scoping, plan CRUD                    |
| Component               | Testing Library           | `apps/web/tests/`               | Form validate, i18n switch                          |
| Browser                 | Playwright (thư viện)     | `scripts/checkpoint-*.mjs`      | Checkpoint A–F: chạy tay khi `pnpm dev` đang mở     |

Chưa có project Playwright (`playwright.config.ts`) nên `pnpm test:e2e` chưa nối; kiểm tra bằng
`node scripts/checkpoint-f.mjs` (plans/export), `scripts/checkpoint-e.mjs` (auth) và
`scripts/checkpoint-d.mjs` (AI/recommend). Mỗi script assert từng bước, in `ERRORS` + `FAILURES`,
exit code 1 nếu có lỗi console/HTTP 5xx.

Không mock DB trong integration test: seed DB tạm qua `better-sqlite3(':memory:')`.
Mọi test AI chạy `AI_PROVIDER=mock`. Không test nào được gọi Gemini thật.

---

## 11. Boundaries

**Always**

- Validate input bằng Zod ở server boundary.
- Giá hiển thị phải lấy từ DB, không từ text AI (trừ chế độ `free` có nhãn ước tính).
- Chạy `pnpm typecheck`, `pnpm lint`, test liên quan trước khi báo xong.
- Mọi chuỗi UI mới phải thêm vào **cả** `vi` và `en`.
- Mọi truy vấn history/plan phải filter theo `user_id` của session.

**Ask first**

- Đổi schema DB hoặc thêm migration phá vỡ dữ liệu.
- Thêm dependency mới ngoài danh sách ở §2.
- Đổi design tokens/typography đã chốt.
- Bật/tắt tính năng liên quan privacy (lưu dữ liệu anonymous).

**Never**

- Commit `.env`, API key, hay `data/*.db`.
- Log nội dung chat hoặc password ra console/file.
- Fallback im lặng từ AI thật sang mock mà không báo UI.
- Cho AI tự tính hoặc tự bịa giá trong chế độ `curated`.
- Để endpoint AI không rate limit.

---

## 12. Open Questions

1. ~~**Model mặc định trên OpenRouter**~~ — đã chốt (2026-10-31): bỏ OpenRouter, gọi Google Gemini
   trực tiếp, model mặc định `gemini-3.5-flash`, đổi qua `GEMINI_MODEL` (ADR-014).
2. **Giá món seed** — tôi sẽ dùng khung giá Hà Nội/TP.HCM 2026 (phở 40–70k, cơm tấm 35–55k, bún
   chả 30–45k, sinh viên 20–35k). Nếu bạn muốn lấy giá thật từ một nguồn cụ thể, nói trước khi seed.
3. **Triển khai** — mục tiêu hiện tại là chạy local + Docker? Hay cần deploy thật (Fly/Railway/VPS)
   trong phạm vi lần này? Ảnh hưởng tới `NODE_ENV=production` (Secure cookie), HTTPS, và volume cho
   SQLite.

---

## 13. Non-goals (nhắc lại)

Thanh toán/subscription, tư vấn dinh dưỡng y tế, calo như dữ liệu y khoa, đặt món/đi chợ,
mobile native, social feed, email notification, multi-tenant, đa ngôn ngữ ngoài vi/en.
