import { createFileRoute } from '@tanstack/react-router'
import { ChatPanel } from '@/components/chat/chat-panel'
import { usePreferences } from '@/components/preferences-provider'
import { fetchSessionUser } from '@/server/auth.functions'
import { listChatThreads } from '@/server/chat.functions'

export const Route = createFileRoute('/chat')({
  // Server biết user nên sidebar có thread ngay từ lần render đầu, không nháy rỗng.
  loader: async () => {
    const user = await fetchSessionUser()

    return {
      signedIn: user !== null,
      threads: user ? await listChatThreads() : [],
    }
  },
  component: ChatPage,
})

function ChatPage() {
  const { t } = usePreferences()
  const { signedIn, threads } = Route.useLoaderData()

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-6 sm:py-10 lg:py-14">
      <header className="max-w-2xl">
        <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
          {t('nav.chat')}
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
          {t('chat.title')}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground sm:mt-3 sm:text-base">
          {t('chat.subtitle')}
        </p>
      </header>

      <ChatPanel signedIn={signedIn} initialThreads={threads} />
    </div>
  )
}
