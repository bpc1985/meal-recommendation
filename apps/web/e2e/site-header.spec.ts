import AxeBuilder from '@axe-core/playwright'
import { createDb, insertUser } from '@mam/db'
import { expect, test, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { hashPassword } from '../src/server/password'
import { waitForHydration } from './support'

const databasePath = fileURLToPath(new URL('../.e2e/mam.db', import.meta.url))

/** Tạo tài khoản thẳng trong DB (giới hạn đăng ký theo IP dùng chung cả bộ e2e) rồi đăng nhập. */
async function loginAs(page: Page, email: string): Promise<void> {
  const passwordHash = await hashPassword('matkhau123')
  const { db, sqlite } = createDb(databasePath)
  try {
    insertUser(db, { email, passwordHash })
  } finally {
    sqlite.close()
  }

  await page.goto('/login?redirect=%2Fplans')
  await waitForHydration(page)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Mật khẩu', { exact: true }).fill('matkhau123')
  await page.getByRole('main').getByRole('button', { name: 'Đăng nhập' }).click()
  await expect(page).toHaveURL(/\/plans$/)
}

const stamp = () => `${Date.now()}${Math.floor(Math.random() * 1_000)}`

test.describe('header khi đã đăng nhập', () => {
  for (const [kind, email] of [
    ['dài', `nguyen.van.an.email.rat.dai.de.thu.${stamp()}@example.com`],
    ['ngắn', `a${stamp()}@x.vn`],
  ] as const) {
    test(`email ${kind}: không tràn ngang, không đè nút menu, vẫn có tên truy cập`, async ({
      page,
    }) => {
      await loginAs(page, email)
      const account = page.getByRole('banner').getByRole('button', { name: email })
      const menu = page.getByRole('banner').getByRole('button', { name: 'Mở menu' })

      for (const width of [390, 640, 768, 1280]) {
        await page.setViewportSize({ width, height: 800 })
        await expect(account).toBeVisible()

        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        )
        expect(overflow, `tràn ngang ở ${width}px`).toBe(0)

        const box = (await account.boundingBox())!
        if (await menu.isVisible()) {
          const menuBox = (await menu.boundingBox())!
          expect(box.x + box.width, `đè nút menu ở ${width}px`).toBeLessThanOrEqual(menuBox.x)
        }
      }

      await page.setViewportSize({ width: 390, height: 800 })
      const { violations } = await new AxeBuilder({ page })
        .include('header')
        .withRules(['button-name'])
        .analyze()
      expect(violations).toEqual([])
    })
  }
})
