// Turns dated items into a week-by-week picture of the term and a work plan that keeps every day under a cap.
//
// Two ways of doing the same work are compared:
// - last minute: each item's hours are spread over the few days right before it is due;
// - planned: each item starts as late as possible while no day goes over the cap. The cap defaults to the smallest one
//   that can be met at all, found by binary search.
// The planner schedules backwards from the end of the term, giving each day's hours to the item whose allowed window
// closes soonest (earliest-deadline-first in reversed time), which finds a schedule whenever one exists.

import { addDays, daysBetween, mondayOf, type Item, type ItemType, type Term } from './extract'

/** Days a last-minute student spends on an item, ending the day before it is due. */
export const CRAM_DAYS: Record<ItemType, number> = {
  exam: 3, project: 5, paper: 4, presentation: 3, assignment: 2, quiz: 1, reading: 1, other: 1,
}

/** The earliest the plan may start an item, in days before it is due. */
export const MAX_LEAD: Record<ItemType, number> = {
  exam: 14, project: 35, paper: 28, presentation: 14, assignment: 7, quiz: 5, reading: 7, other: 7,
}

/** A week is a crunch week when two major deadlines (15% or more each) or 35 grade points fall in it. */
export const MAJOR_WEIGHT = 15
export const CRUNCH_POINTS = 35

export interface Week {
  index: number // 1 = the week the term starts in
  monday: string
  due: Item[]
  dueWeight: number // grade points due this week, summed across courses
  crunch: boolean
  reason: string
  lastMinute: number // hours of work this week if everything is done at the last minute
  planned: number // hours of work this week under the plan
}

export interface ItemPlan {
  start: string // first day the plan works on the item
  cramStart: string // first day of the last-minute version
  earlierBy: number // days the plan starts before the last-minute version
  hours: Record<string, number> // planned hours per day
}

export interface Plan {
  weeks: Week[]
  items: Record<string, ItemPlan>
  minCap: number // the smallest daily cap any plan can keep, in hours
  cap: number // the daily cap this plan keeps
  peakWeek: { lastMinute: number; planned: number }
  peakDay: { lastMinute: number; planned: number }
}

interface Window {
  item: Item
  first: number // first allowed work day (day index)
  last: number // last allowed work day
  due: number
}

const EPS = 1e-6

function plural(n: number, word: string): string {
  if (n === 1) return `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`
  return `${n} ${word === 'quiz' ? 'quizzes' : `${word}s`}`
}

function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** "3 exams and a paper" for the items of 10% or more, or '' when there are none. */
export function describeItems(items: Item[]): string {
  const counts = new Map<ItemType, number>()
  for (const it of items) if (it.weight >= 10) counts.set(it.type, (counts.get(it.type) ?? 0) + 1)
  const order: ItemType[] = ['exam', 'project', 'paper', 'presentation', 'assignment', 'quiz', 'reading', 'other']
  return joinWords(order.filter((t) => counts.has(t)).map((t) => plural(counts.get(t)!, t === 'other' ? 'deadline' : t)))
}

/** "2 exams and a paper due" for the items of 10% or more. */
export function crunchReason(due: Item[]): string {
  const major = describeItems(due)
  if (!major) return due.length === 1 ? '1 deadline' : `${due.length} deadlines`
  return `${major} due`
}

/** Allocates hours backwards from the end with a daily cap. Returns the hours per item per day, or null when some
 * item cannot be finished inside its window. */
function schedule(windows: Window[], days: number, cap: number): number[][] | null {
  const remaining = windows.map((w) => w.item.hours)
  const alloc = windows.map(() => new Array<number>(days).fill(0))
  const order = windows.map((_, i) => i)
  for (let day = days - 1; day >= 0; day--) {
    let left = cap
    const open = order
      .filter((i) => remaining[i] > EPS && windows[i].first <= day && day <= windows[i].last)
      .sort((a, b) => windows[b].first - windows[a].first || windows[a].due - windows[b].due || a - b)
    for (const i of open) {
      if (left <= EPS) break
      const take = Math.min(left, remaining[i])
      alloc[i][day] += take
      remaining[i] -= take
      left -= take
    }
    // An item whose window has closed (going backwards) with hours left over cannot be finished.
    for (const i of order) if (remaining[i] > EPS && windows[i].first >= day) return null
  }
  return remaining.every((r) => r <= EPS) ? alloc : null
}

export function buildPlan(all: Item[], term: Term, requestedCap?: number): Plan {
  const items = all.filter((it) => it.include && it.hours > 0)
  const dues = items.map((it) => it.date)
  const firstDay = mondayOf([term.start, ...dues].sort()[0])
  const lastDue = [term.end, ...dues].sort().at(-1)!
  const weekCount = Math.floor(daysBetween(firstDay, mondayOf(lastDue)) / 7) + 1
  const days = weekCount * 7
  const termDay = daysBetween(firstDay, term.start)
  const dateOf = (d: number) => addDays(firstDay, d)

  const windows: Window[] = items.map((item) => {
    const due = daysBetween(firstDay, item.date)
    const last = due - 1 >= termDay ? due - 1 : due
    const first = Math.min(last, Math.max(termDay, due - MAX_LEAD[item.type]))
    return { item, first, last, due }
  })

  // Last-minute version: even hours over the final few days before each item is due.
  const cramDay = new Array<number>(days).fill(0)
  const cramStart = windows.map((w) => Math.max(w.first, w.last - CRAM_DAYS[w.item.type] + 1))
  windows.forEach((w, i) => {
    const span = w.last - cramStart[i] + 1
    for (let d = cramStart[i]; d <= w.last; d++) cramDay[d] += w.item.hours / span
  })

  // Smallest feasible cap, to the nearest 0.05 hour.
  const total = items.reduce((s, it) => s + it.hours, 0)
  let lo = 0
  let hi = Math.max(total, EPS)
  for (const w of windows) lo = Math.max(lo, w.item.hours / (w.last - w.first + 1))
  if (items.length && !schedule(windows, days, lo + EPS)) {
    while (hi - lo > 0.01) {
      const mid = (lo + hi) / 2
      if (schedule(windows, days, mid)) hi = mid
      else lo = mid
    }
  } else hi = lo
  const minCap = Math.max(0, Math.ceil((hi - EPS) * 20) / 20)
  const cap = Math.max(minCap, requestedCap ?? Math.ceil(minCap * 2) / 2)
  const alloc = items.length ? schedule(windows, days, cap) ?? schedule(windows, days, cap + EPS) ?? [] : []

  const planDay = new Array<number>(days).fill(0)
  const plans: Record<string, ItemPlan> = {}
  windows.forEach((w, i) => {
    const hours: Record<string, number> = {}
    let start = w.last
    for (let d = 0; d < days; d++) {
      const h = alloc[i]?.[d] ?? 0
      if (h > EPS) {
        hours[dateOf(d)] = h
        planDay[d] += h
        start = Math.min(start, d)
      }
    }
    plans[w.item.id] = {
      start: dateOf(start),
      cramStart: dateOf(cramStart[i]),
      earlierBy: cramStart[i] - start,
      hours,
    }
  })

  const weeks: Week[] = []
  const firstWeekIndex = 1 - Math.floor(termDay / 7)
  for (let k = 0; k < weekCount; k++) {
    const monday = dateOf(k * 7)
    const sunday = dateOf(k * 7 + 6)
    const due = items.filter((it) => it.date >= monday && it.date <= sunday).sort((a, b) => a.date.localeCompare(b.date) || b.weight - a.weight)
    const dueWeight = due.reduce((s, it) => s + it.weight, 0)
    const majors = due.filter((it) => it.weight >= MAJOR_WEIGHT).length
    const sum = (arr: number[]) => arr.slice(k * 7, k * 7 + 7).reduce((s, h) => s + h, 0)
    weeks.push({
      index: firstWeekIndex + k,
      monday,
      due,
      dueWeight,
      crunch: majors >= 2 || dueWeight >= CRUNCH_POINTS,
      reason: due.length ? crunchReason(due) : '',
      lastMinute: sum(cramDay),
      planned: sum(planDay),
    })
  }

  return {
    weeks,
    items: plans,
    minCap,
    cap,
    peakWeek: { lastMinute: Math.max(0, ...weeks.map((w) => w.lastMinute)), planned: Math.max(0, ...weeks.map((w) => w.planned)) },
    peakDay: { lastMinute: Math.max(0, ...cramDay), planned: Math.max(0, ...planDay) },
  }
}
