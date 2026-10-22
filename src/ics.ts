// Writes the deadlines and suggested start days as an iCalendar file (RFC 5545) that Google Calendar, Apple Calendar
// and Outlook can import. All events are all-day and marked free so they do not block meetings.

import { addDays, TYPE_LABEL, type Item } from './extract'
import { dayDate, hours } from './format'
import type { ItemPlan, Plan } from './plan'

/** Items of at least this many hours get a "start" event with a 9 am reminder, as do items the plan starts early. */
export const START_REMINDER_HOURS = 8

export function needsStartReminder(it: Item, p: ItemPlan | undefined): boolean {
  return !!p && p.start < it.date && (it.hours >= START_REMINDER_HOURS || p.earlierBy > 0)
}

export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

/** Splits a content line into lines of at most 75 octets without cutting a UTF-8 character. */
export function fold(line: string): string {
  const encoder = new TextEncoder()
  const parts: string[] = []
  let current = ''
  let size = 0
  let limit = 75
  for (const ch of line) {
    const n = encoder.encode(ch).length
    if (size + n > limit) {
      parts.push(current)
      current = ''
      size = 0
      limit = 74 // a continuation line starts with one space
    }
    current += ch
    size += n
  }
  parts.push(current)
  return parts.join('\r\n ')
}

/** FNV-1a, so the same item gets the same UID in every export and a re-import updates instead of duplicating. */
function hash(s: string): string {
  let h = 0x811c9dc5
  for (const ch of s) {
    h ^= ch.codePointAt(0)!
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

const compact = (isoDate: string) => isoDate.replaceAll('-', '')

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function event(lines: string[], uid: string, date: string, summary: string, description: string, now: Date, alarm?: string) {
  lines.push(
    'BEGIN:VEVENT',
    `UID:${uid}@crunchmap`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART;VALUE=DATE:${compact(date)}`,
    `DTEND;VALUE=DATE:${compact(addDays(date, 1))}`,
    `SUMMARY:${escapeText(summary)}`,
    `DESCRIPTION:${escapeText(description)}`,
    'TRANSP:TRANSPARENT',
  )
  if (alarm) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(alarm)}`, 'TRIGGER:PT9H', 'END:VALARM')
  lines.push('END:VEVENT')
}

export function buildIcs(items: Item[], plan: Plan, now = new Date()): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Crunchmap//Semester plan//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Crunchmap']
  for (const it of items) {
    if (!it.include) continue
    const p = plan.items[it.id]
    const key = `${it.course}|${it.title}|${it.date}`
    const weight = `${it.weight}%${it.weightSource === 'default' ? ' (estimated)' : ''}`
    const startNote = p ? ` Suggested start: ${dayDate(p.start)}.` : ''
    event(
      lines,
      `due-${hash(key)}`,
      it.date,
      `Due: ${it.course} – ${it.title} (${it.weight}%)`,
      `${TYPE_LABEL[it.type]}, ${weight} of the grade. About ${hours(it.hours)} of work.${startNote}\nSyllabus line: ${it.source}`,
      now,
    )
    if (p && needsStartReminder(it, p)) {
      event(
        lines,
        `start-${hash(key)}`,
        p.start,
        `Start: ${it.course} – ${it.title}`,
        `About ${hours(it.hours)} of work before it is due on ${dayDate(it.date)}. Planned by Crunchmap.`,
        now,
        `Start ${it.title} today`,
      )
    }
  }
  lines.push('END:VCALENDAR')
  return lines.map(fold).join('\r\n') + '\r\n'
}
