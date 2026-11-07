# ADR-015: Bảng `dish_preferences` cho món thích và món chán

**Ngày:** 2026-11-04
**Trạng thái:** Accepted

## Bối cảnh

T27 cho user đăng nhập đánh dấu thích hoặc chán từng món trên `/dishes`, và lọc "Chỉ món thích".
T28 sẽ dùng tập món chán để loại hẳn món đó khỏi gợi ý, chat và planner. Cần một chỗ lưu trên
server, scope theo `user_id` như mọi dữ liệu khác (bất biến #4 và #5).

Ràng buộc:

- Một món chỉ có một trạng thái. Không được vừa thích vừa chán.
- Bấm lặp lại hay retry phải ra cùng kết quả trong DB.
- Xoá user hoặc xoá món thì lựa chọn đi theo, không để hàng mồ côi.
- Bấm nhanh nhiều lần trên một món thì trạng thái cuối trên UI phải khớp DB.

## Phương án

| Phương án                                                | Một trạng thái/món                | Khách                 |
| -------------------------------------------------------- | --------------------------------- | --------------------- |
| **Một bảng, cột `kind`, PK `(user_id, dish_id)`** (chọn) | DB bảo đảm bằng khoá chính        | Không lưu             |
| Hai bảng `liked_dishes` và `disliked_dishes`             | Code phải xoá bên kia mỗi lần ghi | Không lưu             |
| Một bảng cho user, `localStorage` cho khách              | Như phương án chọn                | Lưu trong trình duyệt |

Hai bảng làm trạng thái "vừa thích vừa chán" biểu diễn được. Chỉ code giữ cho nó không xảy ra,
và hai lần ghi phải bọc transaction. Lưu `localStorage` cho khách bị loại theo lựa chọn của
operator ("Chỉ user đăng nhập"). Nó còn kéo theo bài toán gộp dữ liệu khách vào tài khoản khi đăng
nhập, mà bất biến #4 cấm.

## Quyết định

1. **Bảng.** `dish_preferences(user_id, dish_id, kind, created_at)`, khoá chính
   `(user_id, dish_id)`, `CHECK (kind in ('like', 'dislike'))`. Hai khoá ngoại tới `users` và
   `dishes` với `ON DELETE CASCADE`. Cascade chạy thật vì `createDb` bật
   `PRAGMA foreign_keys = ON`. Migration `0002_public_random.sql` chỉ thêm bảng.
2. **Ghi.** `setDishPreference(db, userId, dishId, kind | null)` là upsert theo khoá chính.
   `created_at` chỉ lấy giờ mới khi `kind` đổi (`setWhere kind <> excluded.kind`), nên gọi lặp lại
   cùng giá trị không đổi gì. `null` xoá hàng.
3. **Đọc.** `listDishPreferences(db, userId)` trả `{ liked, disliked }`, hai mảng id sắp theo
   `created_at`.
4. **Server function.** `setPreference` (POST, Zod `{ dishId, kind | null }`) trả `{ ok: true }`
   hoặc `{ ok: false, error: 'unauthorized' | 'dish_not_found' }`. `listMyPreferences` trả
   `{ liked, disliked }` hoặc `null` cho khách. Logic nằm trong `dish-preferences.service.ts` để
   test không cần runtime TanStack.
5. **Chỉ user đăng nhập.** Khách bấm thì thấy toast mời đăng nhập. Không ghi DB, không ghi
   `localStorage`, không ghi gì ở đâu cả.
6. **Client.** `Map<dishId, kind>` trong `dish-preference-toggle.tsx`. Mỗi món có một hàng đợi nối tiếp
   (`serialByKey`), nên request tới server đúng thứ tự bấm. `createPreferenceSaver` nhớ trạng
   thái server xác nhận lần cuối. Lưu lỗi thì đọc lại từ server trong cùng hàng đợi, đọc lại cũng
   lỗi thì UI về trạng thái xác nhận lần cuối đó.
7. **Lọc.** "Chỉ món thích" nằm trên URL `?liked=true`, đọc qua `parseDishSearch` như các filter
   khác của T25.

## Hệ quả

- T28 đọc tập `disliked` để loại cứng món chán khỏi ứng viên của gợi ý, chat và planner. Món thích
  chỉ là tín hiệu ưu tiên, không phải bắt buộc.
- Đổi schema DB: `pnpm db:bootstrap` chạy migration `0002` trên DB cũ, idempotent.
- `created_at` là giờ chọn trạng thái hiện tại, không phải giờ bấm lần đầu. Đủ cho sắp xếp, không
  dùng làm lịch sử.
- Khách mở `?liked=true` thì tham số vẫn ở URL nhưng filter không áp dụng.
- Chưa có filter "Món chán" để xem lại món đã chán. Cân nhắc ở T28, khi món chán bắt đầu biến mất
  khỏi gợi ý.
- Test: `packages/db/src/preferences.test.ts`, `dish-preferences.service.test.ts`,
  `lib/dish-preferences.test.ts`, `lib/dish-filter.test.ts`, `e2e/dish-preferences.spec.ts`.
