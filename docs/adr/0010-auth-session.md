# ADR-010: Auth tự quản bằng scrypt + session SQLite

**Ngày:** 2026-10-29
**Trạng thái:** Accepted

## Bối cảnh

T12/T13 cần đăng ký/đăng nhập bằng email + mật khẩu, giữ chỗ đăng nhập qua reload, và tách dữ
liệu giữa các user. Spec §4 (ADR-005) đã chốt: bảng `sessions`, token 32 byte, lưu SHA-256,
cookie `HttpOnly` `SameSite=Lax` 30 ngày, rotate khi login; hash mật khẩu bằng `scrypt` của
`node:crypto`. Câu hỏi còn lại là các chi tiết quyết định tính đúng/sai: tham số scrypt, cách
tránh lộ user qua timing, khoá rate limit, và nơi đọc session trong TanStack Start.

Ràng buộc: single-node SQLite, không thêm dependency (không NextAuth, không bcrypt native), demo
chạy local rồi có thể lên VPS.

## Quyết định

1. **Hash:** `scrypt` với N=16384, r=8, p=1, keylen 64, salt 16 byte; lưu chuỗi
   `scrypt$N$r$p$salt$hash` (base64url). Tham số nhúng trong hash để lần sau tăng cost vẫn
   verify được hash cũ. So sánh `timingSafeEqual`; hash sai định dạng trả `false`.
2. **Chống dò user:** email không tồn tại vẫn chạy `verifyPassword` trên một `DUMMY_HASH` cố
   định rồi trả `invalid_credentials` giống hệt sai mật khẩu. Register trùng email trả
   `email_taken` (luồng tạo tài khoản buộc phải nói); UNIQUE của DB là chốt cuối khi hai request
   đăng ký song song.
3. **Session:** token random 32 byte (`base64url`) chỉ nằm trong cookie; DB lưu SHA-256 hex. Hạn
   30 ngày; mỗi lần đọc đều xoá row hết hạn. Login xoá toàn bộ session cũ của user rồi tạo token
   mới (rotate) — mỗi tài khoản chỉ có một session sống.
4. **Cookie:** `mam_session`, `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` 30 ngày,
   `Secure` chỉ bật khi `NODE_ENV=production` (dev chạy HTTP nên `Secure` sẽ làm cookie bị bỏ).
5. **Đọc session:** đọc cookie qua `getCookie` trong server fn (`fetchSessionUser`), còn route
   `/api/chat` đọc header bằng `readSessionToken` vì nó là route handler thuần. Cả hai đi qua
   `getSessionUser` → `toPublicUser`, không bao giờ trả `passwordHash`.
6. **Rate limit:** login 10 lần/15 phút theo `ip:email`; register 5 lần/giờ theo IP; chat giữ
   20/ngày cho khách và 200/ngày theo `user:<id>` cho người đã đăng nhập. In-memory, reset khi
   restart (ADR-008).
7. **Form auth** dùng `useState` + Zod như ADR-007, thêm helper `toFieldErrors` map lỗi Zod sang
   key i18n để hiện lỗi dưới từng field — không thêm thư viện form.

## Hệ quả

- Không có dependency crypto native; `scrypt` của Node đủ nhanh (~60–80ms/lần) và chạy trong
  thread pool nên không chặn event loop.
- Rotate khi login làm mọi thiết bị khác bị đăng xuất. Chấp nhận cho bản demo; nếu cần multi-device
  thì bỏ `deleteSessionsForUser` và thêm UI quản lý thiết bị.
- Rate limit in-memory chỉ đúng trên một instance; scale ngang phải chuyển sang Redis.
- `Secure` phụ thuộc `NODE_ENV`: deploy sai môi trường (production sau HTTP) sẽ mất cookie —
  đúng hướng fail-safe, nhưng cần nhớ khi lên VPS.
- Chưa có reset mật khẩu/đổi email; khi thêm phải tính luồng token qua email (ngoài phạm vi).
- Test: `password.test.ts`, `session.test.ts`, `auth.service.test.ts`, `auth-input.test.ts`,
  `auth-redirect.test.ts`, rate-limit test; browser: `scripts/checkpoint-e.mjs`.
