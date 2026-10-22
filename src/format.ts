import { parseIso } from './extract'

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Mar 11" */
export function shortDate(s: string): string {
  const d = parseIso(s)
  return `${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}`
}

/** "Thu, Mar 11" */
export function dayDate(s: string): string {
  return `${WEEKDAY[parseIso(s).getUTCDay()]}, ${shortDate(s)}`
}

/** "12 h", "3.5 h" */
export function hours(h: number): string {
  const r = Math.round(h * 2) / 2
  return `${Number.isInteger(r) ? r : r.toFixed(1)} h`
}

/** The course code or first word, for compact labels: "BIO 210 · Cell Biology" -> "BIO 210". */
export function courseShort(name: string): string {
  const head = name.split(/\s+[·:–—-]\s+/)[0].trim()
  return head.length <= 12 ? head : head.slice(0, 11) + '…'
}
