import { describe, expect, it } from 'vitest'
import { addDays, extractItems, type Item, type ItemType, type Term } from './extract'
import { buildPlan, crunchReason, MAX_LEAD } from './plan'
import { SAMPLE_COURSES, SAMPLE_TERM } from './sample'

const FALL: Term = { start: '2026-08-31', end: '2026-12-18' }

function item(id: string, date: string, type: ItemType, weight: number, hours: number): Item {
  return {
    id, course: 'X', title: id, date, type, weight, weightSource: 'line', hours, hoursEdited: false, source: id, include: true,
  }
}

describe('buildPlan', () => {
  it('starts a lone item as late as the cap allows', () => {
    const plan = buildPlan([item('exam', '2026-10-15', 'exam', 20, 12)], FALL)
    // 12 hours over the 14 allowed days needs at least 0.9 h a day; the plan rounds the cap up to 1 h.
    expect(plan.minCap).toBe(0.9)
    expect(plan.cap).toBe(1)
    expect(plan.items.exam.start).toBe('2026-10-03')
    // The last-minute version spends 4 h a day on the 3 days before the exam.
    expect(plan.items.exam.cramStart).toBe('2026-10-12')
    expect(plan.peakDay.lastMinute).toBeCloseTo(4)
    expect(plan.items.exam.earlierBy).toBe(9)
  })

  it('never goes over the cap and never works outside an item window', () => {
    const items = SAMPLE_COURSES.flatMap((c, k) => extractItems(c.name, c.text, SAMPLE_TERM, `c${k}`))
    const plan = buildPlan(items, SAMPLE_TERM)
    const perDay = new Map<string, number>()
    for (const it of items.filter((i) => i.include)) {
      const p = plan.items[it.id]
      const days = Object.entries(p.hours)
      expect(days.reduce((s, [, h]) => s + h, 0)).toBeCloseTo(it.hours, 5)
      for (const [day, h] of days) {
        expect(day < it.date).toBe(true)
        expect(day >= addDays(it.date, -MAX_LEAD[it.type])).toBe(true)
        expect(day >= SAMPLE_TERM.start).toBe(true)
        perDay.set(day, (perDay.get(day) ?? 0) + h)
      }
    }
    expect(Math.max(...perDay.values())).toBeLessThanOrEqual(plan.cap + 1e-6)
    expect(plan.peakWeek.planned).toBeLessThan(plan.peakWeek.lastMinute)
    expect(plan.peakDay.planned).toBeLessThan(plan.peakDay.lastMinute)
  })

  it('finds the crunch weeks of the sample semester', () => {
    const items = SAMPLE_COURSES.flatMap((c, k) => extractItems(c.name, c.text, SAMPLE_TERM, `c${k}`))
    const plan = buildPlan(items, SAMPLE_TERM)
    expect(plan.weeks[0].index).toBe(1)
    expect(plan.weeks[0].monday).toBe('2027-01-18')
    expect(plan.weeks.length).toBe(17)
    const crunch = plan.weeks.filter((w) => w.crunch).map((w) => [w.index, w.reason])
    expect(crunch).toEqual([
      [8, '3 exams and a paper due'],
      [16, 'a project and a paper due'],
      [17, '4 exams due'],
    ])
  })

  it('keeps a requested cap but never goes below the tightest one', () => {
    const items = [item('a', '2026-10-15', 'exam', 20, 12), item('b', '2026-10-15', 'paper', 15, 15)]
    const tight = buildPlan(items, FALL)
    expect(buildPlan(items, FALL, 0.1).cap).toBe(tight.minCap)
    const loose = buildPlan(items, FALL, 6)
    expect(loose.cap).toBe(6)
    // With a looser cap, work stays closer to the deadline.
    expect(loose.items.b.start > tight.items.b.start).toBe(true)
  })

  it('handles items due on the first day of term and an empty list', () => {
    const plan = buildPlan([item('q', '2026-08-31', 'quiz', 3, 2)], FALL)
    expect(plan.items.q.start).toBe('2026-08-31')
    const empty = buildPlan([], FALL)
    expect(empty.weeks.length).toBe(16)
    expect(empty.peakWeek.planned).toBe(0)
  })
})

describe('crunchReason', () => {
  it('names the major items', () => {
    expect(crunchReason([item('a', '2026-10-15', 'exam', 20, 1), item('b', '2026-10-15', 'exam', 15, 1), item('c', '2026-10-15', 'assignment', 5, 1)])).toBe('2 exams due')
    expect(crunchReason([item('a', '2026-10-15', 'assignment', 5, 1)])).toBe('1 deadline')
  })
})
