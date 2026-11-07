import { usePreferences } from '@/components/preferences-provider'
import type { ChatUiMessage } from '@/lib/chat-types'
import { cn } from '@/lib/utils'
import { TriangleAlert } from 'lucide-react'
import { ChatDishCard } from './chat-dish-card'

function TypingDots({ label }: { label: string }) {
  return (
    <span role="status" aria-label={label} className="flex items-center gap-1.5 py-1.5">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1.5 animate-bounce rounded-full bg-current opacity-60 motion-reduce:animate-none"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  )
}

export function ChatMessageView({ message }: { message: ChatUiMessage }) {
  const { t } = usePreferences()
  const isUser = message.role === 'user'
  const isEmpty = message.content.trim().length === 0

  return (
    <li className={cn('flex', isUser ? 'justify-end' : 'justify-start')} data-role={message.role}>
      <div
        className={cn(
          'max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm',
          isUser
            ? 'rounded-br-md bg-primary text-primary-foreground'
            : 'rounded-bl-md border border-border/70 bg-card text-card-foreground shadow-sm',
        )}
      >
        <span className="sr-only">{isUser ? t('chat.you') : t('chat.assistant')}</span>

        {isEmpty ? (
          <TypingDots label={t('chat.thinking')} />
        ) : (
          <p className="leading-relaxed whitespace-pre-wrap" data-message-content>
            {message.content}
          </p>
        )}

        {message.dishes && message.dishes.length > 0 ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {message.dishes.map((dish) => (
              <ChatDishCard key={dish.id} dish={dish} />
            ))}
          </div>
        ) : null}

        {message.degraded ? (
          <p
            role="status"
            className="mt-3 flex items-start gap-2 rounded-lg bg-budget-warn/15 px-2.5 py-2 text-xs text-foreground"
          >
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-budget-warn" aria-hidden />
            {t('chat.degraded')}
          </p>
        ) : null}
      </div>
    </li>
  )
}
