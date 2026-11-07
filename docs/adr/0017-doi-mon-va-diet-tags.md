# ADR-017: Đổi một món trong thực đơn và cột `plans.diet_tags`

**Ngày:** 2026-11-04
**Trạng thái:** Accepted

Plan P8 (`docs/plans/p8-tinh-nang-moi.md`, mục T30) gọi quyết định này là "ADR-016 cho cột
`diet_tags`". Số 016 đã dùng cho món thích và món chán (ADR-016), nên quyết định này mang số 017.

## Bối cảnh

T30 thêm nút "Đổi món" cho từng ô của thực đơn đã lưu. Món thay thế phải giữ đủ luật mà planner đã
giữ lúc tạo thực đơn:

- Phục vụ đúng bữa, khớp chế độ ăn của thực đơn, không phải món chán của user.
- Không lặp món trong 2 ngày liền (bất biến của planner, P1 của `pnpm verify:planner`).
- Tổng ngày không vượt `dailyBudgetVnd`, giá lấy từ bảng `dishes` (bất biến #1 và #2).
- Chỉ chủ thực đơn sửa được thực đơn của mình (scope theo `user_id`).

Bảng `plans` trước T30 không lưu chế độ ăn. Chế độ ăn chỉ được dùng để lọc ứng viên khi tạo rồi bỏ
đi, nên lúc đổi món không có gì để lọc lại. Thêm cột là thay đổi schema, operator đã đồng ý ngày
2026-10-31.

## Quyết định

1. **Cột `plans.diet_tags`.** `text` JSON, `NOT NULL DEFAULT '[]'`, thêm bằng migration
   `packages/db/migrations/0003_classy_lockheed.sql` (chỉ `ALTER TABLE ... ADD`). `createPlanForUser`
   sắp xếp mảng trước khi lưu (`[...input.dietTags].sort()`), cùng mảng dùng để tạo seed, nên hai
   request chỉ khác thứ tự tag cho cùng thực đơn và cùng giá trị cột. Thực đơn tạo trước T30 nhận
   `'[]'`. Trang chi tiết có ghi chú ngắn khi thực đơn không có chế độ ăn nào
   (`plans.detail.dietNone`: "Chưa chọn chế độ ăn, món đổi không lọc theo chế độ ăn.").
2. **Hàm thuần `swapPlanMeal(plan, target, candidates)`** trong `packages/domain/src/plan-swap.ts`
   trả món thay thế hoặc `null`. Ứng viên hợp lệ khi phục vụ `target.mealType`, khớp
   `plan.dietTags` (`dishMatchesDiet`), không nằm trong `excludeDishIds` (món chán), không trùng món
   nào của hôm trước, hôm sau và hai bữa còn lại của hôm nay, và giá cộng hai bữa còn lại của ngày
   ≤ `dailyBudgetVnd`. Giá trong phép cộng là giá của `candidates`, tức giá đọc từ bảng `dishes`.
3. **Vòng xoay theo món gốc.** Vòng = món mốc đứng đầu, sau đó các ứng viên hợp lệ theo
   |giá − giá mốc| tăng dần, hoà thì theo `id`. Kết quả là món đứng sau món hiện tại trong vòng.
   Bấm liên tiếp đi lần lượt các món gần giá nhất rồi quay về món gốc. Mốc là món của ô ở lần bấm
   đầu: client gửi nó dưới tên `anchorDishId`, giữ trong `sessionStorage` theo plan, ngày và bữa
   (`apps/web/src/lib/swap-anchor.ts`, key `mam_swap_anchor_v1:<planId>:<day>:<meal>`), nên tải lại
   trang vẫn xoay tiếp. Storage bị chặn thì chỉ nhớ trong trang.
4. **`anchorDishId` không được tin.** Server validate bằng Zod (chuỗi 1–64 ký tự) rồi chỉ dùng nó để
   tính thứ tự. Tập ứng viên hợp lệ được tính độc lập với mốc, nên mốc rác hay mốc trỏ tới món
   không hợp lệ không đưa được món sai luật vào thực đơn. Mốc không có trong ứng viên thì hàm lấy
   món hiện tại làm mốc.
5. **Ghi một hàng, scope theo user.** `updatePlanItem(db, userId, update)` trong
   `packages/db/src/plans.ts` đọc giá từ `dishes`, rồi cập nhật đúng hàng theo
   `(plan_id, day_index, meal_type)` với `plan_id IN (select id from plans where id = ? and user_id = ?)`. Ghi hơn một hàng
   thì rollback. `swapPlanMealForUser` trong `apps/web/src/server/plan.service.ts` đọc thực đơn, đọc
   món chán, chọn món và gọi `updatePlanItem` trong cùng một transaction `immediate`, nên hai tiến
   trình server trên cùng file DB không đổi ô hàng xóm xen giữa lúc chọn và lúc ghi. Thực đơn của
   user khác trả `not_found`, hết món thay thế trả `no_alternative`, DB giữ nguyên.
6. **P6 trong `scripts/verify-planner.ts`.** Trên mọi thực đơn `feasible` trong phạm vi kiểm chứng,
   bấm đổi món 2 lần ở từng ô theo thứ tự ngày rồi bữa, giữ món gốc làm mốc như UI. Sau mỗi lần đổi
   thì kiểm lại P1 và món mới phải khác món cũ. Kết quả: 463.680 lần chạy, 452.426 lần đổi, OK
   P1–P6. Phá thử bỏ trần ngày cho 41.486 vi phạm P6, chỉ chặn hôm trước cho 81.282 vi phạm. Skill
   `.claude/skills/verify-planner` có thêm hash của `plan-swap.ts`.
7. **Chi phí render của 180 nút.** Thực đơn 30 ngày có 90 ô, mỗi ô là một nút ở bảng desktop và một
   nút ở accordion mobile. Bản đầu làm trang chậm hơn trunk 29,7% (luật 10%). Hai thay đổi đưa về
   +0,0%, +1,9%, +0,8% qua 3 lượt × 30 lần đo với `pnpm start` như hiện tại:
   - Nút dùng chung class `.meal-swap` trong `globals.css`. Icon là mask CSS (data URI SVG) trên
     `::after`, không phải một SVG cho mỗi nút. Bỏ `title` và `data-dish-id` trên nút.
   - Ngày đang đóng trong accordion mobile (`MobilePlanDay` trong `$planId.tsx`) không render danh
     sách món. SSR còn 90 nút thay vì 180, HTML 102,9 KB (trunk 108,4 KB), DOM 920 nút (trunk 1216).

## Phương án đã loại

| Phương án                                          | Lý do loại                                                                                                           |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Con trỏ vòng xoay lưu trên server (bảng hoặc cột)  | Thêm schema và trạng thái phải dọn, chỉ để nhớ một id mà client đã có. Mốc chỉ đổi thứ tự nên không cần giữ ở server |
| Cột mới trong `plan_items` cho món gốc của ô       | Như trên: thêm một lần đổi schema cho dữ liệu chỉ ảnh hưởng thứ tự xoay                                              |
| Xếp vòng theo giá gần **món hiện tại**, không mốc  | Bấm lần hai chọn món gần món vừa đổi nhất, thường là món gốc, nên vòng nảy qua lại giữa hai món                      |
| Chọn món thay thế ngẫu nhiên                       | Khó test, khó đoán (Appendix B của plan)                                                                             |
| Giữ cả 180 nút SSR, cache `Intl` để bù chi phí SSR | Đo profile: thân nút chỉ 2,8% CPU SSR. Bỏ 90 nút không ai nhìn thấy rẻ hơn và đủ đạt luật                            |

## Hệ quả

- Thực đơn cũ và thực đơn mới không chọn chế độ ăn đều có `'[]'`, UI không phân biệt được hai
  trường hợp. Ghi chú `dietNone` đúng cho cả hai, nhưng không nói thực đơn cũ có thể đã được tạo với
  chế độ ăn.
- Trên mobile, tìm trong trang (Ctrl+F) không thấy món của các ngày đang đóng, vì danh sách món
  không có trong DOM. Bảng desktop và bản in vẫn có đủ.
- Món gốc nằm ở `sessionStorage`, nên mở tab mới hay quay lại sau khi đóng tab thì món đang hiện
  trở thành mốc mới.
- Đổi món median 113 ms trên bản build (luật 300 ms).
- Test: `packages/domain/src/plan-swap.test.ts`, `packages/db/src/plans.test.ts`,
  `apps/web/src/server/plan.service.test.ts`, `apps/web/src/lib/swap-anchor.test.ts`,
  `apps/web/e2e/plan-swap.spec.ts`, `apps/web/e2e/site-header.spec.ts`, P6 của `pnpm verify:planner`.
