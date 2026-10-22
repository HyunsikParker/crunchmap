import { describe, expect, it } from 'vitest'
import { extractItems } from './extract'
import { buildIcs, escapeText, fold, needsStartReminder } from './ics'
import { buildPlan } from './plan'
import { SAMPLE_COURSES, SAMPLE_TERM } from './sample'

const unfold = (s: string) => s.replace(/\r\n /g, '')
const octets = (s: string) => new TextEncoder().encode(s).length

describe('ics helpers', () => {
  it('escapes text values', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne')
  })

  it('folds long lines at 75 octets without splitting characters', () => {
    const ascii = 'DESCRIPTION:' + 'x'.repeat(200)
    const folded = fold(ascii)
    expect(folded.split('\r\n').every((l) => octets(l) <= 75)).toBe(true)
    expect(unfold(folded)).toBe(ascii)
    const wide = 'SUMMARY:' + '–é😀'.repeat(30)
    const foldedWide = fold(wide)
    expect(foldedWide.split('\r\n').every((l) => octets(l) <= 75)).toBe(true)
    expect(unfold(foldedWide)).toBe(wide)
  })
})

describe('buildIcs', () => {
  const items = SAMPLE_COURSES.flatMap((c, k) => extractItems(c.name, c.text, SAMPLE_TERM, `c${k}`))
  const plan = buildPlan(items, SAMPLE_TERM)
  const now = new Date(Date.UTC(2026, 10, 1, 12, 0, 0))
  const ics = buildIcs(items, plan, now)

  it('is a valid calendar with CRLF line endings', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true)
    expect(ics.replace(/\r\n/g, '').includes('\n')).toBe(false)
    expect(ics.split('\r\n').every((l) => octets(l) <= 75)).toBe(true)
    expect(ics).toContain('DTSTAMP:20261101T120000Z')
  })

  it('has one deadline per item and a start event for the bigger ones', () => {
    const included = items.filter((i) => i.include)
    const starts = included.filter((i) => needsStartReminder(i, plan.items[i.id]))
    expect(starts.length).toBeGreaterThan(5)
    expect(starts.length).toBeLessThan(included.length)
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(included.length + starts.length)
    expect(ics.match(/BEGIN:VALARM/g)?.length).toBe(starts.length)
    const flat = unfold(ics)
    expect(flat).toContain('SUMMARY:Due: CS 201 · Data Structures – Midterm exam (20%)')
    expect(flat).toContain('DTSTART;VALUE=DATE:20270309\r\nDTEND;VALUE=DATE:20270310')
  })

  it('keeps the same UIDs between exports', () => {
    const again = buildIcs(items, plan, new Date(Date.UTC(2026, 11, 1)))
    const uids = (s: string) => s.match(/UID:[^\r]+/g)
    expect(uids(again)).toEqual(uids(ics))
    expect(new Set(uids(ics)).size).toBe(uids(ics)!.length)
  })
})
