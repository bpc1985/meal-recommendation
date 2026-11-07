# ADR-011: Dùng axe-core thay Lighthouse cho cổng accessibility

**Ngày:** 2026-10-29
**Trạng thái:** Accepted

## Bối cảnh

Spec ban đầu mô tả S9 bằng điểm Lighthouse Accessibility. Khi làm T19, hai vấn đề lộ ra:

1. **Điểm Lighthouse là chỉ số tổng hợp**, không chỉ ra phần tử nào sai. Muốn sửa phải mở báo cáo
   HTML và đối chiếu thủ công, không đưa vào CI dưới dạng pass/fail rõ ràng được.
2. Lighthouse chạy audit a11y trên một snapshot sau khi tải, khó điều khiển trạng thái (locale,
   theme, route, sau khi submit form). Cần quét nhiều trang/ngôn ngữ/theme.

Trong khi đó axe-core là engine a11y mà chính Lighthouse dùng bên dưới, và `@axe-core/playwright`
cho phép chạy trên DOM thật, sau khi hydrate, với đúng cookie/theme.

## Quyết định

Cổng a11y dùng **axe-core** qua Playwright, không dùng Lighthouse:

- `scripts/checkpoint-a11y.mjs`: quét 13 lượt trên các trang chính (vi/en, dark), tag
  `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice`, cộng 47 kiểm tra cấu trúc
  (một `h1`, `lang` khớp locale, skip link, bàn phím, reduced-motion, mobile 390px).
- `apps/web/e2e/a11y.spec.ts`: bản rút gọn chạy trong `pnpm test:e2e`, quét `/`, `/recommend`,
  `/chat` ở vi/en/dark, chờ `document.fonts.ready` trước khi phân tích contrast.
- Spec S9 đổi từ "điểm Lighthouse" sang "0 vi phạm axe-core". Không còn chạy Lighthouse trong
  quy trình.

## Hệ quả

- Kết quả pass/fail kèm selector và `failureSummary`, sửa được ngay; chạy được trong CI không cần
  Chrome DevTools Protocol đặc biệt.
- Không có điểm hiệu năng trong cùng báo cáo — hiệu năng đo riêng bằng
  `scripts/checkpoint-perf.mjs` (LCP/CLS) trên bản build production, đúng thứ cần đo.
- axe-core chỉ bắt được các vi phạm máy kiểm được; các vấn đề như thứ tự focus hợp lý hay nội dung
  alt có nghĩa vẫn cần kiểm thủ công — đã ghi trong checklist T19.
- Phiên bản axe-core ghim theo `@axe-core/playwright@4.14.0`; nâng cấp có thể thêm rule mới và làm
  đỏ build, đó là mục đích.
