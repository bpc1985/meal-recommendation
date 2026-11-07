import '@/styles/globals.css'
import { DEFAULT_LOCALE, createTranslator } from '@mam/i18n'
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { PreferencesProvider, usePreferences } from '@/components/preferences-provider'
import { SiteFooter } from '@/components/site-footer'
import { SiteHeader } from '@/components/site-header'
import { Toaster } from '@/components/ui/sonner'
import { fetchSessionUser } from '@/server/auth.functions'
import { getPreferences } from '@/server/preferences.functions'

export const Route = createRootRoute({
  loader: async () => ({
    preferences: await getPreferences(),
    user: await fetchSessionUser(),
  }),
  head: ({ loaderData }) => {
    const t = createTranslator(loaderData?.preferences.locale ?? DEFAULT_LOCALE)

    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { title: t('meta.title') },
        { name: 'description', content: t('meta.description') },
        { name: 'color-scheme', content: 'light dark' },
      ],
      links: [{ rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
    }
  },
  component: RootComponent,
})

function RootComponent() {
  const { preferences, user } = Route.useLoaderData()

  return (
    <PreferencesProvider initial={preferences}>
      <RootDocument locale={preferences.locale} theme={preferences.theme}>
        <div className="flex min-h-dvh flex-col">
          <SkipLink />
          <SiteHeader user={user} />
          <main id="main" tabIndex={-1} className="flex-1">
            <Outlet />
          </main>
          <SiteFooter />
        </div>
        <Toaster position="top-center" />
      </RootDocument>
    </PreferencesProvider>
  )
}

function RootDocument({
  children,
  locale,
  theme,
}: Readonly<{ children: ReactNode; locale: string; theme: string }>) {
  return (
    <html lang={locale} className={theme === 'dark' ? 'dark' : undefined}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

/** Link đầu tiên trong tab order: nhảy thẳng tới <main>, hiện ra khi được focus. */
function SkipLink() {
  const { t } = usePreferences()

  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-xl focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:ring-2 focus:ring-ring focus:outline-none"
    >
      {t('nav.skipToContent')}
    </a>
  )
}
