# Implementation Plan: Măm — Gợi ý bữa ăn theo vai trò & ngân sách

Spec: `docs/spec.md` · Intent: `docs/intent/meal-recommendation.md` · Ngày: 2026-10-29

## Overview

Xây monorepo Turborepo với một TanStack Start app (`apps/web`) và 5 package nội bộ
(`db`, `domain`, `ai`, `i18n`, `ui`). Build theo 8 slice dọc, mỗi slice kết thúc bằng một luồng
chạy được từ UI → server → DB, không build ngang từng tầng. Slice đầu tiên (form → gợi ý) là
lát cắt mỏng nhất chứng minh toàn bộ kiến trúc, nên làm sớm để lộ rủi ro.

Nguyên tắc xuyên suốt:

- `packages/domain` là pure — không IO, không React, không Node. Mọi thứ bất biến về nghiệp vụ
  (budget, planner, guards) test được bằng unit test thuần.
- `packages/ai` chỉ biết contract `DishCandidate`, không biết DB.
- Server functions là boundary duy nhất: auth, Zod validate, rate limit, nối DB ↔ domain ↔ AI.
- Mock AI là công dân hạng nhất: mọi test và mọi demo chạy không cần network.

## Architecture Decisions

| #   | Quyết định                                                    | Lý do                                                   |
| --- | ------------------------------------------------------------- | ------------------------------------------------------- |
| A1  | Tiền lưu dạng `INTEGER` VND, không float                      | Tránh sai số làm tròn; VND không có phần lẻ             |
| A2  | Ngân sách chuẩn hoá về `dailyBudgetVnd` ngay khi vào hệ thống | Planner tuần/tháng chỉ còn phép nhân; một nguồn sự thật |
| A3  | AI chọn từ danh sách ứng viên, server tính tổng tiền          | Chặn hallucination giá — yêu cầu S3                     |
| A4  | Fallback deterministic thay vì lỗi khi AI fail                | Hệ thống luôn trả kết quả; UI báo rõ nguồn (`source`)   |
| A5  | Auth tự quản (scrypt + session table)                         | Không thêm dịch vụ ngoài; đủ an toàn cho phạm vi này    |
| A6  | Anonymous không persist server-side                           | Giảm bề mặt privacy, không cần job dọn dữ liệu          |
| A7  | i18n dictionary có type, không thư viện                       | 2 locale, ~250 key; thiếu key = lỗi compile             |
| A8  | Rate limit in-memory theo IP + user                           | Đơn giản, đủ cho single-node; ghi rõ giới hạn trong ADR |
| A9  | Test AI luôn qua `AI_PROVIDER=mock`                           | Không network, không tốn tiền, deterministic            |
| A10 | Pin version chính xác trong `package.json` cho framework libs | TanStack Start/AI SDK còn tiến hoá nhanh                |

## Dependency Graph

```
tsconfig / turbo / eslint                     (T1)
        │
        ├── db schema + client ────────────┐
        │        │                         │
        │        └── seed data (T4)        │
        │                                  │
        ├── domain contracts ── budget (T3) │
        │        │                         │
        │        ├── ai adapter + guards (T7)
        │        │                         │
        │        └────────────┐            │
        │                     ▼            ▼
        │              recommend fn (T8) ──┘
        │                     │
        │              /recommend UI (T9)   ← SLICE 1, rủi ro cao nhất
        │
        ├── i18n (T6) ──┐
        └── ui/shell (T5) ─┴── mọi UI sau
                              │
              ai chat (T10) ──┤
                              ├── identity (T12, T13)
                              ├── plans (T14, T15, T16)
                              └── history (T17, T18)
```

Đường găng: T1 → T2 → T3 → T7 → T8 → T9. Mọi thứ khác nhánh ra từ đó.

## Task List

Tasks chi tiết (acceptance + verify + files) nằm ở `tasks/todo.md`. Đây là index có thứ tự.

### Phase 1: Foundation

- [ ] T1 — Scaffold monorepo (Turborepo, pnpm, TS 7 strict, ESLint, Prettier)
- [ ] T2 — `packages/db`: schema Drizzle đầy đủ + client + migration
- [ ] T3 — `packages/domain`: Zod contracts + budget math
- [ ] T4 — Seed data: ~100 món Việt + 10 roles, idempotent

**Checkpoint A:** `pnpm db:reset` tạo DB có dữ liệu; `pnpm test` xanh; `pnpm typecheck` sạch.

### Phase 2: Shell (design system + i18n)

- [ ] T5 — Tailwind v4 tokens (OKLCH), shadcn init, layout, theme toggle không FOUC
- [ ] T6 — `packages/i18n` + locale cookie + formatter VND/ngày + script `i18n:check`

**Checkpoint B:** Trang chủ render vi/en, dark/light, mobile 390px không scroll ngang.

### Phase 3: Slice 1 — Form → gợi ý (giá trị cốt lõi)

- [ ] T7 — `packages/ai`: interface, mock provider, ranker, guards
- [ ] T8 — Server fn `recommendMeals` + fallback + lưu history cho user đã đăng nhập
- [ ] T9 — `/recommend` form 3 bước + kết quả 3 bữa + budget bar (tách T9a form / T9b kết quả)

**Checkpoint C (quan trọng nhất):** Khách nhập "sinh viên / 60k/ngày" → 3 bữa có giá từ DB,
tổng ≤ 60k, đổi sang EN vẫn đúng, không cần API key. Review với human trước khi đi tiếp.

### Phase 4: AI chat

- [x] T10 — OpenRouter adapter (streaming) + `/api/chat` + rate limiter
- [x] T11 — `/chat` UI streaming, dish cards, history localStorage cho khách

**Checkpoint D:** Chat chạy `mock` và `openrouter` thật (key ở `.env` gốc, nạp qua ADR-009): stream
về dần, `degraded: false`, thẻ món lấy giá từ DB, EN/VI theo locale; upstream lỗi vẫn fallback mock;
vượt rate limit trả 429 có message i18n.

### Phase 5: Identity

- [x] T12 — scrypt hash, session store, `register`/`login`/`logout` (ADR-010)
- [x] T13 — UI login/register, route guard `beforeLoad`, `/settings`

**Checkpoint E:** Đăng ký → đăng nhập → reload còn session → logout mất session; test isolation.
Đã pass 2026-10-29 bằng `node scripts/checkpoint-e.mjs` (13 bước, 0 console error) + 60 test web.

### Phase 6: Plans (tuần/tháng)

- [x] T14 — Planner pure 7/30 ngày: ngân sách + đa dạng món
- [x] T15 — CRUD plan + UI tạo/xem/xoá
- [x] T16 — Export markdown / copy / print

**Checkpoint F:** Tạo plan 30 ngày 2.5tr → tổng ≤ 2.5tr, không lặp món trong 2 ngày liền.
Đã pass 2026-10-29 bằng `node scripts/checkpoint-f.mjs` (21 bước, 0 console error) — plan
≈2,31tr/2,49tr (2.314.000đ lần chạy gần nhất), 90 món, markdown có BOM + 30 bảng ngày, mobile
accordion, xoá cascade. Tổng đổi chút giữa các lần vì seed suy từ user id.

### Phase 7: History + Polish

- [x] T17 — `/history` + filter theo bữa + phân trang cursor (T24 thay bằng trang đánh số)
- [x] T18 — Lưu thread chat cho registered, mở lại được
- [x] T19 — i18n sweep + axe-core a11y pass + font self-host
- [x] T20 — E2E happy path, README, Dockerfile, ADRs
- [x] T21 — Dùng gần đủ ngân sách (ranker + ứng viên sát trần + không lặp món; feedback review)
- [x] T22 — Planner không báo sai "thiếu tiền/thiếu món" (reserve loại món đang xét + neo ngày đầu; từ `pnpm verify:planner`)
- [x] T23 — Thay OpenRouter bằng Google Gemini 3.5 Flash (endpoint tương thích OpenAI, ADR-014)
- [x] T24 — `/history` phân trang đánh số, 10 lượt/trang, `?page=&meal=` trên URL (bỏ "Tải thêm"/cursor)

**Checkpoint G (Definition of Done):** 10 success criteria gốc ở spec §1 (S1–S10) pass; `pnpm build`
sạch. Sau P8 spec mở rộng thành 12 tiêu chí (S1–S12), cả hai tiêu chí mới đã pass (2026-11-04).

### Phase 8: Năm tính năng mới (`docs/plans/p8-tinh-nang-moi.md`)

- [x] T25 — `/dishes` duyệt 100 món: tìm bỏ dấu, lọc bữa/tag/giá, filter trên URL (bộ đọc URL chung `search-params.ts`)
- [x] T26 — Xuất thực đơn ra CSV và .xlsx (`planRows` chung, `write-excel-file@4.1.1` tải lười)
- [x] T27 — Lưu món thích và món chán (bảng `dish_preferences`, ADR-015; chỉ user đăng nhập, lọc `?liked=true`)
- [x] T28 — Áp món thích và món chán vào gợi ý, chat và planner (ADR-016; món chán loại trước khi cắt ứng viên, món thích `LIKED_BONUS = 46` trong recommend/chat, planner chỉ loại)
- [x] T29 — Tính ngân sách còn lại của tháng (thẻ ba ô số ở chi tiết thực đơn, ngân sách gốc `dailyBudgetVnd × days` theo quyết định B, `/recommend` điền sẵn từ URL)
- [x] T30 — Đổi một món trong thực đơn (cột `plans.diet_tags`, hàm thuần `swapPlanMeal` xoay vòng theo giá gần món gốc, `anchorDishId` trong `sessionStorage`, P6 trong `verify:planner`; ADR-017)
- [x] Sửa bất biến #3 — `/recommend` và chat không lặp món giữa ba bữa; hết món mới thì bữa báo thiếu (`missingMeals`, câu riêng trong chat), không dùng lại món cũ

## Risks and Mitigations

| Risk                                                      | Impact                | Mitigation                                                                             |
| --------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------------- |
| `better-sqlite3` native module bị Vite bundle vào SSR     | High — app không boot | `ssr.external: ['better-sqlite3']` trong vite config; verify ngay ở T2 bằng `pnpm dev` |
| TanStack Start v1 API còn đổi (server fn, cookie helpers) | High — phải viết lại  | Pin version chính xác, đọc docs v1 tại thời điểm code, không copy tutorial cũ          |
| AI SDK 7 khác API 4/5                                     | Med                   | Adapter bọc `streamText`/`generateObject`; nếu vỡ, mock vẫn chạy được                  |
| Tailwind v4 + shadcn CLI lệch nhau                        | Med                   | Dùng shadcn bản Tailwind v4; nếu CLI fail, copy component thủ công theo docs           |
| Hydration mismatch do đọc cookie locale/theme ở client    | Med                   | Đọc ở server (`beforeLoad`/root loader), truyền xuống; script chống FOUC chỉ set class |
| TypeScript 7 chưa tương thích `typescript-eslint`         | Med                   | Fallback `typescript@5.9` nếu lint vỡ — ghi lại trong ADR                              |
| Streaming qua TanStack Start server route bị buffer       | Med                   | Dùng `Response` với `ReadableStream`, test bằng `curl -N` ở T10                        |
| Seed 100 món sai giá thực tế                              | Low                   | Ghi rõ là ước lượng, cho user sửa; giữ `price_min/max` để hiển thị khoảng              |
| Scope creep (tool-calling)                                | Med                   | Đánh dấu P2, không làm trong plan này (dishes browse đã làm ở T25)                     |

## Parallelization

- **Song song được:** T5/T6 (shell + i18n) với T2/T3 (db + domain) — không share file.
- **Song song được:** T12 (identity backend) với T11 (chat UI) — contract đã chốt.
- **Phải tuần tự:** T1 → T2 → T3 → T7 → T8 → T9 (đường găng).
- **Cần phối hợp:** T9 và T15 dùng chung `MealCard` + budget bar → chốt component ở T9.

## Open Questions (đã chốt mặc định, ghi để minh bạch)

1. Model AI: chốt ngày 2026-10-29 là OpenRouter (`OPENROUTER_MODEL`, không hard-code). Đã thay
   2026-10-31 bằng `GEMINI_MODEL` + Google AI Studio (ADR-014, T23). `AI_PROVIDER=mock` vẫn là
   default trong `.env.example` để demo/test không cần mạng.
2. Giá seed: khung Hà Nội/TP.HCM 2026, ghi rõ là ước lượng.
3. Deploy: chỉ local + Dockerfile, chưa deploy thật.

## Light theme refresh — 2026-11-07

- Phạm vi: chỉ trình bày light mode; giữ nguyên `.dark`, dữ liệu, điều hướng và luồng gợi ý.
- Thiết kế: nền kem rõ hơn, chữ nâu đậm, terracotta sâu, viền ấm; tách lớp nền/thẻ/ô nhập.
  Trang chủ có hero nền màu nhẹ, danh sách vai trò thành hàng dễ đọc và thẻ giá trị đánh số rõ.
- Triển khai: token light dùng chung và class trình bày ở `globals.css`; class ngữ nghĩa trên
  trang chủ. Không thêm dependency, font, ảnh ngoài hoặc chuỗi UI mới.
- Nghiệm thu: desktop và mobile 390/320px không tràn ngang; vi/en đọc rõ; chuyển theme và reload
  vẫn giữ lựa chọn; dark mode giữ token và bố cục cũ; gợi ý mock vẫn hoạt động.
- Kiểm chứng: ảnh trình duyệt trước/sau, thao tác gợi ý, checkpoint a11y, e2e và toàn bộ cổng
  format → typecheck → lint → unit → build → i18n. Không đổi logic nên không thêm unit test.

## Design refinement — 2026-11-07

- Mục tiêu: giảm trang trí, ưu tiên chọn bữa ăn và so sánh ngân sách; giữ nguyên nghiệp vụ.
- Review: hero lồng thẻ, gradient kem, bóng nhiều lớp và số thứ tự giá trị không mang nghĩa;
  lựa chọn vai trò/chế độ ăn dùng quá nhiều nền màu và góc bo.
- Token: nền gạo `#F7F8F6`, trắng `#FFFFFF`, chữ `#242B26`, chữ phụ `#626A63`,
  viền `#DCE1DA`, hành động paprika `#984323`; teal chỉ biểu thị trạng thái ngân sách.
  Giữ Be Vietnam Pro tự host (400/500/600), tiền tabular, dark mode tương phản hiện có.
- Bố cục: nội dung căn trái, danh sách vai trò/ngân sách căn giá sang phải; bỏ hero đóng khung,
  badge và số trang trí; giá trị thành ba đoạn văn không thẻ.
  Form gợi ý dùng một bề mặt chung, phân khu bằng khoảng cách và đường chia.
- So sánh: giữ ba thẻ lớn sẽ vẫn giống landing SaaS; chọn danh sách ngân sách vì nội dung thực
  của Măm là món Việt và tiền ăn mỗi ngày, không phải số liệu dashboard.

```text
Tên + điều hướng                         Ngôn ngữ / theme / tài khoản

Hôm nay ăn gì…                           Ngân sách tham khảo mỗi ngày
Mô tả ngắn                               Vai trò                 Giá
Gợi ý ngay   Hỏi AI                       Vai trò                 Giá
Lưu ý giá                                …

Giá từ dữ liệu           Vừa ngân sách           Thực đơn nhiều ngày
```

- Phạm vi: CSS, markup trang chủ/header/form, copy tiêu đề tham khảo vi/en; không thêm
  dependency, không đổi API, validation, thuật toán hay trạng thái React.
- Nghiệm thu: desktop, mobile 390/320px, vi/en và dark; bàn phím/reduced motion; gợi ý mock,
  checkpoint a11y, e2e và các cổng bắt buộc. Chỉ đổi trình bày nên dùng suite hiện có và browser smoke.
- Kiểm trực quan hoàn tất trên light/dark, vi/en; bảng kiểm không tràn ở 320/390/768/1440px
  cho home/recommend/dishes/login. Gợi ý mock dev và production trả ba bữa 57.000/60.000 ₫.
- Sheet mobile đã bỏ khoảng trống thừa/inset thiếu, đo animation `0.15s`, nút đóng 44×44px.
- Cổng format → typecheck → lint → 459 unit → build → i18n đã xanh; dictionary còn 323 key
  sau khi bỏ eyebrow không dùng. Checkpoint a11y: 0 lỗi/vi phạm, bàn phím và reduced motion đạt.
- Production Slow 4G/CPU ×4 (trung vị ba lượt): home LCP 1896ms, CLS 0.0074;
  recommend LCP 2128ms, CLS 0.0002; không có origin bên thứ ba.
- E2e bỏ giả định chiều cao cố định 40/65px đã lỗi thời; kiểm nhãn điều hướng cùng một dòng
  bằng vị trí chữ thực, giữ kiểm overflow/overlap/tên truy cập. Không thu nhỏ target để test xanh.
- E2e cuối: 26/26 đạt; có log hydration mismatch ở bộ lọc dishes và accordion trước hydrate.
  Không sửa luồng dữ liệu trong đợt thiết kế. Đã xoá report/trace sinh từ lần chạy này để lint
  không quét JavaScript đóng gói của Playwright.
