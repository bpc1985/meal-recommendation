import { usePreferences } from '@/components/preferences-provider'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Send, Square } from 'lucide-react'

interface ChatComposerProps {
  value: string
  pending: boolean
  error: string | null
  onChange: (value: string) => void
  onSubmit: () => void
  onStop: () => void
}

export function ChatComposer({
  value,
  pending,
  error,
  onChange,
  onSubmit,
  onStop,
}: ChatComposerProps) {
  const { t } = usePreferences()
  const canSend = value.trim().length > 0 && !pending

  return (
    <div className="border-t border-border/70 p-3">
      {error ? (
        <p
          role="alert"
          className="mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (canSend) onSubmit()
        }}
        className="rounded-2xl border border-border/80 bg-background/80 p-1.5 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30"
      >
        <label htmlFor="chat-input" className="sr-only">
          {t('chat.inputLabel')}
        </label>
        <Textarea
          id="chat-input"
          value={value}
          rows={1}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              if (canSend) onSubmit()
            }
          }}
          placeholder={t('chat.placeholder')}
          className="max-h-40 min-h-11 resize-none border-0 bg-transparent px-2.5 py-2.5 shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
        />

        <div className="flex items-center justify-between gap-2 px-1 pb-0.5">
          <span className="hidden pl-1 text-xs text-muted-foreground sm:block">
            {t('chat.composerHint')}
          </span>

          {pending ? (
            <Button type="button" variant="secondary" onClick={onStop} className="rounded-xl">
              <Square className="size-3.5" aria-hidden />
              {t('chat.stop')}
            </Button>
          ) : (
            <Button type="submit" disabled={!canSend} className="rounded-xl">
              <Send className="size-4" aria-hidden />
              {t('chat.send')}
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
