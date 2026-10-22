// Pulls dated, graded items out of the schedule part of a syllabus. Works line by line: a line becomes an item when it
// contains a date the parser understands and some sign of graded work. Everything runs locally on the pasted text.

export type ItemType = 'exam' | 'project' | 'paper' | 'presentation' | 'assignment' | 'quiz' | 'reading' | 'other'

export const TYPE_LABEL: Record<ItemType, string> = {
  exam: 'Exam', project: 'Project', paper: 'Paper', presentation: 'Presentation', assignment: 'Assignment', quiz: 'Quiz',
  reading: 'Reading', other: 'Other',
}

export interface Item {
  id: string
  course: string
  title: string
  date: string // YYYY-MM-DD
  type: ItemType
  weight: number // share of the course grade in percent
  weightSource: WeightSource
  hours: number // estimated hours of work, editable
  hoursEdited: boolean
  source: string // the original line
  include: boolean
}

/** Where a weight came from: the item's own line, the course's grading breakdown, a default for the type, or an edit. */
export type WeightSource = 'line' | 'grading' | 'default' | 'user'

export interface Term {
  start: string // YYYY-MM-DD, any day in week 1
  end: string // YYYY-MM-DD, last day of classes or exams
}

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
}
const WEEKDAYS: Record<string, number> = {
  mon: 0, monday: 0, tue: 1, tues: 1, tuesday: 1, wed: 2, wednesday: 2, thu: 3, thur: 3, thurs: 3, thursday: 3,
  fri: 4, friday: 4, sat: 5, saturday: 5, sun: 6, sunday: 6,
}
const WEEKDAY_RE = '(?:mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)'
const MONTH_RE = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|')

/** Grade share assumed when the syllabus line does not state one. */
export const DEFAULT_WEIGHT: Record<ItemType, number> = {
  exam: 20, project: 15, paper: 15, presentation: 10, assignment: 5, quiz: 3, reading: 1, other: 2,
}

/** Hours of work per grade point, by type. A 20% exam is about 12 hours of study, a 5% problem set about 4. */
const HOURS_PER_POINT: Record<ItemType, number> = {
  exam: 0.6, project: 1.2, paper: 1, presentation: 0.8, assignment: 0.8, quiz: 0.7, reading: 2, other: 1,
}

export function estimateHours(type: ItemType, weight: number): number {
  return Math.min(40, Math.max(1, Math.round(weight * HOURS_PER_POINT[type])))
}

const TYPE_WORDS: [ItemType, RegExp][] = [
  ['assignment', /\blab (reports?|write-?ups?)\b/i],
  ['exam', /\b(final exams?|final examinations?|midterms?(?!\s+(review|grades?))|mid-terms?(?!\s+(review|grades?))|prelims?|exams?(?!\s+(review|grades?))|examinations?|tests?(?!\s+review))\b/i],
  ['presentation', /\b(presentations?|pitch(es)?|demos?|poster session|posters?)\b/i],
  ['paper', /\b(papers?|essays?|reports?|write-?ups?|thesis|reflections?|drafts?|analys[ie]s|critiques?)\b/i],
  ['project', /\b(projects?|proposals?|prototypes?|milestones?|capstone|portfolios?)\b/i],
  ['quiz', /\b(quiz|quizzes)\b/i],
  ['assignment', /\b(homeworks?|hw\s?\d*|problem sets?|psets?|assignments?|pre-?labs?|exercises?|worksheets?|discussion posts?|responses?|journals?|due)\b/i],
  ['reading', /\b(read|readings?|chapters?|ch\.\s?\d)\b/i],
]

export function iso(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

export function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function addDays(s: string, n: number): string {
  const d = parseIso(s)
  d.setUTCDate(d.getUTCDate() + n)
  return iso(d)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseIso(b).getTime() - parseIso(a).getTime()) / 86400000)
}

/** Monday of the week that contains the date. */
export function mondayOf(s: string): string {
  return addDays(s, -((parseIso(s).getUTCDay() + 6) % 7))
}

export function isIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  return valid(y, m, d)
}

function valid(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** Pick the year that puts a month and day inside the term, or closest to it. */
function yearFor(m: number, d: number, term: Term): number {
  const sy = parseIso(term.start).getUTCFullYear()
  let best = sy
  let bestDist = Infinity
  for (const y of [sy - 1, sy, sy + 1]) {
    if (!valid(y, m, d)) continue
    const t = iso(new Date(Date.UTC(y, m - 1, d)))
    const dist = t < term.start ? daysBetween(t, term.start) : t > term.end ? daysBetween(term.end, t) : 0
    if (dist < bestDist) {
      bestDist = dist
      best = y
    }
  }
  return best
}

export interface FoundDate {
  date: string
  index: number
  length: number
}

/** Every date in a line that falls near the term. Understands "Oct 14", "October 14th", "Oct. 14-16", "14 Oct",
 * "10/14", "10/14/2026", "2026-10-14" and "Week 7 Thursday" / "Wk 7" (counted from the week the term starts). */
export function findDates(line: string, term: Term): FoundDate[] {
  const found: FoundDate[] = []
  const push = (y: number, mo: number, d: number, index: number, length: number) => {
    if (valid(y, mo, d)) found.push({ date: iso(new Date(Date.UTC(y, mo - 1, d))), index, length })
  }
  let m: RegExpExecArray | null

  const isoRe = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g
  while ((m = isoRe.exec(line))) push(+m[1], +m[2], +m[3], m.index, m[0].length)

  const mdRe = new RegExp(`\\b(${MONTH_RE})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*[-–]\\s*\\d{1,2}(?:st|nd|rd|th)?)?(?:,?\\s*(20\\d{2}))?\\b`, 'gi')
  while ((m = mdRe.exec(line))) {
    const mo = MONTHS[m[1].toLowerCase()], d = +m[2]
    push(m[3] ? +m[3] : yearFor(mo, d, term), mo, d, m.index, m[0].length)
  }

  const dmRe = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_RE})\\.?(?:\\s+(20\\d{2}))?\\b`, 'gi')
  while ((m = dmRe.exec(line))) {
    const mo = MONTHS[m[2].toLowerCase()], d = +m[1]
    push(m[3] ? +m[3] : yearFor(mo, d, term), mo, d, m.index, m[0].length)
  }

  // "1/2 page" and "3/4 of" are fractions, not dates.
  const slashRe = /(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?![\d/])(?!\s*(?:pages?|hours?|of\b|points?|credits?|cups?|inch|miles?|done|complete))/g
  while ((m = slashRe.exec(line))) {
    let mo = +m[1], d = +m[2]
    if (mo > 12 && d <= 12) [mo, d] = [d, mo] // 14/10 written day first
    let y = m[3] ? +m[3] : yearFor(mo, d, term)
    if (y < 100) y += 2000
    push(y, mo, d, m.index, m[0].length)
  }

  const weekRe = new RegExp(`\\b(?:week|wk)\\.?\\s*(\\d{1,2})\\b(?:\\s*[,:(–-]?\\s*(${WEEKDAY_RE})\\b\\.?\\)?)?`, 'gi')
  while ((m = weekRe.exec(line))) {
    const week = +m[1]
    if (week < 1 || week > 30) continue
    const offset = m[2] ? WEEKDAYS[m[2].toLowerCase()] ?? 4 : 4 // a bare "Week N" means the Friday of that week
    found.push({ date: addDays(mondayOf(term.start), (week - 1) * 7 + offset), index: m.index, length: m[0].length })
  }

  // Dates far outside the term are usually something else, such as "1/2 page" or a publication year.
  const lo = addDays(term.start, -14)
  const hi = addDays(term.end, 14)
  const near = found.filter((f) => f.date >= lo && f.date <= hi)
  // Overlapping matches ("Oct 14" inside "Oct 14, 2026") keep the longest one.
  near.sort((a, b) => a.index - b.index || b.length - a.length)
  const out: FoundDate[] = []
  for (const f of near) {
    const last = out[out.length - 1]
    if (last && f.index < last.index + last.length) continue
    out.push(f)
  }
  return out
}

/** The date a line is about: the first date after the word "due" when there is one, otherwise the first date. */
export function findDate(line: string, term: Term): FoundDate | null {
  const dates = findDates(line, term)
  if (!dates.length) return null
  const due = /\b(due|deadline|submit(?:ted)? by)\b/i.exec(line)
  if (due) {
    const after = dates.find((d) => d.index > due.index)
    if (after) return after
  }
  return dates[0]
}

export function classify(text: string): ItemType {
  for (const [type, re] of TYPE_WORDS) if (re.test(text)) return type
  if (/\bfinal\b/i.test(text)) return 'exam' // "Dec 15: Final (cumulative)"
  return 'other'
}

export function statedWeight(text: string): number | null {
  const m = /(\d{1,2}(?:\.\d+)?)\s?(?:%|percent\b)/i.exec(text)
  if (!m) return null
  const v = parseFloat(m[1])
  return v > 0 && v <= 60 ? v : null
}

function cleanTitle(line: string, dates: FoundDate[], hasDue: boolean): string {
  let t = hasDue ? line.replace(/\b(assigned|out|released|posted)\b,?/gi, ' ') : line
  for (const d of [...dates].sort((a, b) => b.index - a.index)) t = t.slice(0, d.index) + ' ' + t.slice(d.index + d.length)
  t = t
    .replace(new RegExp(`\\b${WEEKDAY_RE}\\b\\.?,?`, 'gi'), ' ')
    .replace(/\(?\s*\d{1,2}(?:\.\d+)?\s?(?:%|percent\b)\s*(?:of (?:the )?(?:final |course )?grade)?\s*\)?/gi, ' ')
    .replace(/\b\d{1,2}(?::\d{2})?\s*(?:[-–]\s*\d{1,2}(?::\d{2})?\s*)?(?:am|pm|a\.m\.|p\.m\.)/gi, ' ')
    .replace(/\b(?:by\s+)?\d{1,2}:\d{2}\b/g, ' ')
    .replace(/\b(due|deadline)\b:?/gi, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/^\s*\d{1,2}\s+(?=[A-Za-z])/, ' ') // a leading week number from a pasted table
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/^[\s\-–—:|•*·,.;)]+|[\s\-–—:|•*·,.;(]+$/g, '')
    .replace(/\s{2,}/g, ' ')
  return t.length ? t.charAt(0).toUpperCase() + t.slice(1) : 'Untitled item'
}

const NOT_WORK = /\b(no class(es)?|holiday|break|recess|cancel+ed|no school|reading day|office hours|last day|drop|withdraw(al)?|registration)\b/i
const RELEASE = /\b(out|assigned|released|posted|handed out|available)\b/i

export interface GradingRule {
  type: ItemType
  percent: number
  each: boolean // "20% each" rather than a total for the category
  qualifier?: 'final' | 'midterm' // applies only to items whose title has this word
}

/** Reads a grading breakdown such as "Problem sets 30%, two exams 20% each, final exam 30%" from lines without dates. */
export function gradingRules(text: string, term: Term): GradingRule[] {
  const rules: GradingRule[] = []
  for (const raw of text.split(/\r?\n/)) {
    if (findDates(raw, term).length) continue
    for (const segment of raw.split(/[,;]|\band\b|\s[-–—]\s/)) {
      const percent = statedWeight(segment)
      if (percent === null) continue
      const words = segment.replace(/\d+(?:\.\d+)?\s?(?:%|percent\b)/gi, ' ')
      const type = classify(words)
      if (type === 'other' || type === 'reading') continue
      const qualifier = /\bfinal\b/i.test(words) ? 'final' : /\bmid-?term/i.test(words) ? 'midterm' : undefined
      rules.push({ type, percent, each: /\beach\b|\bper\b|\bapiece\b/i.test(segment), qualifier })
    }
  }
  return rules
}

/** Gives items without a stated weight their share of the grading breakdown. */
export function applyGradingRules(items: Item[], rules: GradingRule[]): void {
  const open = items.filter((it) => it.weightSource !== 'line')
  const matches = (rule: GradingRule, it: Item): boolean => {
    if (rule.type !== it.type) return false
    if (rule.qualifier) return new RegExp(`\\b${rule.qualifier === 'midterm' ? 'mid-?term' : 'final'}`, 'i').test(it.title)
    // A rule without a qualifier skips items that a qualified rule of the same type already covers.
    return !rules.some((r) => r.qualifier && r.type === it.type && matches(r, it))
  }
  for (const rule of rules) {
    const targets = open.filter((it) => matches(rule, it))
    if (!targets.length) continue
    const share = rule.each ? rule.percent : Math.round((rule.percent / targets.length) * 10) / 10
    for (const it of targets) {
      it.weight = share
      it.weightSource = 'grading'
      if (!it.hoursEdited) it.hours = estimateHours(it.type, share)
    }
  }
}

/** Items found in one course's pasted text. Ids are `${idPrefix}-${line number}`. */
export function extractItems(course: string, text: string, term: Term, idPrefix = 'c'): Item[] {
  const out: Item[] = []
  const lines = text.split(/\r?\n/)
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n].trim()
    if (line.length < 4) continue
    const dates = findDates(line, term)
    if (!dates.length) continue
    const found = findDate(line, term)!
    const hasDue = /\b(due|deadline|submit)/i.test(line)
    const title = cleanTitle(line, dates, hasDue)
    const type = classify(title === 'Untitled item' ? line : title)
    if (type === 'other' && !hasDue) continue // dated lines that are not work, such as "Sep 3: Introduction"
    if (NOT_WORK.test(line) && type === 'other') continue
    if (RELEASE.test(line) && !hasDue && type !== 'exam' && type !== 'quiz' && type !== 'presentation') continue
    const stated = statedWeight(line)
    const weight = stated ?? DEFAULT_WEIGHT[type]
    out.push({
      id: `${idPrefix}-${n + 1}`,
      course,
      title,
      date: found.date,
      type,
      weight,
      weightSource: stated !== null ? 'line' : 'default',
      hours: estimateHours(type, weight),
      hoursEdited: false,
      source: line,
      include: type !== 'reading',
    })
  }
  applyGradingRules(out, gradingRules(text, term))
  return out
}
