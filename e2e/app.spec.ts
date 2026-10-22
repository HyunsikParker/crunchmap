import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'

function watch(page: Page) {
  const errors: string[] = []
  const requests: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('request', (r) => {
    const url = r.url()
    if (!url.startsWith('http://127.0.0.1:4173') && !url.startsWith('blob:') && !url.startsWith('data:')) requests.push(url)
  })
  return { errors, requests }
}

test('sample semester: finds the crunch weeks, plans earlier starts and exports a calendar', async ({ page }) => {
  const seen = watch(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('See your semester’s crunch weeks before they arrive')

  const verdict = page.locator('.verdict')
  await expect(verdict.locator('.eyebrow')).toHaveText('3 crunch weeks: weeks 8, 16 and 17')
  await expect(verdict.getByRole('heading', { level: 3 })).toHaveText('Week 16 (May 3–9) is your hardest week.')
  await expect(verdict.locator('.compare')).toContainText('73.5 h→28 h')
  await expect(verdict.locator('.compare')).toContainText('16 h→4 h')

  // The chart is a keyboard-operable week picker that opens the week in the list.
  const week8 = page.getByRole('button', { name: /^Week 8, Mar 8–14: 36 h at the last minute, 16 h with the plan\. Crunch week: 3 exams and a paper due/ })
  await week8.click()
  const row = page.locator('#week-2027-03-08')
  await expect(row).toBeFocused()
  await expect(row.getByText('Planned work in Week 8')).toBeVisible()
  await expect(row.locator('.chips li')).toHaveCount(4)
  await week8.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: /^Week 9, Mar 15–21/ })).toBeFocused()

  await expect(page.getByRole('heading', { name: 'Start these earlier than usual' })).toBeVisible()
  await expect(page.locator('.start-list li')).toHaveCount(14)
  await expect(page.locator('.start-list li').filter({ hasText: 'Team project final submission' })).toContainText('Due Thu, May 6 · about 24 h · 28 days before a last-minute start')

  // A looser daily limit moves work back toward the deadlines.
  await page.getByRole('button', { name: 'Raise the daily limit' }).click()
  await expect(page.getByLabel('Keep each day under')).toHaveValue('4.5')
  await page.getByRole('button', { name: 'Lower the daily limit' }).click()
  await expect(page.getByLabel('Keep each day under')).toHaveValue('4')

  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Add to my calendar (.ics)' }).click(),
  ]).then(([d]) => d)
  expect(download.suggestedFilename()).toBe('crunchmap-2027-01-19.ics')
  await download.saveAs('test-results/crunchmap-sample.ics') // for scripts/check_ics.py
  const ics = readFileSync((await download.path())!, 'utf8')
  expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
  expect(ics.match(/BEGIN:VEVENT/g)?.length).toBeGreaterThan(39)
  await expect(page.getByRole('status')).toContainText('Saved crunchmap-2027-01-19.ics: 39 deadlines and')

  const a11y = await new AxeBuilder({ page }).analyze()
  if (a11y.violations.length) console.log(JSON.stringify(a11y.violations.flatMap((v) => v.nodes.map((n) => ({ id: v.id, t: n.target })))).slice(0, 3000))
  expect(a11y.violations.map((v) => v.id)).toEqual([])
  expect(seen.errors).toEqual([])
  expect(seen.requests).toEqual([])
})

test('own course: pasted lines become deadlines, edits update the map, and the page remembers them', async ({ page }) => {
  const seen = watch(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Start with my own courses' }).click()
  await expect(page.getByText('Your semester map will appear here')).toBeVisible()

  await page.getByLabel('First day of classes').fill('2026-08-31')
  await page.getByLabel('Last day of exams').fill('2026-12-18')
  await page.getByLabel('Course name').fill('ECON 101')
  await page.getByLabel('Schedule for ECON 101').fill([
    'Grading: two midterms 25% each, final exam 40%, problem sets 10%.',
    'Sep 7 Labor Day, no class',
    'Week 3 Fri – Problem set 1 due',
    'Oct 14 Midterm 1',
    'Oct 15 Midterm review session',
    '11/18 Midterm 2',
    'Dec 15, 8:00–10:00 am: Final exam',
  ].join('\n'))
  await expect(page.getByText('4 deadlines found')).toBeVisible()
  await expect(page.locator('.verdict h3')).toContainText('is your hardest week.')

  const table = page.locator('.deadlines')
  await expect(table.getByLabel('Name of item from ECON 101')).toHaveCount(4)
  await expect(table.getByLabel('Weight of Final exam in percent')).toHaveValue('40')
  await expect(table.getByLabel('Weight of Problem set 1 in percent')).toHaveValue('10')
  await expect(table.getByLabel('Due date of Problem set 1')).toHaveValue('2026-09-18')

  await table.getByLabel('Estimated hours for Final exam').fill('30')
  await expect(page.locator('.start-list li').filter({ hasText: 'Final exam' })).toContainText('about 30 h')
  await table.getByLabel('Include Problem set 1 (ECON 101) in the plan').uncheck()
  await expect(page.locator('.weeks .chip').filter({ hasText: 'Problem set 1' })).toHaveCount(0)

  await page.reload()
  await expect(page.getByLabel('Course name')).toHaveValue('ECON 101')
  await expect(page.locator('.deadlines').getByLabel('Estimated hours for Final exam')).toHaveValue('30')
  expect(seen.errors).toEqual([])
  expect(seen.requests).toEqual([])
})

test('phone width: no horizontal scroll, chart and export reachable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await page.goto('/')
  await expect(page.locator('.chart svg')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add to my calendar (.ics)' })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
