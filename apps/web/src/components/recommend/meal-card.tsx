import type { TranslationKey } from '@mam/i18n'
import type { MealSuggestion, MealType } from '@mam/domain'
import { UtensilsCrossed } from 'lucide-react'
import { usePreferences } from '@/components/preferences-provider'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export const MEAL_LABEL_KEY = {
  breakfast: 'meal.breakfast',
  lunch: 'meal.lunch',
  dinner: 'meal.dinner',
} as const satisfies Record<MealType, TranslationKey>

export function MealCard({ meal }: { meal: MealSuggestion }) {
  const { locale, t, formatMoney } = usePreferences()
  const name = locale === 'vi' ? meal.nameVi : meal.nameEn
  const reason = locale === 'vi' ? meal.reasonVi : meal.reasonEn

  return (
    <Card className="h-full rounded-2xl border-border/70 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary" className="rounded-full">
            {t(MEAL_LABEL_KEY[meal.mealType])}
          </Badge>
          <span className="tabular text-sm font-semibold">{formatMoney(meal.priceVnd)}</span>
        </div>
        <CardTitle className="mt-2 text-lg leading-snug">{name}</CardTitle>
      </CardHeader>
      {reason ? (
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">{reason}</p>
        </CardContent>
      ) : null}
    </Card>
  )
}

export function MissingMealCard({ mealType }: { mealType: MealType }) {
  const { t } = usePreferences()

  return (
    <Card className="h-full rounded-2xl border-dashed border-border bg-surface-sunken shadow-none">
      <CardHeader>
        <Badge variant="outline" className="w-fit rounded-full">
          {t(MEAL_LABEL_KEY[mealType])}
        </Badge>
        <CardTitle className="mt-2 flex items-center gap-2 text-base text-muted-foreground">
          <UtensilsCrossed className="size-4" aria-hidden />
          {t('recommend.missing', { meal: t(MEAL_LABEL_KEY[mealType]) })}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{t('recommend.missingHint')}</p>
      </CardContent>
    </Card>
  )
}
