import { MEAL_LABEL_KEY } from '@/components/recommend/meal-card'
import { usePreferences } from '@/components/preferences-provider'
import type { ChatDish } from '@/lib/chat-types'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight } from 'lucide-react'

/**
 * Dish card inside chat. Names and prices come from the server `meta` payload
 * (read from the database), never parsed out of AI text.
 */
export function ChatDishCard({ dish }: { dish: ChatDish }) {
  const { locale, t, formatMoney } = usePreferences()
  const name = locale === 'vi' ? dish.nameVi : dish.nameEn

  return (
    <Link
      to="/recommend"
      data-testid="chat-dish-card"
      data-dish-id={dish.id}
      data-price-vnd={dish.priceVnd}
      className="group flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-background/70 px-3 py-2.5 no-underline transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-foreground">{name}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {dish.mealTypes.map((mealType) => t(MEAL_LABEL_KEY[mealType])).join(' · ')}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        <span className="tabular text-sm font-semibold text-foreground">
          {formatMoney(dish.priceVnd)}
        </span>
        <ArrowUpRight
          className="size-3.5 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          aria-hidden
        />
      </span>
    </Link>
  )
}
