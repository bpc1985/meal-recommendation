# ADR-014: Gọi Google Gemini trực tiếp thay cho OpenRouter

**Ngày:** 2026-10-31
**Trạng thái:** Accepted — thay phần "provider OpenRouter" của ADR-008 và ADR-009

## Bối cảnh

OpenRouter với model free chỉ cho 50 request/ngày (`free-models-per-day`); hết hạn mức thì mọi
gợi ý/chat rơi về mock kèm banner "AI tạm không khả dụng". User muốn dùng Gemini 3.5 Flash bằng
API key Google của mình.

Adapter hiện tại (ADR-008) là client `fetch` thuần cho endpoint kiểu OpenAI
`POST /chat/completions` (JSON cho pick, SSE cho chat). Google có endpoint tương thích OpenAI ở
`https://generativelanguage.googleapis.com/v1beta/openai`, xác thực bằng
`Authorization: Bearer <GEMINI_API_KEY>`, hỗ trợ `stream: true`.

## Phương án

| Phương án                                     | Đổi gì                                                       | Dependency mới |
| --------------------------------------------- | ------------------------------------------------------------ | -------------- |
| **Endpoint tương thích OpenAI** (chọn)        | base URL, key, model mặc định; `response_format` json_schema | Không          |
| Gemini API gốc (`generateContent`, `alt=sse`) | viết lại body request, parse response và SSE                 | Không          |
| SDK `@google/genai`                           | thay fetch bằng SDK, mất fetch giả trong test                | Có             |

## Quyết định

1. `packages/ai/src/openrouter.ts` → `gemini.ts`, `createGeminiAdvisor`; `MealAdvisor.kind` là
   `'gemini' | 'mock'`. Giữ nguyên fetch + SSE, timeout 20s, retry 1 lần, mock fallback, guards.
2. Base URL mặc định là endpoint tương thích OpenAI của Google; model mặc định `gemini-3.5-flash`
   (theo yêu cầu), đổi được qua `GEMINI_MODEL`.
3. Pick dùng `response_format: { type: 'json_schema', ... }` — dạng Google ghi trong tài liệu
   tương thích OpenAI; `json_object` không được ghi. Zod (`pickResponseSchema`) vẫn là chốt parse.
4. Env: `AI_PROVIDER=mock|gemini`, `GEMINI_API_KEY` (bắt buộc khi `gemini`, thiếu thì fail fast),
   `GEMINI_MODEL` (tuỳ chọn). Xoá hẳn `openrouter`: `AI_PROVIDER=openrouter` giờ là lỗi khởi động,
   không âm thầm về mock.

## Hệ quả

- Không thêm dependency, bundle không đổi.
- Google đánh dấu `gemini-3.5-flash` là **deprecated** và tự chuyển request sang
  `gemini-3.6-flash`. Khi Google bỏ alias, đổi `GEMINI_MODEL` (hoặc model mặc định) là đủ.
- Gemini 3.x luôn "thinking"; độ trễ thực tế với timeout 20s chưa đo — cần đo khi có key thật.
  Nếu chậm, endpoint nhận `reasoning_effort` (`minimal`/`low`/...).
- `.env` cũ có `AI_PROVIDER=openrouter` sẽ làm server dừng khi khởi động lại cho đến khi đổi sang
  `gemini` (kèm key) hoặc `mock`.
