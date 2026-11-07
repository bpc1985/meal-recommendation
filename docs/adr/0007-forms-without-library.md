# ADR-007: Không dùng thư viện form

**Ngày:** 2026-10-29
**Trạng thái:** Accepted

## Bối cảnh

Spec ban đầu chọn TanStack Form cho mọi form. Đến T9 (form gợi ý) có 4 trường thực sự:
vai trò (chọn 1 trong 10), số tiền, đơn vị ngân sách, và một tập tag chế độ ăn. Không có
field mảng động, không có validate async, không có bước phụ thuộc.

TanStack Form thêm một lớp state riêng (`useForm`, `form.Field`, `validators`) trong khi
schema Zod đã là nguồn sự thật duy nhất cho cả client và server fn. Hai nguồn state cho
cùng một dữ liệu dễ lệch nhau — đúng loại lỗi khó tìm.

## Quyết định

Dùng `useState` thường + Zod (`recommendInputSchema` trong `apps/web/src/lib/recommend-input.ts`).
Client và server cùng gọi một schema; server fn vẫn validate lại (không tin client).

## Hệ quả

- Một schema, hai nơi dùng; đổi rule chỉ sửa một file.
- Bớt một dependency, bundle nhỏ hơn.
- Form phức tạp hơn (nhiều field động, validate chéo field) sẽ phải tự viết — nếu T13
  (login/register/settings) vượt quá 8 field, xem lại quyết định này.
- Thông báo lỗi hiện ở mức form (`role="alert"`), chưa gắn từng field. Chấp nhận được vì
  form chỉ có một lỗi khả dĩ (số tiền). T13 sẽ cần lỗi theo field — lúc đó có thể thêm
  helper nhỏ thay vì cả thư viện.
