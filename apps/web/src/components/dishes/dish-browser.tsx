import type { DishCard } from '@mam/db'
import { mealTypes, type MealType } from '@mam/domain'
import { dictionaries, type TranslationKey, type Translator } from '@mam/i18n'
import { SearchX, ThumbsUp } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePreferences } from '@/components/preferences-provider'
import { MEAL_LABEL_KEY } from '@/components/recommend/meal-card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  EMPTY_DISH_FILTER,
  PRICE_MAX,
  filterDishes,
  parsePrice,
  toDishFilter,
  toDishSearch,
  type DishFilter,
} from '@/lib/dish-filter'
import { cn } from '@/lib/utils'

/** Ô gõ ghi URL trễ chừng này: gõ phím chỉ lọc tại chỗ, không đi qua router. */
const URL_WRITE_DELAY_MS = 300

type TextField = 'q' | 'minPrice' | 'maxPrice'
const TEXT_FIELDS: readonly TextField[] = ['q', 'minPrice', 'maxPrice']

function isTranslationKey(key: string): key is TranslationKey {
  return Object.hasOwn(dictionaries.vi, key)
}

/** Nhãn dịch theo khoá; tag mới trong DB chưa có bản dịch thì hiện nguyên slug. */
function labelOr(t: Translator, key: string, fallback: string): string {
  return isTranslationKey(key) ? t(key) : fallback
}

/** Tag phổ biến đứng trước để chip hay dùng nằm trong tầm mắt. */
function tagsByFrequency(dishes: readonly DishCard[]): string[] {
  const counts = new Map<string, number>()
  for (const dish of dishes) {
    for (const tag of dish.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.keys()].sort(
    (a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b),
  )
}

/** Giá trị một ô gõ sẽ nằm trên URL, dạng chuỗi để so sánh: "  pho " → "pho", "20.000" → "20000". */
function urlText(field: TextField, value: DishFilter[TextField]): string {
  const stored = toDishFilter(toDishSearch({ ...EMPTY_DISH_FILTER, [field]: value }))[field]
  return stored === null ? '' : String(stored)
}

type Drafts = Record<TextField, string>

const EMPTY_DRAFTS: Drafts = { q: '', minPrice: '', maxPrice: '' }

function urlTexts(filter: DishFilter): Drafts {
  return {
    q: urlText('q', filter.q),
    minPrice: urlText('minPrice', filter.minPrice),
    maxPrice: urlText('maxPrice', filter.maxPrice),
  }
}

const chipClass = (active: boolean) =>
  cn(
    'shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
    active
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-border/80 bg-surface-sunken text-muted-foreground hover:text-foreground',
  )

export interface DishBrowserProps {
  dishes: readonly DishCard[]
  /** Filter đang nằm trên URL. */
  filter: DishFilter
  /** Ghi một phần filter lên URL; `replace` để nút back không phải lùi từng lần gõ. */
  onFilterChange: (patch: Partial<DishFilter>, options: { replace: boolean }) => void
  /** Chỗ gắn nút hành động dưới mỗi thẻ (vd. thích/chán). */
  renderActions?: (dish: DishCard) => ReactNode
  /** Món user đăng nhập đã thích; có thì hiện filter "Chỉ món thích", khách thì bỏ trống. */
  likedIds?: ReadonlySet<string>
}

export function DishBrowser({
  dishes,
  filter,
  onFilterChange,
  renderActions,
  likedIds,
}: DishBrowserProps) {
  const { t, formatCount } = usePreferences()
  const allTags = useMemo(() => tagsByFrequency(dishes), [dishes])
  const maxCatalogPrice = useMemo(
    () => dishes.reduce((max, dish) => Math.max(max, dish.priceVnd), 0),
    [dishes],
  )
  const searchRef = useRef<HTMLInputElement>(null)

  const pending = useRef<Partial<DishFilter>>({})
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const lastTypedField = useRef<TextField | null>(null)

  const urlValues = urlTexts(filter)
  const display = (field: TextField, value: string) =>
    field === 'q' || value === '' ? value : formatCount(Number(value))
  const [drafts, setDrafts] = useState<Drafts>(() => ({
    q: urlValues.q,
    minPrice: display('minPrice', urlValues.minPrice),
    maxPrice: display('maxPrice', urlValues.maxPrice),
  }))
  /** Giá trị URL lần cuối các ô tự ghi; URL đổi sang giá trị khác là đổi từ bên ngoài. */
  const written = useRef(urlValues)

  // Ô nhập giữ bản nháp riêng ("20.000", dấu cách cuối) và chỉ đi theo URL khi URL
  // đổi từ bên ngoài (back/forward), không phải khi URL bắt kịp chính lần ghi trễ.
  useEffect(() => {
    const external = TEXT_FIELDS.filter((field) => urlValues[field] !== written.current[field])
    if (external.length === 0) return
    written.current = urlValues
    setDrafts((prev) => {
      const next = { ...prev }
      for (const field of external) next[field] = display(field, urlValues[field])
      return next
    })
    clearTimeout(timer.current)
    pending.current = {}
    lastTypedField.current = null
    // Chỉ URL đổi mới chạy lại; đổi ngôn ngữ (`display`) không ghi đè bản nháp đang gõ.
  }, [urlValues.q, urlValues.minPrice, urlValues.maxPrice])

  const minPrice = parsePrice(drafts.minPrice)
  const maxPrice = parsePrice(drafts.maxPrice)
  const isInvalid = (field: 'minPrice' | 'maxPrice') =>
    drafts[field].trim() !== '' && parsePrice(drafts[field]) === null

  const query = drafts.q
  const visible = useMemo(
    () => filterDishes(dishes, { ...filter, q: query, minPrice, maxPrice }, likedIds),
    [dishes, filter, query, minPrice, maxPrice, likedIds],
  )

  const listRef = useRef<HTMLUListElement>(null)
  const countRef = useRef<HTMLParagraphElement>(null)
  /** Món đang chứa focus trong lưới, và danh sách lần vẽ trước để biết thẻ đó đứng đâu. */
  const focusedDishId = useRef<string | null>(null)
  const previousVisible = useRef(visible)

  // Thẻ đang focus rời khỏi danh sách (vd. bỏ thích khi đang lọc món thích) thì focus
  // rơi về <body> (WCAG 2.4.3): đưa sang thẻ đứng vào chỗ đó, hết thẻ thì về số món.
  useLayoutEffect(() => {
    const previous = previousVisible.current
    previousVisible.current = visible
    const id = focusedDishId.current
    if (id === null || visible.some((dish) => dish.id === id)) return
    focusedDishId.current = null
    if (document.activeElement !== document.body) return
    const index = Math.min(
      previous.findIndex((dish) => dish.id === id),
      visible.length - 1,
    )
    const target = index < 0 ? null : listRef.current?.children[index]?.querySelector('button')
    ;(target ?? countRef.current)?.focus()
  }, [visible])

  const flush = (patch: Partial<DishFilter>, replace: boolean) => {
    clearTimeout(timer.current)
    const next = { ...pending.current, ...patch }
    pending.current = {}
    for (const field of TEXT_FIELDS) {
      if (field in next) written.current[field] = urlText(field, next[field] ?? null)
    }
    onFilterChange(next, { replace })
  }

  /** Lần ghi đầu của một đợt gõ thêm mục lịch sử; các lần sau trong cùng ô thì thay thế. */
  const type = (field: TextField, text: string, value: DishFilter[TextField]) => {
    setDrafts((prev) => ({ ...prev, [field]: text }))
    pending.current = { ...pending.current, [field]: value }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const replace = lastTypedField.current === field
      lastTypedField.current = field
      flush({}, replace)
    }, URL_WRITE_DELAY_MS)
  }

  const pick = (patch: Partial<DishFilter>) => {
    lastTypedField.current = null
    flush(patch, false)
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  const toggleTag = (tag: string) =>
    pick({
      tags: filter.tags.includes(tag)
        ? filter.tags.filter((item) => item !== tag)
        : [...filter.tags, tag],
    })

  const clearFilters = () => {
    setDrafts(EMPTY_DRAFTS)
    pick(EMPTY_DISH_FILTER)
    // Nút vừa bấm biến mất cùng bộ lọc; đưa focus về ô tìm thay vì rơi về <body>.
    searchRef.current?.focus()
  }

  const hasFilter =
    query.trim() !== '' ||
    drafts.minPrice.trim() !== '' ||
    drafts.maxPrice.trim() !== '' ||
    filter.meal !== null ||
    filter.tags.length > 0 ||
    (filter.liked && likedIds !== undefined)

  const noLiked = filter.liked && likedIds?.size === 0

  const priceHint =
    isInvalid('minPrice') || isInvalid('maxPrice')
      ? t('dishes.filter.priceInvalid', { max: formatCount(PRICE_MAX) })
      : minPrice !== null && maxPrice !== null && minPrice > maxPrice
        ? t('dishes.filter.priceOrder')
        : null

  const priceInput = (field: 'minPrice' | 'maxPrice', id: string, placeholder: string) => (
    <Input
      id={id}
      inputMode="numeric"
      value={drafts[field]}
      placeholder={placeholder}
      aria-invalid={isInvalid(field) || undefined}
      aria-describedby={priceHint ? 'dish-price-hint' : undefined}
      onChange={(event) => type(field, event.target.value, parsePrice(event.target.value))}
    />
  )

  return (
    <div className="mt-8 grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="min-w-0 space-y-6">
        <div className="space-y-2">
          <Label htmlFor="dish-search">{t('dishes.search.label')}</Label>
          <Input
            ref={searchRef}
            id="dish-search"
            type="search"
            value={query}
            placeholder={t('dishes.search.placeholder')}
            autoComplete="off"
            onChange={(event) => type('q', event.target.value, event.target.value)}
          />
        </div>

        {likedIds ? (
          <button
            type="button"
            aria-pressed={filter.liked}
            data-testid="dish-liked-only"
            onClick={() => pick({ liked: !filter.liked })}
            className={cn(chipClass(filter.liked), 'inline-flex items-center gap-1.5')}
          >
            <ThumbsUp className="size-3.5" aria-hidden />
            {t('dishes.filter.liked')}
          </button>
        ) : null}

        <fieldset className="min-w-0 space-y-2">
          <legend className="text-sm font-medium">{t('dishes.filter.meal')}</legend>
          <div className="flex flex-wrap gap-2">
            {[null, ...mealTypes].map((meal: MealType | null) => (
              <button
                key={meal ?? 'all'}
                type="button"
                aria-pressed={filter.meal === meal}
                data-testid={`dish-meal-${meal ?? 'all'}`}
                onClick={() => pick({ meal })}
                className={chipClass(filter.meal === meal)}
              >
                {meal === null ? t('dishes.filter.allMeals') : t(MEAL_LABEL_KEY[meal])}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="min-w-0 space-y-2">
          <legend className="text-sm font-medium">{t('dishes.filter.price')}</legend>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dish-min-price" className="text-xs text-muted-foreground">
                {t('dishes.filter.minPrice')}
              </Label>
              {priceInput('minPrice', 'dish-min-price', '0')}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dish-max-price" className="text-xs text-muted-foreground">
                {t('dishes.filter.maxPrice')}
              </Label>
              {priceInput('maxPrice', 'dish-max-price', formatCount(maxCatalogPrice))}
            </div>
          </div>
          {priceHint ? (
            <p id="dish-price-hint" className="text-xs text-destructive">
              {priceHint}
            </p>
          ) : null}
        </fieldset>

        <fieldset className="min-w-0 space-y-2">
          <legend className="text-sm font-medium">{t('dishes.filter.tags')}</legend>
          <p className="text-xs text-muted-foreground">{t('dishes.filter.tagsHint')}</p>
          <div className="-mx-1 -mt-1 flex gap-2 overflow-x-auto p-1 lg:flex-wrap lg:overflow-visible">
            {allTags.map((tag) => {
              const active = filter.tags.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={active}
                  data-testid={`dish-tag-${tag}`}
                  onClick={() => toggleTag(tag)}
                  // Trên thanh cuộn ngang (mobile) chip đang chọn đứng đầu để luôn thấy.
                  className={cn(chipClass(active), active && 'order-first lg:order-none')}
                >
                  {labelOr(t, `dishTag.${tag}`, tag)}
                </button>
              )
            })}
          </div>
        </fieldset>
      </div>

      <section aria-labelledby="dish-results-title" className="min-w-0">
        <h2 id="dish-results-title" className="sr-only">
          {t('dishes.results')}
        </h2>
        <div className="flex min-h-9 items-center justify-between gap-3">
          <p
            ref={countRef}
            tabIndex={-1}
            role="status"
            data-testid="dish-count"
            className="text-sm font-medium text-muted-foreground"
          >
            {t(visible.length === 1 ? 'dishes.countOne' : 'dishes.count', {
              count: formatCount(visible.length),
            })}
          </p>
          {hasFilter ? (
            <Button variant="outline" size="sm" className="rounded-xl" onClick={clearFilters}>
              {t('dishes.clear')}
            </Button>
          ) : null}
        </div>

        {visible.length === 0 ? (
          <div
            data-testid="dish-empty"
            className="mt-4 rounded-2xl border border-dashed border-border/80 px-6 py-10 text-center"
          >
            <SearchX className="mx-auto size-8 text-muted-foreground" aria-hidden />
            <h3 className="mt-3 text-base font-semibold">
              {t(noLiked ? 'dishes.empty.noLikedTitle' : 'dishes.empty.title')}
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              {t(noLiked ? 'dishes.empty.noLiked' : 'dishes.empty.hint')}
            </p>
            <Button className="mt-5 rounded-xl" onClick={clearFilters}>
              {t('dishes.clear')}
            </Button>
          </div>
        ) : (
          <ul
            ref={listRef}
            className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
            onFocus={(event) => {
              focusedDishId.current =
                event.target.closest<HTMLElement>('[data-dish-id]')?.dataset.dishId ?? null
            }}
          >
            {visible.map((dish) => (
              <DishTile key={dish.id} dish={dish} actions={renderActions?.(dish)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/** Một thẻ món, tối giản thẻ HTML vì trang vẽ sẵn cả danh mục (kiểu ở `.dish-card`). */
export function DishTile({ dish, actions }: { dish: DishCard; actions?: ReactNode }) {
  const { locale, t, formatMoney } = usePreferences()
  const description = locale === 'vi' ? dish.descVi : dish.descEn
  const fill = labelOr(t, `dishes.fill.${dish.fillLevel}`, '')

  return (
    <li data-testid={`dish-card-${dish.slug}`} data-dish-id={dish.id} className="dish-card">
      <div className="head">
        <h3 data-testid="dish-name">{locale === 'vi' ? dish.nameVi : dish.nameEn}</h3>
        <span data-testid="dish-price" className="price">
          {formatMoney(dish.priceVnd)}
        </span>
      </div>
      <p className="meals">{dish.mealTypes.map((meal) => t(MEAL_LABEL_KEY[meal])).join(' · ')}</p>
      {description ? <p className="desc">{description}</p> : null}
      {dish.tags.length > 0 ? (
        <p data-testid="dish-tags">
          {dish.tags.map((tag) => labelOr(t, `dishTag.${tag}`, tag)).join(' · ')}
        </p>
      ) : null}
      <p className="meta">
        {[t('dishes.prep', { minutes: dish.prepMinutes }), fill].filter(Boolean).join(' · ')}
      </p>
      {actions ? <div className="actions">{actions}</div> : null}
    </li>
  )
}
