import { Link } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { usePreferences } from '@/components/preferences-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import type { ChatThreadSummary } from '@/lib/chat-types'
import { cn } from '@/lib/utils'

interface ChatThreadListProps {
  signedIn: boolean
  threads: ChatThreadSummary[]
  activeId: string | null
  loading: boolean
  disabled: boolean
  onSelect: (threadId: string) => void
  onNew: () => void
}

/** Sidebar hội thoại: khách thấy lời mời đăng nhập, user thấy thread đã lưu. */
export function ChatThreadList({
  signedIn,
  threads,
  activeId,
  loading,
  disabled,
  onSelect,
  onNew,
}: ChatThreadListProps) {
  const { t, formatDateTime } = usePreferences()

  return (
    <Card className="rounded-2xl border-border/70 shadow-sm" data-testid="chat-thread-list">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm">{t('chat.threads.title')}</CardTitle>
        {signedIn ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="rounded-xl"
            data-testid="chat-new-thread"
            onClick={onNew}
            disabled={disabled}
          >
            <Plus className="size-4" aria-hidden />
            {t('chat.threads.new')}
          </Button>
        ) : null}
      </CardHeader>

      <CardContent>
        {!signedIn ? (
          <div className="space-y-2" data-testid="chat-guest-note">
            <p className="text-xs text-muted-foreground">{t('chat.threads.guest')}</p>
            <Button asChild size="sm" variant="outline" className="rounded-xl">
              <Link to="/login" search={{ redirect: '/chat' }}>
                {t('chat.threads.signIn')}
              </Link>
            </Button>
          </div>
        ) : loading ? (
          <div className="space-y-2" aria-busy>
            <Skeleton className="h-8 w-full rounded-lg" />
            <Skeleton className="h-8 w-full rounded-lg" />
          </div>
        ) : threads.length === 0 ? (
          <p className="text-xs text-muted-foreground" data-testid="chat-threads-empty">
            {t('chat.threads.empty')}
          </p>
        ) : (
          <ul className="flex list-none flex-col gap-1 p-0">
            {threads.map((thread) => {
              const active = thread.id === activeId

              return (
                <li key={thread.id}>
                  <button
                    type="button"
                    aria-current={active ? 'true' : undefined}
                    data-testid={`chat-thread-item-${thread.id}`}
                    data-thread-title={thread.title}
                    disabled={disabled}
                    onClick={() => onSelect(thread.id)}
                    className={cn(
                      'w-full rounded-xl px-2.5 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60',
                      active
                        ? 'bg-accent text-accent-foreground'
                        : 'hover:bg-surface-sunken text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <span className="block truncate text-sm font-medium">{thread.title}</span>
                    <span className="tabular mt-0.5 block text-[11px] text-muted-foreground">
                      {formatDateTime(thread.updatedAt)}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
