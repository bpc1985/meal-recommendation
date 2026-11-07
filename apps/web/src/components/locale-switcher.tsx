import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Check, Languages } from 'lucide-react'
import { usePreferences } from './preferences-provider'
import { locales, type Locale } from '@mam/i18n'

const LABEL_KEY = { vi: 'locale.vi', en: 'locale.en' } as const

export function LocaleSwitcher() {
  const { locale, setLocale, t } = usePreferences()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('locale.label')}>
          <Languages className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuLabel>{t('locale.label')}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {locales.map((item: Locale) => (
          <DropdownMenuItem key={item} onSelect={() => setLocale(item)} className="gap-2">
            <Check
              className={item === locale ? 'size-4 opacity-100' : 'size-4 opacity-0'}
              aria-hidden
            />
            {t(LABEL_KEY[item])}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
