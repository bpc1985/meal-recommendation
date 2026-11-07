/**
 * Kiểm tra i18n:
 * 1. `vi` và `en` có cùng bộ key.
 * 2. Mọi key dùng trong code đều tồn tại.
 * 3. Không có chuỗi tiếng Việt hard-code trong file .tsx của app.
 *
 * Thoát mã lỗi 1 nếu có vi phạm. Thêm `i18n-ignore` vào dòng để bỏ qua (dùng cho
 * những chỗ cố ý hard-code, ví dụ tên riêng).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { dictionaries } from '@mam/i18n'

const ROOT = new URL('..', import.meta.url).pathname
const SCAN_DIRS = ['apps/web/src']
const VIETNAMESE = /[àáảãạăằắẳẵặâầấẩẫậđêềếểễệôồốổỗộơờớởỡợưừứửữựýỳỷỹỵ]/i

const violations: string[] = []

const viKeys = new Set(Object.keys(dictionaries.vi))
const enKeys = new Set(Object.keys(dictionaries.en))

for (const key of viKeys) {
  if (!enKeys.has(key)) violations.push(`Thiếu bản dịch en cho key "${key}"`)
}
for (const key of enKeys) {
  if (!viKeys.has(key)) violations.push(`Key "${key}" có ở en nhưng không có ở vi`)
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return entry === 'ui' ? [] : walk(full)
    return /\.tsx?$/.test(entry) ? [full] : []
  })
}

const usedKeys = new Set<string>()

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const source = readFileSync(file, 'utf8')
    const relative = file.replace(ROOT, '')

    for (const match of source.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
      const key = match[1]
      if (!key) continue
      usedKeys.add(key)
      if (!viKeys.has(key)) violations.push(`${relative}: key "${key}" không tồn tại`)
    }

    // Key có thể được truyền qua biến (vd. mảng cấu hình) — nhận diện theo hình dạng chuỗi.
    for (const match of source.matchAll(/'([a-z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)+)'/g)) {
      const key = match[1]
      if (key && viKeys.has(key)) usedKeys.add(key)
    }

    if (!file.endsWith('.tsx')) continue

    source.split('\n').forEach((line, index) => {
      const trimmed = line.trim()
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return
      if (line.includes('i18n-ignore')) return
      if (!VIETNAMESE.test(line)) return

      violations.push(
        `${relative}:${index + 1}: chuỗi tiếng Việt hard-code → ${trimmed.slice(0, 80)}`,
      )
    })
  }
}

const unused = [...viKeys].filter((key) => !usedKeys.has(key))

for (const message of violations) console.error(`✗ ${message}`)

if (unused.length > 0) {
  console.log(`ℹ ${unused.length} key chưa dùng (không phải lỗi): ${unused.join(', ')}`)
}

if (violations.length > 0) {
  console.error(`\n${violations.length} vi phạm i18n`)
  process.exit(1)
}

console.log(`✓ i18n OK — ${viKeys.size} key, ${usedKeys.size} key đang dùng`)
