import { usePreferences } from './preferences-provider'

export function SiteFooter() {
  const { t } = usePreferences()

  return (
    <footer className="mt-auto border-t border-border/60">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>
          {t('app.name')} · {t('app.tagline')}
        </p>
        <p className="text-xs">{t('common.sampleData', { count: 100 })}</p>
      </div>
    </footer>
  )
}
