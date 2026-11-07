# ADR-001: AI không bịa giá — chỉ chọn từ ứng viên trong DB

**Ngày:** 2026-10-29
**Trạng thái:** Accepted

## Bối cảnh

Sản phẩm hứa "gợi ý bữa ăn theo ngân sách", nên giá là dữ kiện không được sai. Nếu để model
tự sinh tên món và giá, output có thể đúng văn phong nhưng sai giá, sai món, hoặc bịa món không
tồn tại trong danh mục 100 món Việt của app. Spec S3 chốt: mọi con số tiền hiển thị phải đọc từ
DB. OpenRouter (kể cả model free) không đảm bảo JSON đúng schema hay giá đúng.

## Quyết định

Chỉ dùng chế độ **curated**:

1. Server lọc ứng viên từ SQL theo bữa, vai trò, ngân sách bữa và tag chế độ ăn; tối đa 20 món.
2. Gửi cho model danh sách gọn (`id`, tên, giá, tag) và yêu cầu trả JSON
   `{picks: [{dishId, reason_vi, reason_en}], tip_vi, tip_en}`.
3. Server đối chiếu `dishId` với đúng tập ứng viên đã gửi. ID lạ hoặc thiếu → bữa đó rơi vào
   `missingMeals`, xếp hạng cục bộ (`rank.ts`) chọn hộ.
4. Giá, tổng, ngân sách còn lại **luôn tính lại** từ `dishes.priceVnd` trong DB. Model không bao
   giờ gửi giá và server không đọc giá từ output của model.

`source` của kết quả phân biệt `ai` (model thật), `mock` (mock provider) và `fallback` (AI trả về
thứ không dùng được, server tự chọn).

Phương án **free mode** (cho model đề xuất món ngoài DB, gắn nhãn "giá ước tính") đã cân nhắc và
loại: không có cách kiểm chứng giá, nhãn "ước tính" không đủ để người dùng ra quyết định chi tiền,
và làm hỏng cam kết S3.

## Hệ quả

- Chất lượng gợi ý bị giới hạn trong 100 món đã seed. Muốn đa dạng hơn thì mở rộng seed, không
  nới cho AI bịa.
- Prompt dài hơn (kèm ứng viên) nhưng output ngắn, dễ validate bằng Zod.
- Khi model lỗi/rate limit, app vẫn trả 3 bữa nhờ fallback — không có màn hình trắng.
- Test: `packages/ai/src/ai.test.ts` (parse/validate, ID lạ), `recommend.service.test.ts`
  (giá lấy từ DB, fallback, `missingMeals`).
