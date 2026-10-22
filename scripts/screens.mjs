// Captures the Devpost gallery screenshots from the live build:
// node scripts/screens.mjs https://hyunsikparker.github.io/crunchmap/ ../submission/screens
import { chromium } from '@playwright/test'

const [url, out] = process.argv.slice(2)
const browser = await chromium.launch({ channel: 'chrome' })

const desk = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
await desk.goto(url)
await desk.locator('.verdict h3').waitFor()
await desk.screenshot({ path: `${out}/01-overview.png` })

await desk.getByRole('button', { name: /^Week 8, Mar 8–14/ }).click()
const row = desk.locator('#week-2027-03-08')
await row.getByText('Planned work in Week 8').waitFor()
const prev = desk.locator('#week-2027-03-01')
const next = desk.locator('#week-2027-03-15')
await prev.scrollIntoViewIfNeeded()
const a = await prev.boundingBox()
const b = await next.boundingBox()
await desk.evaluate((y) => window.scrollTo(0, y), a.y + (await desk.evaluate(() => window.scrollY)) - 60)
const a2 = await prev.boundingBox()
const b2 = await next.boundingBox()
const map = await desk.locator('.weeks').boundingBox()
await desk.screenshot({ path: `${out}/02-crunch-week.png`, clip: { x: map.x - 16, y: a2.y - 16, width: map.width + 32, height: b2.y + b2.height - a2.y + 32 } })

const starts = desk.locator('.starts')
await starts.scrollIntoViewIfNeeded()
const s1 = await starts.boundingBox()
await desk.evaluate((y) => window.scrollTo(0, y), s1.y + (await desk.evaluate(() => window.scrollY)) - 24)
const s2 = await starts.boundingBox()
const eighth = await desk.locator('.start-list li').nth(7).boundingBox()
await desk.screenshot({ path: `${out}/03-start-dates.png`, clip: { x: s2.x - 16, y: s2.y - 16, width: s2.width + 32, height: eighth.y + eighth.height - s2.y + 32 } })

const table = desk.locator('.deadlines')
await table.scrollIntoViewIfNeeded()
const t = await table.boundingBox()
await desk.evaluate((y) => window.scrollTo(0, y), t.y + (await desk.evaluate(() => window.scrollY)) - 24)
const t2 = await table.boundingBox()
await desk.screenshot({ path: `${out}/04-deadline-table.png`, clip: { x: t2.x - 16, y: t2.y - 16, width: t2.width + 32, height: 900 } })

const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 })
await phone.goto(url)
await phone.locator('.verdict').scrollIntoViewIfNeeded()
await phone.evaluate(() => window.scrollTo(0, document.querySelector('.verdict').getBoundingClientRect().top + window.scrollY - 12))
await phone.screenshot({ path: `${out}/05-phone.png` })
await browser.close()
console.log('saved')
