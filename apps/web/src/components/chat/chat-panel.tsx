import type { TranslationKey } from '@mam/i18n'
import { Link } from '@tanstack/react-router'
import { ArrowRight, MessageSquarePlus, Sparkles, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { usePreferences } from '@/components/preferences-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { readChatStream } from '@/lib/chat-stream'
import type { ChatThreadSummary, ChatUiMessage } from '@/lib/chat-types'
import { clearChatHistory, loadChatHistory, saveChatHistory } from '@/lib/local-history'
import { deleteChatThread, getChatThread, listChatThreads } from '@/server/chat.functions'
import { ChatComposer } from './chat-composer'
import { ChatMessageView } from './chat-message'
import { ChatThreadList } from './chat-thread-list'

const SAMPLE_KEYS = [
  'chat.sample.student',
  'chat.sample.vegetarian',
  'chat.sample.dinner',
] as const satisfies readonly TranslationKey[]

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `msg-${Date.now()}-${Math.random()}`
}

interface ChatPanelProps {
  signedIn: boolean
  initialThreads: ChatThreadSummary[]
}

export function ChatPanel({ signedIn, initialThreads }: ChatPanelProps) {
  const { t, locale } = usePreferences()

  const [messages, setMessages] = useState<ChatUiMessage[]>([])
  const [threads, setThreads] = useState<ChatThreadSummary[]>(initialThreads)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [openingThread, setOpeningThread] = useState(false)
  const [input, setInput] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  // Khách: localStorage. User: mở lại thread mới nhất từ server (chỉ lần mount đầu).
  useEffect(() => {
    if (!signedIn) {
      setMessages(loadChatHistory(window.localStorage))
      setHydrated(true)
      return
    }

    const newest = initialThreads[0]
    if (!newest) {
      setHydrated(true)
      return
    }

    let cancelled = false
    setOpeningThread(true)

    void getChatThread({ data: { threadId: newest.id } })
      .then((view) => {
        if (cancelled || !view) return
        setMessages(view.messages)
        setThreadId(view.thread.id)
      })
      .finally(() => {
        if (cancelled) return
        setOpeningThread(false)
        setHydrated(true)
      })

    return () => {
      cancelled = true
    }
  }, [signedIn, initialThreads])

  useEffect(() => {
    if (!hydrated || signedIn) return

    if (messages.length === 0) {
      clearChatHistory(window.localStorage)
      return
    }

    saveChatHistory(window.localStorage, messages)
  }, [hydrated, messages, signedIn])

  useEffect(() => {
    const node = logRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages])

  const refreshThreads = useCallback(async () => {
    try {
      setThreads(await listChatThreads())
    } catch {
      // Sidebar lỗi không được chặn chat; danh sách cũ vẫn dùng được.
    }
  }, [])

  const openThread = async (id: string) => {
    if (pending || id === threadId) return

    setOpeningThread(true)
    setError(null)

    try {
      const view = await getChatThread({ data: { threadId: id } })

      if (view) {
        setMessages(view.messages)
        setThreadId(view.thread.id)
      } else {
        toast.error(t('chat.threadMissing'))
        void refreshThreads()
      }
    } catch {
      toast.error(t('chat.error'))
    } finally {
      setOpeningThread(false)
    }
  }

  const startNewThread = () => {
    if (pending) return

    setMessages([])
    setThreadId(null)
    setError(null)
  }

  const send = async (raw: string) => {
    const content = raw.trim()
    if (!content || pending) return

    const userMessage: ChatUiMessage = { id: newId(), role: 'user', content }
    const assistantId = newId()
    const history = [...messages, userMessage]

    setMessages([...history, { id: assistantId, role: 'assistant', content: '' }])
    setInput('')
    setError(null)
    setPending(true)

    const wireMessages = history
      .filter((message) => message.content.trim().length > 0)
      .slice(-20)
      .map(({ role, content: text }) => ({ role, content: text }))

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: wireMessages,
          context: { locale },
          locale,
          ...(threadId ? { threadId } : {}),
        }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null
        throw new Error(payload?.message ?? t('chat.error'))
      }

      if (!response.body) throw new Error(t('chat.error'))

      await readChatStream(response.body, (event) => {
        if (event.type === 'thread') {
          setThreadId(event.threadId)
        }

        if (event.type === 'text') {
          setMessages((previous) =>
            previous.map((message) =>
              message.id === assistantId
                ? { ...message, content: message.content + event.text }
                : message,
            ),
          )
        }

        if (event.type === 'meta') {
          setMessages((previous) =>
            previous.map((message) =>
              message.id === assistantId
                ? { ...message, dishes: event.dishes, degraded: event.degraded }
                : message,
            ),
          )
        }
      })

      if (signedIn) await refreshThreads()
    } catch (caught) {
      if (controller.signal.aborted) {
        // User pressed Stop: keep partial text, drop an empty bubble.
        setMessages((previous) =>
          previous.filter((message) => message.id !== assistantId || message.content.length > 0),
        )
        if (signedIn) void refreshThreads()
        return
      }

      const message = caught instanceof Error ? caught.message : t('chat.error')
      setError(message)
      setMessages((previous) =>
        previous.map((item) =>
          item.id === assistantId && item.content.trim().length === 0
            ? { ...item, content: t('chat.error') }
            : item,
        ),
      )
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setPending(false)
    }
  }

  const stop = () => {
    abortRef.current?.abort()
  }

  const clear = () => {
    abortRef.current?.abort()
    setMessages([])
    setError(null)

    if (!signedIn) {
      clearChatHistory(window.localStorage)
      toast.success(t('chat.cleared'))
      return
    }

    const target = threadId
    setThreadId(null)

    if (!target) {
      toast.success(t('chat.clearedSaved'))
      return
    }

    void deleteChatThread({ data: { threadId: target } })
      .then((result) => {
        if (result.ok) {
          toast.success(t('chat.clearedSaved'))
          void refreshThreads()
        } else {
          toast.error(t('chat.clearedError'))
        }
      })
      .catch(() => toast.error(t('chat.clearedError')))
  }

  return (
    <div className="mt-5 grid gap-4 sm:mt-8 lg:grid-cols-[minmax(0,1fr)_300px]">
      <Card className="flex h-[calc(100dvh-260px)] min-h-[420px] flex-col overflow-hidden rounded-3xl border-border/70 shadow-sm sm:h-[min(72vh,680px)]">
        <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-2.5">
          <span className="flex items-center gap-2 text-sm font-medium">
            <MessageSquarePlus className="size-4 text-primary" aria-hidden />
            {t('nav.chat')}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clear}
            disabled={messages.length === 0 || pending}
            className="rounded-xl"
            data-testid="chat-clear"
          >
            <Trash2 className="size-4" aria-hidden />
            {t('chat.clear')}
          </Button>
        </div>

        <div
          ref={logRef}
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-label={t('chat.title')}
          aria-busy={pending || openingThread}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
        >
          {openingThread && messages.length === 0 ? (
            <div className="space-y-3" data-testid="chat-thread-loading">
              <Skeleton className="ml-auto h-10 w-2/3 rounded-2xl" />
              <Skeleton className="h-20 w-3/4 rounded-2xl" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 py-8 text-center">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
                <Sparkles className="size-5" aria-hidden />
              </div>
              <div>
                <p className="text-base font-medium">{t('chat.empty.title')}</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  {t('chat.empty.hint')}
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 lg:hidden">
                {SAMPLE_KEYS.map((key) => (
                  <Button
                    key={key}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto max-w-full rounded-full py-1.5 text-left whitespace-normal"
                    onClick={() => void send(t(key))}
                  >
                    {t(key)}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <ol className="flex list-none flex-col gap-3 p-0">
              {messages.map((message) => (
                <ChatMessageView key={message.id} message={message} />
              ))}
            </ol>
          )}
        </div>

        <ChatComposer
          value={input}
          pending={pending}
          error={error}
          onChange={setInput}
          onSubmit={() => void send(input)}
          onStop={stop}
        />
      </Card>

      <aside className="flex flex-col gap-3">
        <ChatThreadList
          signedIn={signedIn}
          threads={threads}
          activeId={threadId}
          loading={openingThread}
          disabled={pending}
          onSelect={(id) => void openThread(id)}
          onNew={startNewThread}
        />

        <Card className="rounded-2xl border-border/70 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm">{t('chat.samples.title')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-stretch gap-2">
            {SAMPLE_KEYS.map((key) => (
              <Button
                key={key}
                type="button"
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => void send(t(key))}
                className="h-auto justify-start rounded-xl px-2.5 py-2 text-left whitespace-normal"
              >
                {t(key)}
              </Button>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border/70 bg-surface-sunken shadow-none">
          <CardContent className="space-y-3 text-sm">
            <p className="flex items-start gap-2">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              {t('chat.disclaimer')}
            </p>
            <p className="text-xs text-muted-foreground">
              {signedIn ? t('chat.accountNote') : t('chat.localNote')}
            </p>
            <Link
              to="/recommend"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {t('chat.dishCta')}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </CardContent>
        </Card>
      </aside>
    </div>
  )
}
