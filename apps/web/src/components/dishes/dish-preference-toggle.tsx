import type { DishCard, DishPreferenceKind, DishPreferences } from '@mam/db'
import type { TranslationKey } from '@mam/i18n'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { ThumbsDown, ThumbsUp, type LucideIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { usePreferences } from '@/components/preferences-provider'
import {
  createPreferenceSaver,
  nextKind,
  toPreferenceMap,
  type PreferenceMap,
} from '@/lib/dish-preferences'
import { cn } from '@/lib/utils'
import { listMyPreferences, setPreference } from '@/server/dish-preferences.functions'

const OPTIONS: Record<
  DishPreferenceKind,
  { icon: LucideIcon; label: TranslationKey; ariaLabel: TranslationKey; pressed: string }
> = {
  like: {
    icon: ThumbsUp,
    label: 'dishes.pref.like',
    ariaLabel: 'dishes.pref.likeLabel',
    pressed: 'border-primary bg-primary text-primary-foreground',
  },
  dislike: {
    icon: ThumbsDown,
    label: 'dishes.pref.dislike',
    ariaLabel: 'dishes.pref.dislikeLabel',
    pressed: 'border-foreground bg-foreground text-background',
  },
}

function withKind(map: PreferenceMap, dishId: string, kind: DishPreferenceKind | null) {
  const next = new Map(map)
  if (kind) next.set(dishId, kind)
  else next.delete(dishId)
  return next
}

const saverFor = (initial: DishPreferences | null) =>
  createPreferenceSaver(toPreferenceMap(initial), {
    save: (dishId, kind) => setPreference({ data: { dishId, kind } }),
    load: async () => toPreferenceMap(await listMyPreferences()),
  })

/**
 * Trạng thái thích/chán trên `/dishes`. `initial === null` là khách: bấm chỉ mời
 * đăng nhập, không gọi server và không ghi localStorage. UI đổi ngay; lưu lỗi thì
 * nút về đúng trạng thái trong DB (xem `createPreferenceSaver`).
 */
export function useDishPreferences(initial: DishPreferences | null) {
  const { t } = usePreferences()
  const navigate = useNavigate()
  const href = useLocation({ select: (location) => location.href })
  const [source, setSource] = useState(initial)
  const [kinds, setKinds] = useState(() => toPreferenceMap(initial))
  const [save, setSave] = useState(() => saverFor(initial))

  // Loader tải lại (vào lại trang, đăng nhập/đăng xuất) thì lấy dữ liệu server mới.
  if (source !== initial) {
    setSource(initial)
    setKinds(toPreferenceMap(initial))
    setSave(() => saverFor(initial))
  }

  const likedIds = useMemo(
    () =>
      initial === null
        ? undefined
        : new Set([...kinds].filter(([, kind]) => kind === 'like').map(([id]) => id)),
    [initial, kinds],
  )

  const inviteSignIn = () =>
    toast(t('dishes.pref.signIn'), {
      id: 'dish-pref-sign-in',
      action: {
        label: t('nav.login'),
        onClick: () => void navigate({ to: '/login', search: { redirect: href } }),
      },
    })

  const toggle = (dishId: string, clicked: DishPreferenceKind) => {
    if (initial === null) {
      inviteSignIn()
      return
    }

    const kind = nextKind(kinds.get(dishId) ?? null, clicked)
    setKinds((map) => withKind(map, dishId, kind))
    void save(dishId, kind).then((outcome) => {
      if (outcome.status === 'saved') return
      if (outcome.error === 'unauthorized') inviteSignIn()
      else toast.error(t('dishes.pref.error'))
      if (outcome.status === 'failed') {
        setKinds((map) => withKind(map, dishId, outcome.revertTo))
      }
    })
  }

  return { kinds, likedIds, toggle }
}

export function DishPreferenceToggle({
  dish,
  kind,
  onToggle,
}: {
  dish: DishCard
  kind: DishPreferenceKind | null
  onToggle: (clicked: DishPreferenceKind) => void
}) {
  const { locale, t } = usePreferences()
  const name = locale === 'vi' ? dish.nameVi : dish.nameEn

  return (
    <div className="flex gap-2">
      {(Object.keys(OPTIONS) as DishPreferenceKind[]).map((option) => {
        const { icon: Icon, label, ariaLabel, pressed } = OPTIONS[option]
        const active = kind === option

        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            aria-label={t(ariaLabel, { name })}
            data-testid={`dish-pref-${option}`}
            onClick={() => onToggle(option)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none',
              active
                ? pressed
                : 'border-border/80 bg-surface-sunken text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {t(label)}
          </button>
        )
      })}
    </div>
  )
}
