---
name: verify-planner
description: Kiểm chứng vét cạn có chặn cho planner thực đơn tuần/tháng (`buildPlan` trong packages/domain/src/planner.ts) và nút "Đổi món" (`swapPlanMeal` trong packages/domain/src/plan-swap.ts) — không vượt ngân sách ngày, không lặp món trong 2 ngày, giá từ DB, và con số "ngân sách tối thiểu" gợi ý cho user là thật. Dùng khi sửa planner.ts, plan-swap.ts, diet.ts, mealTypes trong contracts.ts, luồng tạo hoặc đổi món plan (plan.service.ts), hoặc khi được hỏi planner có đúng không.
---

# Verify planner (`buildPlan`)

## Kiểm cái gì, vì sao

`buildPlan` là bộ chọn tham lam nhiều ngày (reserve + chia đều + 8 lượt jitter + lượt rẻ nhất).
Test đơn vị chỉ chạy vài bộ món cố định; bug của thuật toán tham lam nằm ở những bộ món nhỏ, kỳ
quặc mà không ai nghĩ ra để viết test. Script này chạy **planner thật** trên **mọi** bộ món nhỏ
trong phạm vi và so với một oracle vét cạn độc lập ("có lịch hợp lệ không, ở ngân sách nào").

Thuộc tính (khớp `docs/spec.md` §6.2, viết lại ở đầu `scripts/verify-planner.ts`):

| Mã  | Lời hứa                                                                                                                             | Hại nếu vỡ                                          |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| P1  | Plan `feasible`: đủ ngày × 3 bữa đúng thứ tự, món phục vụ đúng bữa, giá = giá `dishes`, ngày ≤ ngân sách, không lặp món 2 ngày liền | User bị vượt ngân sách / ăn lặp / thấy giá bịa      |
| P2  | `feasible:false` ⇒ `days:[]`, `totalVnd:0`                                                                                          | UI hiện plan rác                                    |
| P3  | `minimumDailyBudgetVnd > 0` ⇒ bội 1.000đ và planner xếp được ở mức đó                                                               | User tăng tiền theo gợi ý mà vẫn thất bại           |
| P4  | `minimumDailyBudgetVnd = 0` ⇒ không có lịch hợp lệ ở bất kỳ ngân sách nào ("thiếu món")                                             | User bị bảo "thiếu món" trong khi chỉ cần thêm tiền |
| P5  | `minimumDailyBudgetVnd = M > 0` ⇒ không có lịch hợp lệ nào ở `M − 1.000`                                                            | User bị đòi tăng tiền khi ngân sách đã đủ           |
| P6  | Bấm "Đổi món" (`swapPlanMeal`) 2 lần ở từng ô của plan `feasible`, mốc là món gốc của ô: sau mỗi lần plan vẫn thoả P1, món mới ≠ cũ | Đổi món làm vượt ngân sách / lặp món / sai bữa      |

## Chạy

```bash
pnpm verify:planner                 # nhanh, ~30s: ≤6 món, giá 1k/2k, days 1/2/3, seed 1
VERIFY_MAX_DISHES=4 pnpm verify:planner   # <1s, để lặp nhanh khi đang sửa
VERIFY_DEEP=1 pnpm verify:planner   # ~10 phút, 12,4 triệu lần chạy (giá 1k/2k/3k, 2 seed) — khi đổi thuật toán
```

`VERIFY_MAX_DISHES` dưới 6 chỉ còn plan 1 ngày: hai ngày liền cần 6 món khác nhau (3 bữa × 2 ngày,
không lặp trong cửa sổ 2 ngày), nên mọi plan ≥2 ngày đều `feasible:false`. Khi đó P6 không bao giờ
đổi món ở plan nhiều ngày và luật "không lặp với ngày kề" của `swapPlanMeal` không được kiểm. Sửa
`plan-swap.ts` hay luật ngày kề thì chạy lại với giới hạn mặc định 6 món trước khi kết luận.

Thoát mã 0 + `OK: P1–P6 …` nếu sạch. Dòng đầu in số lần chạy `buildPlan` và số lần đổi món của
P6 (nhanh: 463.680 và 452.426), để thấy P6 không rỗng. Thoát mã 1 và in, cho mỗi thuộc tính, số trường hợp vi phạm
và phản ví dụ đầu tiên (bộ món nhỏ nhất, vì duyệt theo kích thước tăng dần).

## Trạng thái nền đã biết (đọc trước khi kết luận)

Ở lần đồng bộ cuối, **P1–P6 đều sạch** ở chế độ nhanh (`OK: P1–P6 …`). Bất kỳ dòng `VI PHẠM` nào
sau thay đổi của bạn ⇒ hồi quy (hoặc lỗi mô hình — xem mục dưới).

Lịch sử: P4/P5 từng fail (22.943 / 7.396 trường hợp) — T22 trong `tasks/todo.md`. Hai gốc, đã sửa:

1. `reserve` cho các bữa sau từng được tính **trước** khi loại món đang xét, nên bữa trưa có thể
   "ăn" món duy nhất còn phục vụ bữa tối. Giờ `pickDish` tính reserve cho từng ứng viên với chính
   nó bị chặn — trong một ngày, chọn kiểu này không bao giờ bí nếu ngày đó còn xếp được.
2. Nhiều ngày: ngày đầu có thể chặn đường ngày sau. Có hai ngày khác hẳn nhau cùng vừa ngân sách
   thì xếp được mọi số ngày (từ ngày 3, bộ của hôm kia luôn là lối thoát), nên lượt `cheapest`
   neo ngày đầu bằng `findFirstDay`. Lập luận này là lý do oracle chỉ cần days ≤ 3.

## Phân biệt bug thật và lỗi mô hình

Khi một thuộc tính fail, replay phản ví dụ trên code bằng tay theo `tryBuildDays`: tính `blocked`,
với từng ứng viên `minCostFor(laterMeals, …, blocked + món đó)`, `affordable`, `fairShare`,
`withinShare`, món được chọn, từng bữa; ở lượt `cheapest` (≥2 ngày) xem `findFirstDay` neo gì. Rồi tự tìm
một lịch hợp lệ cho P4/P5 (oracle nói nó tồn tại — kiểm lại bằng tay).

- Mọi bước replay xảy ra được trong code và lịch oracle thật sự hợp lệ ⇒ **bug code**. Báo bằng
  từ ngữ của code (như ví dụ trên), một câu về hại. Không sửa product code nếu user chưa yêu cầu.
- Oracle (`dayChoices` / `planExists`) cho phép điều mà spec cấm, hoặc cấm điều spec cho phép ⇒
  **lỗi mô hình**. Sửa script, ghi rõ sai ở đâu. Không bao giờ nới thuộc tính cho xanh.

## Phạm vi và giả định (điều KHÔNG được kiểm)

- Chặn: ≤6 món, giá ∈ {1.000, 2.000} (deep: thêm 3.000), mọi tập bữa khác rỗng, days ∈ {1,2,3},
  seed 1 (deep: 1,2), mọi ngân sách bội 1.000đ từ 3 × giá rẻ nhất đến 3 × giá đắt nhất.
- Giả định giá là bội 1.000đ (đúng với seed hiện tại). Giá lẻ có thể làm P3 sai mà script không
  thấy.
- `fillLevel`, `prepMinutes`, tag `high_protein` cố định ⇒ thứ tự `mealScore` không được duyệt hết;
  chỉ jitter theo seed thay đổi thứ tự chọn.
- `dietTags` = `[]`: lọc chế độ ăn (`dishMatchesDiet`) không được kiểm ở đây (có unit test).
- P6 bấm từng ô theo thứ tự ngày → bữa, mỗi ô 2 lần, đổi dồn trên cùng plan; không kiểm thứ tự
  "giá gần nhất" hay vòng xoay đầy đủ (có unit test `plan-swap.test.ts`), không kiểm món chán
  (`excludeDishIds` rỗng), không kiểm `updatePlanItem`/`swapPlanMealForUser` (có test DB).
- **Không kiểm** lời hứa "≥1 món chay mỗi khối 7 ngày khi ngân sách cho phép" (spec chưa định nghĩa
  "ngân sách cho phép" đủ chính xác), không kiểm days ≥ 4 (biên tuần) ở chế độ nhanh, không kiểm
  `createPlanForUser` (lấy ứng viên, seed FNV-1a).
- Tính tất định theo seed: hàm thuần, không gọi `Math.random` — có unit test, không kiểm ở đây.

## Khi sửa code được bao phủ

Code được bao phủ: `packages/domain/src/planner.ts` (toàn bộ: `buildPlan`, `attemptBuild`,
`tryBuildDays`, `pickDish`, `findFirstDay`, `firstDayOptions`, `requiredDailyBudget`, `minCostFor`,
`chooseDish`), `packages/domain/src/plan-swap.ts` (`swapPlanMeal`), `packages/domain/src/diet.ts`
(`dishMatchesDiet`), `mealTypes` trong `packages/domain/src/contracts.ts`. Code mới ghi vào
`BuiltPlan`/`PlanDay` ở nơi khác cũng tính là được bao phủ.

1. Chạy `pnpm verify:planner` trước khi sửa, ghi kết quả (so với "Trạng thái nền").
2. Sửa code. Chạy lại. So số vi phạm từng thuộc tính.
3. Nếu lời hứa đổi **có chủ đích** (spec §6.2 / doc comment / test đổi theo): sửa thuộc tính trong
   script, ghi câu cũ → câu mới → bằng chứng vào mục dưới. Nếu không có bằng chứng ⇒ fail là bug.
4. Nếu thuật toán đổi hình dạng (thêm bước, đổi thứ tự) mà script vẫn xanh: phá thử code mới đúng
   kiểu thuộc tính canh (bỏ một kiểm tra, đảo một bước), xác nhận script bắt được, rồi bỏ phần phá.
   Các phá đã dùng (mỗi cái đều bị bắt): lúc tạo — cho vượt trần 1.000đ → P1; `blocked` bỏ
   `usedYesterday` → P1 "lặp món trong cửa sổ 2 ngày"; infeasible trả `totalVnd: 1` → P2; gợi ý
   thấp hơn 1.000đ → P3. Sau T22 — reserve không chặn món đang xét → P4; bỏ `firstDay` ở lượt
   `cheapest` → P4; `minCostFor` chỉ xét 1 món/bữa → P4+P5; `TWO_DAY_SLOTS = 3` → P4+P5.
   `ceilToStep` → làm tròn xuống KHÔNG bị script bắt (giá bội 1.000đ) — unit test "giá lẻ" bắt.
   T30 — `swapPlanMeal` bỏ kiểm trần ngày → P6 (41.486 trường hợp, "4000 > ngân sách 3000");
   `swapPlanMeal` chỉ chặn món hôm trước, không chặn hôm sau → P6 (81.282 trường hợp, "lặp món
   trong cửa sổ 2 ngày").

## Bản ghi đồng bộ

Repo chưa có git, nên mốc đồng bộ là SHA-256 của file được bao phủ. Chỉ cập nhật mốc sau khi đã
xác nhận script mô tả đúng code ở trạng thái mới (bước trên), kèm ngày.

Đồng bộ lần cuối: **2026-11-04** (sau T30) — kiểm bằng `shasum -a 256 <file>`:

```
71d623e39f4bfcfa7d77b0b6c9c42e272cd4fdf923a2fbbb50517d8396f76adb  packages/domain/src/planner.ts
fd1fdbce40e2e259ae4e42ca62481151f8aa425a7d662cb948d1e8efe40df60f  packages/domain/src/plan-swap.ts
435d8731c1cf488c16aed9d281c45805c38f1d3c7907acd6070f6699d1f7a6ea  packages/domain/src/diet.ts
8f8a3e2a33c5f2367f53e888d22e6e06a9a5c1072f4e156f38a4930bf4312d5d  packages/domain/src/contracts.ts
```

Hash khác ⇒ code đã đổi mà verification chưa được xem lại; làm các bước ở mục trên (hoặc
`/pstack:maintain-formal-verification-skill`). Khi repo có git, thay bằng commit hash.

Lịch sử thay đổi thuộc tính: (chưa có — T22 sửa code, không đổi lời hứa P1–P5)

- 2026-11-04 (T28): chỉ `plan.service.ts` đổi cách lấy ứng viên (loại món chán qua
  `excludeDishIds`). `planner.ts`, `diet.ts`, `contracts.ts` không đổi, ba hash trên vẫn khớp,
  `pnpm verify:planner` OK P1–P5.
- 2026-11-04 (T30): thêm P6 cho `swapPlanMeal` (file mới `plan-swap.ts`, hash ở trên). Lời hứa
  mới, không đổi P1–P5: đổi món giữ mọi điều kiện của P1. `planner.ts`, `diet.ts`,
  `contracts.ts` không đổi. Trước khi sửa: OK P1–P5 (463.680 lần, 17,6s). Sau: OK P1–P6 (463.680
  lần chạy, 452.426 lần đổi món, ~29s). Hai lần phá thử ở mục trên đều bị P6 bắt.
- 2026-11-04 (T30, vòng sửa sau review): `plan.service.ts` đọc thực đơn và ghi ô trong cùng một
  transaction; bốn file được bao phủ không đổi, bốn hash trên vẫn khớp. Ghi chú thêm: giới hạn
  `VERIFY_MAX_DISHES` < 6 không chạm plan nhiều ngày (mục Chạy).
