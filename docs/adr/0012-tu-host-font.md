# ADR-012: Tự host font Be Vietnam Pro

**Ngày:** 2026-10-29
**Trạng thái:** Accepted

## Bối cảnh

Bản đầu nạp font qua Google Fonts: hai `<link>` preconnect tới `fonts.googleapis.com` và
`fonts.gstatic.com`, cộng stylesheet. Điều này tạo ba vấn đề:

- **Quyền riêng tư:** mỗi lượt tải gửi IP và user-agent của người dùng sang Google, không cần
  thiết cho một app chỉ có hai locale.
- **Phụ thuộc mạng ngoài:** dev offline, mạng chặn Google hoặc deploy nội bộ đều làm mất font.
- **Thêm origin bên thứ ba** trong đường tải critical, khó kiểm soát cache và CSP sau này.

Đo trên bản build production cho thấy font không phải nút thắt LCP (xem Hệ quả), nên lý do chuyển
không phải để tăng tốc.

## Quyết định

Tự host 6 file `woff2` trong `apps/web/public/fonts`:

- Be Vietnam Pro, weight **400 / 500 / 600**, mỗi weight có subset `latin` và `vietnamese`.
- Giữ nguyên `unicode-range` của Google để trình duyệt chỉ tải subset cần; tổng 6 file ≈ 72KB.
- `@font-face` khai báo trong `globals.css` với `font-display: swap`; bỏ hai `<link>` preconnect và
  một `<link>` stylesheet của Google Fonts.
- Bỏ weight 700 vì không có `<strong>`/`font-bold` nào dùng tới.
- **Không** thêm `<link rel="preload">` và **không** dùng `size-adjust` cho font fallback: đã thử
  và đo, cải thiện nằm trong nhiễu, nên revert để giữ HTML gọn.

## Hệ quả

- Không còn request tới origin bên thứ ba; `checkpoint-perf` xác nhận **0 third-party origin**.
- App chạy được offline và trong mạng nội bộ; font phục vụ từ chính server, cache theo asset hash.
- Phải tự cập nhật file khi đổi font/weight — không có Google lo hộ. Muốn thêm weight phải thêm cả
  hai subset.
- LCP/CLS gần như không đổi (trong nhiễu đo); nếu sau này font thật sự là nút thắt thì mới cân nhắc
  preload subset `vietnamese` cho trang chủ.
- Test: `apps/web/e2e/a11y.spec.ts` chờ `document.fonts.ready` trước khi quét contrast;
  `scripts/checkpoint-perf.mjs` kiểm LCP ≤ 2500ms, CLS ≤ 0.1 và 0 origin bên thứ ba.
