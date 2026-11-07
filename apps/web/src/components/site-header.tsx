import type { PublicUser } from '@/server/auth.service'
import { Link, useRouter } from '@tanstack/react-router'
import { LayoutGrid, LogOut, Menu, Settings, Utensils } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { LocaleSwitcher } from './locale-switcher'
import { usePreferences } from './preferences-provider'
import { ThemeToggle } from './theme-toggle'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { logout } from '@/server/auth.functions'

const NAV_ITEMS = [
  { to: '/recommend', key: 'nav.recommend' },
  { to: '/dishes', key: 'nav.dishes' },
  { to: '/chat', key: 'nav.chat' },
  { to: '/plans', key: 'nav.plans' },
  { to: '/history', key: 'nav.history' },
] as const

/** First letter of display name/email, used by the round avatar. */
function initialOf(user: PublicUser): string {
  const source = user.displayName?.trim() || user.email
  return source.charAt(0).toUpperCase()
}

export function SiteHeader({ user }: { user: PublicUser | null }) {
  const { t } = usePreferences()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleLogout() {
    await logout()
    setMenuOpen(false)
    await router.invalidate()
    await router.navigate({ to: '/' })
    toast.success(t('auth.loggedOut'))
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-3 px-4 sm:px-6">
        <Link
          to="/"
          className="flex items-center gap-2 rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Utensils className="size-4" aria-hidden />
          </span>
          <span className="text-[17px] font-semibold tracking-tight">{t('app.name')}</span>
        </Link>

        <nav aria-label={t('nav.main')} className="ml-4 hidden items-center gap-1 lg:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className="rounded-lg px-3 py-2 text-sm whitespace-nowrap text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              activeProps={{ className: 'bg-accent text-accent-foreground font-medium' }}
            >
              {t(item.key)}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <LocaleSwitcher />
          <ThemeToggle />

          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="ml-1 gap-2 pr-2">
                  <span
                    aria-hidden
                    className="grid size-7 place-items-center rounded-full bg-primary/12 text-xs font-semibold text-primary"
                  >
                    {initialOf(user)}
                  </span>
                  <span className="sr-only sm:not-sr-only">
                    <span className="block max-w-32 truncate text-sm">
                      {user.displayName ?? user.email}
                    </span>
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel>
                  <span className="block truncate text-sm font-medium text-foreground">
                    {t('auth.loggedInAs', { name: user.displayName ?? user.email })}
                  </span>
                  <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">
                    {user.email}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/settings">
                    <Settings className="size-4" aria-hidden />
                    {t('nav.settings')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/plans">
                    <LayoutGrid className="size-4" aria-hidden />
                    {t('nav.plans')}
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void handleLogout()}>
                  <LogOut className="size-4" aria-hidden />
                  {t('nav.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="ml-1 hidden items-center gap-2 sm:flex">
              <Button asChild size="sm" variant="ghost">
                <Link to="/login">{t('nav.login')}</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/register">{t('nav.register')}</Link>
              </Button>
            </div>
          )}

          <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                aria-label={t('nav.openMenu')}
              >
                <Menu className="size-5" aria-hidden />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader>
                <SheetTitle>{t('app.name')}</SheetTitle>
              </SheetHeader>
              <nav aria-label={t('nav.main')} className="mt-6 flex flex-col gap-1">
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-lg px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    activeProps={{ className: 'bg-accent text-accent-foreground font-medium' }}
                  >
                    {t(item.key)}
                  </Link>
                ))}

                {user ? (
                  <>
                    <Link
                      to="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="mt-2 rounded-lg border border-border px-3 py-3 text-sm font-medium"
                    >
                      {t('nav.settings')}
                    </Link>
                    <button
                      type="button"
                      onClick={() => void handleLogout()}
                      className="rounded-lg px-3 py-3 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      {t('nav.logout')}
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      to="/login"
                      onClick={() => setMenuOpen(false)}
                      className="mt-2 rounded-lg border border-border px-3 py-3 text-sm font-medium"
                    >
                      {t('nav.login')}
                    </Link>
                    <Link
                      to="/register"
                      onClick={() => setMenuOpen(false)}
                      className="rounded-lg bg-primary px-3 py-3 text-center text-sm font-medium text-primary-foreground"
                    >
                      {t('nav.register')}
                    </Link>
                  </>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
