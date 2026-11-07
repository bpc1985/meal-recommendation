import type { MealType } from '@mam/domain'
import type { TranslationKey } from '@mam/i18n'
import { useRouter } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { usePreferences } from '@/components/preferences-provider'
import type { PlanDetailItem } from '@/lib/plan-types'
import { createSwapAnchors } from '@/lib/swap-anchor'
import { swapPlanMeal } from '@/server/plan.functions'

export const MEAL_LABEL_KEY = {
  breakfast: 'meal.breakfast',
  lunch: 'meal.lunch',
  dinner: 'meal.dinner',
} as const satisfies Record<MealType, TranslationKey>

const cellKey = (item: Pick<PlanDetailItem, 'dayIndex' | 'mealType'>) =>
  `${item.dayIndex}-${item.mealType}`

/** Ô vừa đổi sáng lên chừng này rồi tắt (khớp animation `meal-swap-flash` trong globals.css). */
const SWAPPED_HIGHLIGHT_MS = 1_500

/**
 * Đổi món từng ô. Món gốc của mỗi ô (trước lần bấm đầu) được nhớ qua `createSwapAnchors`
 * và gửi kèm, nên bấm liên tiếp, kể cả sau khi tải lại trang, đi hết vòng xoay theo giá
 * gần món gốc thay vì nảy qua lại giữa hai món.
 */
export function useMealSwap(planId: string) {
  const { t, locale } = usePreferences()
  const router = useRouter()
  const anchors = useMemo(() => createSwapAnchors(planId, () => window.sessionStorage), [planId])
  // Ref chứ không phải state: hai cú bấm trong cùng một lần render phải thấy nhau ngay.
  const pendingRef = useRef<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [swapped, setSwapped] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')

  useEffect(() => {
    if (!swapped) return
    const timer = setTimeout(() => setSwapped(null), SWAPPED_HIGHLIGHT_MS)
    return () => clearTimeout(timer)
  }, [swapped])

  const nameOf = (item: Pick<PlanDetailItem, 'nameVi' | 'nameEn'>) =>
    locale === 'vi' ? item.nameVi : item.nameEn

  const describe = (item: PlanDetailItem) => ({
    meal: t(MEAL_LABEL_KEY[item.mealType]).toLocaleLowerCase(locale),
    day: item.dayIndex + 1,
  })

  const swap = async (item: PlanDetailItem) => {
    if (pendingRef.current) return
    const key = cellKey(item)
    pendingRef.current = key
    setPending(key)
    setSwapped(null)
    const anchorDishId = anchors.anchorFor(item, item.dishId)

    try {
      const result = await swapPlanMeal({
        data: { planId, dayIndex: item.dayIndex, mealType: item.mealType, anchorDishId },
      })

      if (result.ok) {
        await router.invalidate()
        setAnnouncement(t('plans.swap.done', { ...describe(item), dish: nameOf(result) }))
        setSwapped(key)
      } else if (result.error === 'no_alternative') {
        const message = t('plans.swap.noAlternative', describe(item))
        setAnnouncement(message)
        toast.info(message)
      } else {
        toast.error(t('plans.swap.failed'))
      }
    } catch {
      toast.error(t('plans.swap.failed'))
    } finally {
      pendingRef.current = null
      setPending(null)
    }
  }

  return {
    swap,
    announcement,
    isPending: (item: PlanDetailItem) => pending === cellKey(item),
    isSwapped: (item: PlanDetailItem) => swapped === cellKey(item),
    busy: pending !== null,
    nameOf,
    labelFor: (item: PlanDetailItem) =>
      t('plans.swap.label', { ...describe(item), dish: nameOf(item) }),
  }
}

export type MealSwap = ReturnType<typeof useMealSwap>

interface SwapMealButtonProps {
  item: PlanDetailItem
  swap: MealSwap
  testId: string
}

/**
 * SSR vẽ sẵn 2 nút cho mỗi ô (bảng desktop + accordion mobile), 180 nút cho thực đơn
 * 30 ngày: kiểu và icon nằm ở class `.meal-swap` dùng chung trong globals.css thay vì
 * chuỗi utility và SVG lặp lại trên từng nút.
 */
export function SwapMealButton({ item, swap, testId }: SwapMealButtonProps) {
  return (
    <button
      type="button"
      className="meal-swap"
      aria-label={swap.labelFor(item)}
      aria-busy={swap.isPending(item) || undefined}
      aria-disabled={swap.busy || undefined}
      data-swapped={swap.isSwapped(item) || undefined}
      onClick={() => void swap.swap(item)}
      data-testid={testId}
    >
      {swap.nameOf(item)}
    </button>
  )
}
