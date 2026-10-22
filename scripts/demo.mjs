// Records the narrated walkthrough: node scripts/demo.mjs https://hyunsikparker.github.io/crunchmap/ OUT_DIR
// then: python3 ../../tools/demo-video/compose.py OUT_DIR/timeline.json OUT_DIR/crunchmap-demo.mp4
// Every number in the narration is read off the sample semester; check() fails the run if the page says otherwise.
import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [url, out] = process.argv.slice(2)
const TTS = '/Volumes/Crucial X9/workstation/Bounty/tts-narration/bin/bounty-tts'
mkdirSync(join(out, 'rec'), { recursive: true })

const scenes = [
  {
    text: 'Crunchmap reads the schedules in your syllabi and shows, before the term starts, which weeks will pile up. This is a made-up spring semester with four courses, each schedule written the way a different instructor might write it.',
    run: async (page) => {
      // Second sentence: pan down the four pasted schedules, then come back up.
      await page.waitForTimeout(7000)
      await scrollTo(page, '.course:nth-child(2)', 'center')
      await page.waitForTimeout(4500)
      await scrollTo(page, '.course:nth-child(4)', 'center')
    },
  },
  {
    text: 'The hardest week is week sixteen. A project and a paper are due, and last-minute work for three exams the following week lands there too. Done at the last minute, that week takes about seventy-three and a half hours.',
    check: [['.verdict', 'Week 16 (May 3–9) is your hardest week'], ['.verdict', 'about 73.5 h of work']],
    run: async (page) => {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
      await page.waitForTimeout(1200)
      await page.locator('.hit').nth(15).hover()
    },
  },
  {
    text: 'Crunchmap then plans backwards from every deadline. Each item starts as late as it can without any day going over four hours of coursework. The busiest week drops to twenty-eight hours, and the busiest day from sixteen hours to four.',
    check: [['.compare', 'Busiest week 73.5 h → 28 h'], ['.compare', 'Busiest day 16 h → 4 h']],
    run: async (page) => { await page.locator('.compare').hover() },
  },
  {
    text: 'Pick any week to see what is due and what to work on. Week eight has three exams and a paper. At the last minute that is thirty-six hours of work; with the plan it is sixteen, because part of it moves into the weeks before.',
    check: [['#week-2027-03-08', '3 exams and a paper due'], ['#week-2027-03-08', 'Last minute 36 h With the plan 16 h']],
    run: async (page) => {
      await page.locator('.hit').nth(7).click()
      await page.locator('#week-2027-03-08 .wk-plan').waitFor()
    },
  },
  {
    text: 'These fourteen items need an earlier start than usual. The team project\'s final submission, for example, starts on April third, four weeks earlier than a last-minute start.',
    check: [['.starts', 'These 14 need an earlier start'], ['.starts', 'SAT Apr 3 Team project final submission · CS 201 · Data Structures Due Thu, May 6 · about 24 h · 28 days before a last-minute start']],
    run: async (page) => {
      await scrollTo(page, '.starts')
      await page.waitForTimeout(5500)
      await scrollTo(page, '.starts li:nth-child(7)', 'center')
    },
  },
  {
    text: 'Everything comes from pasted text. This table lists every deadline that was read, with the line it came from, ready to correct. A weight comes from that line, from the course\'s grading breakdown, or, when neither gives one, from a typical value marked as an estimate.',
    run: async (page) => {
      await scrollTo(page, '.deadlines')
      await page.waitForTimeout(8000)
      await page.evaluate(() => window.scrollBy({ top: 260, behavior: 'smooth' }))
    },
  },
  {
    text: 'Finally, one file adds every deadline to your calendar, plus a reminder on the morning each early or bigger item should start. Crunchmap runs entirely in your browser, and nothing you paste is uploaded.',
    run: async (page) => {
      await scrollTo(page, '.cap', 'center')
      await page.waitForTimeout(1500)
      await page.getByRole('button', { name: 'Add to my calendar (.ics)' }).click()
    },
  },
]

const scrollTo = (page, sel, block = 'start') =>
  page.evaluate(([s, b]) => document.querySelector(s).scrollIntoView({ behavior: 'smooth', block: b }), [sel, block])

// 1. Narration, one WAV per scene, reused while the scene text is unchanged.
scenes.forEach((s, k) => {
  s.wav = `s${k + 1}.wav`
  const receiptPath = join(out, `s${k + 1}.json`)
  const textPath = join(out, `s${k + 1}.txt`)
  const cached = existsSync(receiptPath) && existsSync(textPath) && readFileSync(textPath, 'utf8') === s.text
  if (!cached) {
    // The runtime logs model loading before the receipt; the receipt is the last top-level JSON object.
    const stdout = execFileSync(TTS, ['--text', s.text, '--output', join(out, s.wav)], { encoding: 'utf8' })
    writeFileSync(receiptPath, stdout.slice(stdout.startsWith('{') ? 0 : stdout.lastIndexOf('\n{') + 1))
    writeFileSync(textPath, s.text)
  }
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'))
  s.duration = receipt.duration_seconds
  if (!(s.duration > 0)) throw new Error(`scene ${k + 1}: no duration in the TTS receipt`)
  console.log(`scene ${k + 1}: ${s.duration}s`)
})

// 2. Screen recording paced by the narration.
const browser = await chromium.launch({ channel: 'chrome' })
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  colorScheme: 'light',
  bypassCSP: true,
  acceptDownloads: true,
  recordVideo: { dir: join(out, 'rec'), size: { width: 1280, height: 800 } },
})
await context.addInitScript(() => {
  // Repaint a 2-pixel element every frame so the screencast keeps emitting frames on static scenes.
  const tick = () => {
    let el = document.getElementById('__keep_paint')
    if (!el && document.body) {
      el = document.createElement('div')
      el.id = '__keep_paint'
      Object.assign(el.style, { position: 'fixed', right: '0', bottom: '0', width: '2px', height: '2px', pointerEvents: 'none', zIndex: '2147483647' })
      document.body.appendChild(el)
    }
    if (el) el.style.opacity = el.style.opacity === '0.01' ? '0.02' : '0.01'
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
const page = await context.newPage()
const v0 = Date.now()
await page.goto(url)
await page.locator('.verdict h3').waitFor()
await page.addStyleTag({ content: 'html { scroll-behavior: smooth; } .starts, .deadlines, .verdict { scroll-margin-top: 24px; }' })
for (const s of scenes) {
  for (const [sel, want] of s.check ?? []) {
    const got = (await page.locator(sel).first().innerText()).replace(/\s+/g, ' ')
    if (!got.includes(want)) throw new Error(`narration check failed: ${sel} lacks "${want}"`)
  }
}
await page.waitForTimeout(400)
const t0 = Date.now()
const timeline = { video: 'rec.webm', trim_start_ms: t0 - v0, scenes: [] }
for (const s of scenes) {
  const start = Date.now() - t0
  timeline.scenes.push({ start_ms: start + 400, wav: s.wav, text: s.text, duration_s: s.duration })
  await page.waitForTimeout(400)
  await s.run(page)
  const left = start + 400 + s.duration * 1000 + 600 - (Date.now() - t0)
  if (left > 0) await page.waitForTimeout(left)
}
await page.waitForTimeout(900)
await context.close()
await browser.close()
const webm = readdirSync(join(out, 'rec')).find((f) => f.endsWith('.webm'))
renameSync(join(out, 'rec', webm), join(out, 'rec.webm'))
writeFileSync(join(out, 'timeline.json'), JSON.stringify(timeline, null, 1))
console.log('recorded', ((Date.now() - t0) / 1000).toFixed(1), 's after a', timeline.trim_start_ms, 'ms load', existsSync(join(out, 'rec.webm')) ? '' : '(no video!)')
