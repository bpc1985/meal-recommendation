# ADR-008: Chat stream bằng `fetch` + SSE, giao thức NDJSON

**Ngày:** 2026-10-29
**Trạng thái:** Accepted

## Bối cảnh

Spec ban đầu chọn AI SDK 7 (`streamText`) và data stream của AI SDK cho `/api/chat`. Đến T10
phạm vi thực tế chỉ còn:

- Một endpoint chat, một provider (OpenRouter), không dùng tool-calling.
- Cần stream text **và** metadata trong cùng một response: `degraded` (provider lỗi) và danh
  sách `dishId` để UI vẽ thẻ món. Data stream của AI SDK tối ưu cho text/tool parts, không có
  chỗ tự nhiên cho metadata nghiệp vụ này.
- Cần test toàn bộ adapter mà không gọi mạng, bằng `fetch` giả.
- TypeScript 6 + AI SDK 7 kéo thêm một lớp abstraction và ràng buộc version cho một nhu cầu nhỏ.

## Quyết định

1. `packages/ai` gọi OpenRouter bằng `fetch` toàn cục và tự đọc SSE (`data: {...}`, `[DONE]`).
   Timeout 20s, retry 1 lần cho 408/409/429/5xx. Mọi lỗi khác (JSON hỏng, guard rỗng, thiếu
   content) đều rơi về mock deterministic.
2. Đổi contract `MealAdvisor.stream` từ `AsyncIterable<string>` sang:

   ```ts
   interface ChatStream {
     degraded: boolean
     events: AsyncIterable<{ type: 'text'; text: string } | { type: 'dish'; dishId: string }>
   }
   ```

   `degraded` được biết ngay sau lần fetch đầu, trước khi UI đọc chunk đầu tiên.

3. `/api/chat` trả NDJSON (`application/x-ndjson`), mỗi dòng một event:
   `text` → `dish` → `meta` (tên/giá DB + `degraded`) → `done`. Header `x-accel-buffering: no`
   để proxy không gom stream. UI đọc bằng `readChatStream` và bỏ qua dòng hỏng.
4. Mock provider chạy đúng ranker + guards rồi render câu trả lời vi/en theo template, phát
   từng chunk. Server truyền `chunkDelayMs = 18`; test để `0`.
5. Chat hiểu "ăn trưa 40k" là **40k cho bữa trưa**; câu chỉ có "60k" là ngân sách/ngày. Ứng viên
   vẫn bị lọc trong SQL theo trần bữa, nên tổng gợi ý không thể vượt ngân sách.
6. Rate limit in-memory, cửa sổ 24h trượt từ lượt đầu: khách 20 lượt. Hạng 200 lượt cho user
   đăng nhập được khai báo sẵn nhưng nối ở T12 khi có auth. Khoá theo `x-forwarded-for` →
   `x-real-ip` → `"local"`.

## Hệ quả

- Không thêm dependency AI SDK; adapter ~250 dòng, test được 100% bằng `fetch` giả.
- Metadata nằm cùng stream nên UI không cần request thứ hai để lấy giá món.
- Giao thức NDJSON là của dự án: `ChatWireEvent` trong `apps/web/src/lib/chat-types.ts` là hợp
  đồng duy nhất giữa route và UI; đổi event phải đổi cả hai.
- Ta tự chịu trách nhiệm parse SSE, retry và timeout. Nếu sau này cần tool-calling, structured
  output phức tạp hoặc nhiều provider, xem lại AI SDK.
- Rate limit reset khi restart, không chia sẻ giữa các instance. Chấp nhận cho single-node;
  scale ngang phải chuyển sang Redis (hoặc sticky session + store ngoài).
- `x-forwarded-for` chỉ đáng tin khi đứng sau proxy tin cậy. Bản demo chấp nhận; production phải
  cấu hình proxy tin cậy hoặc rate limit theo user.
- Real OpenRouter path chưa được chạy với key thật trong repo này; adapter được kiểm bằng fetch
  giả cho success, 429/5xx, timeout và SSE bị chia nhỏ.
