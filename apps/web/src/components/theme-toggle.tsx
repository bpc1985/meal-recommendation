import { Button } from '@/components/ui/button'
import { Moon, Sun } from 'lucide-react'
import { usePreferences } from './preferences-provider'

export function ThemeToggle() {
  const { theme, setTheme, t } = usePreferences()
  const next = theme === 'dark' ? 'light' : 'dark'
  const label = next === 'dark' ? t('theme.dark') : t('theme.light')

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      onClick={() => setTheme(next)}
    >
      {theme === 'dark' ? (
        <Sun className="size-4" aria-hidden />
      ) : (
        <Moon className="size-4" aria-hidden />
      )}
    </Button>
  )
}
