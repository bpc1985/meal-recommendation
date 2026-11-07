import { Copy, Download, FileSpreadsheet, Printer, Table } from 'lucide-react'
import { toast } from 'sonner'
import { usePreferences } from '@/components/preferences-provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  buildPlanCsv,
  buildPlanMarkdown,
  planFileName,
  type PlanExportFormat,
  type PlanExportInput,
} from '@/lib/plan-export'
import { buildPlanXlsx } from '@/lib/plan-xlsx'
import type { PlanDetailItem, PlanSummary } from '@/lib/plan-types'

interface PlanExportMenuProps {
  plan: PlanSummary
  items: PlanDetailItem[]
}

export function PlanExportMenu({ plan, items }: PlanExportMenuProps) {
  const { t, locale, formatMoney, formatDay } = usePreferences()

  const exportInput: PlanExportInput = {
    title: plan.title,
    startDate: plan.startDate,
    days: plan.days,
    dailyBudgetVnd: plan.dailyBudgetVnd,
    items,
    locale,
    t,
    formatMoney,
    formatDay,
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildPlanMarkdown(exportInput))
      toast.success(t('plans.export.copied'))
    } catch {
      toast.error(t('plans.export.copyFailed'))
    }
  }

  const saveFile = (blob: Blob, format: PlanExportFormat) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = planFileName(plan.title, plan.startDate, format)
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  /** BOM để Excel/Word trên Windows nhận đúng UTF-8 và không phá dấu tiếng Việt. */
  const handleDownloadMarkdown = () =>
    saveFile(
      new Blob(['\uFEFF', buildPlanMarkdown(exportInput)], {
        type: 'text/markdown;charset=utf-8',
      }),
      'md',
    )

  const handleDownloadCsv = () =>
    saveFile(
      new Blob(['\uFEFF', buildPlanCsv(exportInput)], { type: 'text/csv;charset=utf-8' }),
      'csv',
    )

  /** Chunk thư viện .xlsx tải lười lúc bấm, nên có thể lỗi mạng; báo cho user thay vì im lặng. */
  const handleDownloadXlsx = async () => {
    try {
      saveFile(await buildPlanXlsx(exportInput), 'xlsx')
    } catch {
      toast.error(t('plans.export.xlsxFailed'))
    }
  }

  return (
    <div className="print:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="rounded-xl" data-testid="plan-export-menu">
            <Download className="size-4" aria-hidden />
            {t('plans.export.label')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={handleCopy} data-testid="plan-export-copy">
            <Copy className="size-4" aria-hidden />
            {t('plans.export.copy')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleDownloadMarkdown} data-testid="plan-export-download">
            <Download className="size-4" aria-hidden />
            {t('plans.export.download')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleDownloadCsv} data-testid="plan-export-csv">
            <Table className="size-4" aria-hidden />
            {t('plans.export.downloadCsv')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleDownloadXlsx} data-testid="plan-export-xlsx">
            <FileSpreadsheet className="size-4" aria-hidden />
            {t('plans.export.downloadXlsx')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => window.print()} data-testid="plan-export-print">
            <Printer className="size-4" aria-hidden />
            {t('plans.export.print')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
