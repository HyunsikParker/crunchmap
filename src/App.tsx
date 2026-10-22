import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { addDays, estimateHours, extractItems, isIsoDate, TYPE_LABEL, type Item, type ItemType, type Term } from './extract'
import { courseShort, dayDate, hours, shortDate } from './format'
import { buildIcs, needsStartReminder, START_REMINDER_HOURS } from './ics'
import { buildPlan, describeItems, type Plan, type Week } from './plan'
import { SAMPLE_COURSES, SAMPLE_TERM } from './sample'

interface Course {
  id: string
  name: string
  text: string
}

type Override = Partial<Pick<Item, 'title' | 'date' | 'type' | 'weight' | 'hours' | 'include'>>

interface Saved {
  term: Term
  courses: Course[]
  overrides: Record<string, Override>
  cap: number | null
  sample: boolean
}

const STORAGE_KEY = 'crunchmap.v1'
const TYPES = Object.keys(TYPE_LABEL) as ItemType[]

function sampleState(): Saved {
  return {
    term: SAMPLE_TERM,
    courses: SAMPLE_COURSES.map((c, k) => ({ id: `s${k + 1}`, ...c })),
    overrides: {},
    cap: null,
    sample: true,
  }
}

/** The fall or spring term that contains today, roughly; the user can change both dates. */
function defaultTerm(today = new Date()): Term {
  const y = today.getFullYear()
  const firstMonday = (from: string) => {
    let d = from
    while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 1) d = addDays(d, 1)
    return d
  }
  if (today.getMonth() <= 4) return { start: firstMonday(`${y}-01-08`), end: `${y}-05-15` }
  return { start: firstMonday(`${y}-08-24`), end: `${y}-12-18` }
}

function emptyState(): Saved {
  return { term: defaultTerm(), courses: [{ id: 'c1', name: '', text: '' }], overrides: {}, cap: null, sample: false }
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const s = JSON.parse(raw) as Saved
      if (s && Array.isArray(s.courses) && s.term && isIsoDate(s.term.start) && isIsoDate(s.term.end)) return s
    }
  } catch {
    // Storage can be unavailable (private windows, blocked site data); start fresh.
  }
  return sampleState()
}

const keyOf = (courseId: string, source: string) => `${courseId}::${source}`

function applyOverride(it: Item, o: Override | undefined): Item {
  if (!o) return it
  const next: Item = { ...it, ...o }
  if (o.weight !== undefined) next.weightSource = 'user'
  if (o.hours !== undefined) next.hoursEdited = true
  else if (o.weight !== undefined || o.type !== undefined) next.hours = estimateHours(next.type, next.weight)
  return next
}

function weekRange(monday: string): string {
  const sunday = addDays(monday, 6)
  const [a, b] = [shortDate(monday), shortDate(sunday)]
  return a.split(' ')[0] === b.split(' ')[0] ? `${a}–${b.split(' ')[1]}` : `${a} – ${b}`
}

function weekName(w: Week): string {
  return w.index >= 1 ? `Week ${w.index}` : 'Before term'
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

export default function App() {
  const [state, setState] = useState<Saved>(load)
  const [announce, setAnnounce] = useState('')
  const [exportNote, setExportNote] = useState('')
  const [openWeek, setOpenWeek] = useState<string | null>(null)
  const nextCourse = useRef(1 + Math.max(0, ...state.courses.map((c) => Number(c.id.replace(/\D/g, '')) || 0)))

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // Not saving is fine; the page still works.
    }
  }, [state])

  const { term, overrides } = state
  const courses = useDeferredValue(state.courses)
  const termError = !isIsoDate(term.start) || !isIsoDate(term.end)
    ? 'Enter both dates.'
    : term.end <= term.start
      ? 'The last day must come after the first day.'
      : term.end > addDays(term.start, 400)
        ? 'A term this long is probably a typo; check the year.'
        : ''

  const items = useMemo(() => {
    if (termError) return []
    return courses.flatMap((c) =>
      extractItems(c.name.trim() || 'Untitled course', c.text, term, c.id).map((it) => applyOverride(it, overrides[keyOf(c.id, it.source)])),
    )
  }, [courses, term, overrides, termError])

  const plan = useMemo(() => (termError ? null : buildPlan(items, term, state.cap ?? undefined)), [items, term, state.cap, termError])
  const included = items.filter((it) => it.include)
  const crunchWeeks = plan?.weeks.filter((w) => w.crunch) ?? []

  useEffect(() => {
    const t = setTimeout(() => {
      setAnnounce(included.length ? `${plural(included.length, 'deadline')} found. ${plural(crunchWeeks.length, 'crunch week')}.` : '')
    }, 600)
    return () => clearTimeout(t)
  }, [included.length, crunchWeeks.length])

  const update = (patch: Partial<Saved>) => setState((s) => ({ ...s, ...patch }))
  const setCourse = (id: string, patch: Partial<Course>) =>
    setState((s) => ({ ...s, courses: s.courses.map((c) => (c.id === id ? { ...c, ...patch } : c)) }))
  const addCourse = () => {
    const id = `c${nextCourse.current++}`
    setState((s) => ({ ...s, courses: [...s.courses, { id, name: '', text: '' }] }))
    requestAnimationFrame(() => document.getElementById(`name-${id}`)?.focus())
  }
  const removeCourse = (id: string) => setState((s) => ({ ...s, courses: s.courses.filter((c) => c.id !== id) }))
  const editItem = (it: Item, o: Override) => {
    const courseId = it.id.slice(0, it.id.lastIndexOf('-'))
    const key = keyOf(courseId, it.source)
    setState((s) => ({ ...s, overrides: { ...s.overrides, [key]: { ...s.overrides[key], ...o } } }))
  }
  const startOwn = () => {
    nextCourse.current = 2
    setState(emptyState())
    setExportNote('')
    requestAnimationFrame(() => document.getElementById('term-start')?.focus())
  }

  const hasOwnWork = !state.sample && state.courses.some((c) => c.text.trim() || c.name.trim())
  const loadSample = () => {
    if (hasOwnWork && !window.confirm('Replace your courses with the sample semester?')) return
    setState(sampleState())
    setExportNote('')
  }
  const clearAll = () => {
    if (hasOwnWork && !window.confirm('Remove your courses from this page and from this browser?')) return
    nextCourse.current = 2
    setState(emptyState())
    setExportNote('')
  }

  const pickWeek = (monday: string) => {
    setOpenWeek(monday)
    requestAnimationFrame(() => {
      const row = document.getElementById(`week-${monday}`)
      row?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      row?.focus({ preventScroll: true })
    })
  }

  const download = () => {
    if (!plan) return
    const ics = buildIcs(items, plan)
    const starts = included.filter((it) => needsStartReminder(it, plan.items[it.id])).length
    const name = `crunchmap-${term.start}.ics`
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
    setExportNote(`Saved ${name}: ${plural(included.length, 'deadline')} and ${plural(starts, 'start reminder')}. Import it into Google Calendar, Apple Calendar or Outlook.`)
  }

  return (
    <div className="app">
      <header className="masthead">
        <p className="brand"><span className="logo" aria-hidden="true"><i /><i /><i /></span>Crunchmap</p>
        <h1>See your semester&rsquo;s crunch weeks before they arrive</h1>
        <p className="lede">
          Paste the schedule from each syllabus. Crunchmap finds the deadlines, shows which weeks pile up, and suggests when
          to start each assignment so no day gets out of hand. <strong>Everything stays in your browser.</strong>
        </p>
      </header>

      <main className="layout">
        <section className="inputs" aria-labelledby="inputs-title">
          <h2 id="inputs-title" className="section-title">Your courses</h2>
          {state.sample && (
            <div className="sample-note">
              <p>You are looking at a made-up sample semester with four courses.</p>
              <button type="button" className="primary" onClick={startOwn}>Start with my own courses</button>
            </div>
          )}

          <fieldset className="term">
            <legend>Term dates</legend>
            <div className="term-fields">
              <label>
                <span>First day of classes</span>
                <input id="term-start" type="date" value={term.start} onChange={(e) => update({ term: { ...term, start: e.target.value } })} />
              </label>
              <label>
                <span>Last day of exams</span>
                <input type="date" value={term.end} onChange={(e) => update({ term: { ...term, end: e.target.value } })} />
              </label>
            </div>
            {termError && <p className="field-error" role="alert">{termError}</p>}
          </fieldset>

          <ol className="courses">
            {state.courses.map((c, k) => (
              <CourseCard
                key={c.id}
                course={c}
                index={k}
                found={items.filter((it) => it.id.startsWith(`${c.id}-`)).length}
                onChange={(patch) => setCourse(c.id, patch)}
                onRemove={state.courses.length > 1 ? () => removeCourse(c.id) : undefined}
              />
            ))}
          </ol>
          <div className="input-actions">
            <button type="button" className="secondary" onClick={addCourse}>Add a course</button>
            {!state.sample && (
              <>
                <button type="button" className="link" onClick={loadSample}>Load the sample semester</button>
                <button type="button" className="link" onClick={clearAll}>Clear everything</button>
              </>
            )}
          </div>

          <details className="help">
            <summary>What Crunchmap can read</summary>
            <ul>
              <li>One deadline per line, with a date in almost any form: <code>Oct 14</code>, <code>October 14th</code>, <code>14 Oct</code>,{' '}
                <code>10/14</code>, <code>2026-10-14</code>, or <code>Week 7 Thu</code> (counted from the first week of the term).</li>
              <li>The kind of work comes from words such as exam, midterm, quiz, paper, essay, project, presentation, problem set,
                homework or lab report. Dated lines without graded work (&ldquo;no class&rdquo;, lectures, breaks) are skipped.</li>
              <li>A weight in the line, like <code>(20%)</code>, is used as written. A grading line without a date, like{' '}
                <code>Problem sets 30%, final exam 30%</code>, is shared out over the matching items. Otherwise a typical weight
                for the kind of work is assumed and marked &ldquo;est.&rdquo;</li>
              <li>Pasting the whole syllabus works too; lines without a date are ignored.</li>
            </ul>
          </details>
        </section>

        <section className="results" aria-labelledby="results-title">
          <h2 id="results-title" className="sr-only">Your semester</h2>
          <p className="sr-only" aria-live="polite">{announce}</p>
          {!plan || included.length === 0 ? (
            <EmptyState termError={termError} />
          ) : (
            <>
              <Verdict plan={plan} crunchWeeks={crunchWeeks} items={included} onPickWeek={pickWeek} />
              <CapControl plan={plan} onChange={(cap) => update({ cap })} onDownload={download} note={exportNote} />
              <WeekMap plan={plan} items={included} open={openWeek} setOpen={setOpenWeek} />
              <StartList plan={plan} items={included} />
              <DeadlineTable items={items} onEdit={editItem} />
            </>
          )}
        </section>
      </main>

      <footer className="footer">
        <p>
          Crunchmap runs entirely in your browser: nothing you paste is uploaded, and the page cannot make network requests.
          Your courses are kept in this browser&rsquo;s storage until you clear them. Open source, built for LaunchPad Hacks 2026.
        </p>
      </footer>
    </div>
  )
}

function CourseCard({ course, index, found, onChange, onRemove }: {
  course: Course
  index: number
  found: number
  onChange: (patch: Partial<Course>) => void
  onRemove?: () => void
}) {
  const label = course.name.trim() || `Course ${index + 1}`
  return (
    <li className="course">
      <div className="course-head">
        <label className="course-name">
          <span className="sr-only">Course name</span>
          <input
            id={`name-${course.id}`}
            type="text"
            value={course.name}
            placeholder={`Course ${index + 1} name, e.g. BIO 210`}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </label>
        {onRemove && (
          <button type="button" className="icon-button" onClick={onRemove} aria-label={`Remove ${label}`}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" /></svg>
          </button>
        )}
      </div>
      <label className="course-text">
        <span className="sr-only">Schedule for {label}</span>
        <textarea
          value={course.text}
          rows={7}
          spellCheck={false}
          placeholder={'Paste the schedule or due dates, for example:\nOct 14  Midterm 1 (20%)\nWeek 9 Fri – Problem set 4 due\n11/20  Final paper due'}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      </label>
      <p className="course-status">
        {course.text.trim() ? (found ? `${plural(found, 'deadline')} found` : 'No dated work found yet. Each deadline needs a date on its line.') : 'Nothing pasted yet.'}
      </p>
    </li>
  )
}

function EmptyState({ termError }: { termError: string }) {
  return (
    <div className="empty">
      <div className="empty-map" aria-hidden="true">
        {[0.15, 0.3, 0.2, 0.55, 0.25, 0.9, 0.35, 0.2, 0.6, 1].map((v, k) => <span key={k} className={`heat-${Math.min(4, Math.floor(v * 5))}`} />)}
      </div>
      <h3>Your semester map will appear here</h3>
      <p>{termError ? 'Set the term dates first.' : 'Paste the schedule of at least one course. Each deadline needs a date on its line.'}</p>
    </div>
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Why a week is heavy: what is due in it, and which items due the week after get their last-minute work in it. */
function whyHeavy(w: Week, plan: Plan, items: Item[]): string {
  const sunday = addDays(w.monday, 6)
  const due = describeItems(w.due)
  const prep = describeItems(items.filter((it) => it.date > sunday && plan.items[it.id] && plan.items[it.id].cramStart <= sunday))
  const verb = w.due.filter((it) => it.weight >= 10).length > 1 ? 'are' : 'is'
  if (due && prep) return `${capitalize(due)} ${verb} due, and last-minute work for ${prep} due the next week lands here too.`
  if (due) return `${capitalize(due)} ${verb} due.`
  if (prep) return `Last-minute work for ${prep} due the next week lands here.`
  return `${plural(w.due.length, 'smaller deadline')} ${w.due.length === 1 ? 'is' : 'are'} due.`
}

function listWeeks(weeks: Week[]): string {
  const n = weeks.map((w) => String(w.index))
  return n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`
}

function Verdict({ plan, crunchWeeks, items, onPickWeek }: { plan: Plan; crunchWeeks: Week[]; items: Item[]; onPickWeek: (monday: string) => void }) {
  const hardest = [...plan.weeks].sort((a, b) => b.lastMinute - a.lastMinute)[0]
  const moved = items.filter((it) => (plan.items[it.id]?.earlierBy ?? 0) > 0).length
  return (
    <div className="verdict">
      <p className="eyebrow">
        {crunchWeeks.length ? `${plural(crunchWeeks.length, 'crunch week')}: ${crunchWeeks.length === 1 ? 'week' : 'weeks'} ${listWeeks(crunchWeeks)}` : 'No crunch weeks'}
      </p>
      <h3>{weekName(hardest)} ({weekRange(hardest.monday)}) is your hardest week.</h3>
      <p className="why">
        {whyHeavy(hardest, plan, items)} Done at the last minute, it takes about {hours(hardest.lastMinute)} of work; with the plan below,{' '}
        {hours(hardest.planned)}.
      </p>
      <SemesterChart plan={plan} onPick={onPickWeek} />
      <dl className="compare">
        <div>
          <dt>Busiest week</dt>
          <dd><span className="before">{hours(plan.peakWeek.lastMinute)}</span><span className="arrow" aria-label="becomes">→</span><span className="after">{hours(plan.peakWeek.planned)}</span></dd>
        </div>
        <div>
          <dt>Busiest day</dt>
          <dd><span className="before">{hours(plan.peakDay.lastMinute)}</span><span className="arrow" aria-label="becomes">→</span><span className="after">{hours(plan.peakDay.planned)}</span></dd>
        </div>
        <div>
          <dt>Starts moved earlier</dt>
          <dd><span className="after">{moved}</span><span className="of"> of {items.length}</span></dd>
        </div>
      </dl>
      <p className="fine">
        &ldquo;Last minute&rdquo; means every item is done in the few days before it is due. Hours are rough estimates from each
        item&rsquo;s kind and weight (a 20% exam is about 12 hours of study); change them in the deadline table.
      </p>
    </div>
  )
}

function niceStep(max: number): number {
  for (const step of [5, 10, 20, 25, 50, 100]) if (max / step <= 5) return step
  return Math.ceil(max / 500) * 100
}

// Plot margins; .chart-hits in styles.css uses the same left, right and bottom values.
const CHART = { left: 36, right: 8, top: 12, bottom: 26, height: 200 }

function SemesterChart({ plan, onPick }: { plan: Plan; onPick: (monday: string) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [active, setActive] = useState(0)
  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const weeks = plan.weeks
  const n = weeks.length
  const plotW = width - CHART.left - CHART.right
  const plotH = CHART.height - CHART.top - CHART.bottom
  const base = CHART.top + plotH
  const slot = plotW / n
  const colW = Math.min(24, Math.max(4, slot * 0.58))
  const maxV = Math.max(1, ...weeks.map((w) => Math.max(w.lastMinute, w.planned)))
  const step = niceStep(maxV)
  const top = Math.ceil(maxV / step) * step
  const y = (v: number) => base - (v / top) * plotH
  const cx = (k: number) => CHART.left + slot * (k + 0.5)
  const ticks: number[] = []
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(v)
  const column = (k: number, v: number) => {
    const h = (v / top) * plotH
    if (h < 0.5) return ''
    const r = Math.min(4, h, colW / 2)
    const x0 = cx(k) - colW / 2
    const x1 = cx(k) + colW / 2
    const yt = base - h
    return `M${x0},${base}V${yt + r}Q${x0},${yt} ${x0 + r},${yt}H${x1 - r}Q${x1},${yt} ${x1},${yt + r}V${base}Z`
  }
  let line = ''
  weeks.forEach((w, k) => {
    const x0 = CHART.left + slot * k
    line += `${k === 0 ? `M${x0},${y(w.planned)}` : `V${y(w.planned)}`}H${x0 + slot}`
  })
  const peak = weeks.reduce((best, w, k) => (w.lastMinute > weeks[best].lastMinute ? k : best), 0)
  // Week numbers need about 20px each; on narrow screens label every other week, crunch weeks first.
  const every = slot < 20 ? 2 : 1
  const labelled: number[] = []
  const fits = (k: number) => labelled.every((j) => Math.abs(j - k) >= every)
  weeks.forEach((w, k) => w.crunch && fits(k) && labelled.push(k))
  weeks.forEach((_, k) => k % every === 0 && fits(k) && labelled.push(k))

  const focusWeek = (k: number) => {
    const next = Math.max(0, Math.min(n - 1, k))
    setActive(next)
    box.current?.querySelectorAll<HTMLButtonElement>('.hit')[next]?.focus()
  }
  const onKey = (e: React.KeyboardEvent) => {
    const keys: Record<string, number> = { ArrowRight: active + 1, ArrowLeft: active - 1, Home: 0, End: n - 1 }
    if (e.key in keys) {
      e.preventDefault()
      focusWeek(keys[e.key])
    }
  }

  return (
    <figure className="chart" aria-labelledby="chart-caption">
      <figcaption id="chart-caption" className="chart-caption">
        <span>Hours of work per week</span>
        <span className="chart-legend" aria-hidden="true">
          <span><i className="key last" />last minute</span>
          <span><i className="key plan-line" />with the plan</span>
          <span><i className="key crunch" />crunch week</span>
        </span>
      </figcaption>
      <div className="chart-box" ref={box}>
        <svg width={width} height={CHART.height} viewBox={`0 0 ${width} ${CHART.height}`} aria-hidden="true">
          {weeks.map((w, k) => w.crunch && (
            <rect key={`band-${w.monday}`} className="crunch-band" x={CHART.left + slot * k + 1} y={CHART.top} width={slot - 2} height={plotH} rx="3" />
          ))}
          {ticks.map((v) => (
            <g key={v}>
              <line className="grid" x1={CHART.left} x2={width - CHART.right} y1={y(v)} y2={y(v)} />
              <text className="tick" x={CHART.left - 6} y={y(v) + 4} textAnchor="end">{v}</text>
            </g>
          ))}
          {weeks.map((w, k) => <path key={w.monday} className={`col${k === active ? ' is-active' : ''}`} d={column(k, w.lastMinute)} />)}
          <path className="plan-halo" d={line} />
          <path className="plan-line" d={line} />
          {weeks[peak].lastMinute > 0 && (
            <text className="peak" x={cx(peak)} y={y(weeks[peak].lastMinute) - 6} textAnchor="middle">{hours(weeks[peak].lastMinute)}</text>
          )}
          {weeks.map((w, k) => labelled.includes(k) && (
            <text key={`x-${w.monday}`} className={`xlabel${w.crunch ? ' is-crunch' : ''}`} x={cx(k)} y={CHART.height - 8} textAnchor="middle">{w.index}</text>
          ))}
        </svg>
        <div className="chart-hits" role="group" aria-label="Weeks of the term; use the arrow keys to move between weeks" onKeyDown={onKey}>
          {weeks.map((w, k) => (
            <button
              key={w.monday}
              type="button"
              className={`hit${k < 3 ? ' tip-start' : k > n - 4 ? ' tip-end' : ''}`}
              tabIndex={k === active ? 0 : -1}
              onFocus={() => setActive(k)}
              onMouseEnter={() => setActive(k)}
              onClick={() => onPick(w.monday)}
              aria-label={`${weekName(w)}, ${weekRange(w.monday)}: ${hours(w.lastMinute)} at the last minute, ${hours(w.planned)} with the plan${w.crunch ? `. Crunch week: ${w.reason}` : ''}. Show this week in the list.`}
            >
              <span className="tip" aria-hidden="true">
                <strong>{weekName(w)}</strong> <span className="muted">{weekRange(w.monday)}</span>
                <span className="tip-row"><i className="key last" /><b>{hours(w.lastMinute)}</b> last minute</span>
                <span className="tip-row"><i className="key plan-line" /><b>{hours(w.planned)}</b> with the plan</span>
                {w.crunch && <span className="tip-crunch">Crunch: {w.reason}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </figure>
  )
}

function CapControl({ plan, onChange, onDownload, note }: { plan: Plan; onChange: (cap: number | null) => void; onDownload: () => void; note: string }) {
  const [draft, setDraft] = useState(String(plan.cap))
  useEffect(() => setDraft(String(plan.cap)), [plan.cap])
  const commit = (v: string) => {
    const n = Number(v)
    if (!Number.isFinite(n) || n <= 0) return setDraft(String(plan.cap))
    onChange(n <= plan.minCap ? plan.minCap : Math.min(16, Math.round(n * 2) / 2))
  }
  return (
    <div className="cap">
      <div className="cap-field">
        <label htmlFor="cap">Keep each day under</label>
        <div className="stepper">
          <button type="button" aria-label="Lower the daily limit" onClick={() => commit(String(Math.max(plan.minCap, plan.cap - 0.5)))} disabled={plan.cap <= plan.minCap}>−</button>
          <input id="cap" inputMode="decimal" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commit((e.target as HTMLInputElement).value) }} aria-describedby="cap-hint" />
          <button type="button" aria-label="Raise the daily limit" onClick={() => commit(String(plan.cap + 0.5))}>+</button>
        </div>
        <span className="unit">hours of coursework</span>
        <p id="cap-hint" className="fine">The lowest limit that still fits every deadline is {hours(plan.minCap)} a day. A higher limit lets work start later.</p>
      </div>
      <div className="cap-export">
        <button type="button" className="primary" onClick={onDownload}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 7h12v9H4zM4 7V5h12v2M7 3v3M13 3v3M7 11h2M11 11h2M7 14h2" /></svg>
          Add to my calendar (.ics)
        </button>
        <p className="fine">Every deadline, plus a 9 am &ldquo;start&rdquo; reminder for each item the plan starts early or that needs {START_REMINDER_HOURS} hours or more.</p>
        {note && <p className="export-note" role="status">{note}</p>}
      </div>
    </div>
  )
}

function WeekMap({ plan, items, open, setOpen }: { plan: Plan; items: Item[]; open: string | null; setOpen: (monday: string | null) => void }) {
  const max = Math.max(1, plan.peakWeek.lastMinute, plan.peakWeek.planned)
  const byId = new Map(items.map((it) => [it.id, it]))
  return (
    <section className="map" aria-labelledby="map-title">
      <div className="map-head">
        <h3 id="map-title" className="section-title">Week by week</h3>
        <p className="legend" aria-hidden="true">
          <span><i className="key last" />last minute</span>
          <span><i className="key plan" />with the plan</span>
        </p>
      </div>
      <ol className="weeks">
        {plan.weeks.map((w) => {
          const id = `wk-${w.monday}`
          const isOpen = open === w.monday
          const work = weekWork(plan, w, byId)
          return (
            <li key={w.monday} id={`week-${w.monday}`} tabIndex={-1} className={`week${w.crunch ? ' is-crunch' : ''}${w.due.length ? '' : ' is-quiet'}`}>
              <div className="wk-label">
                <span className="wk-name">{weekName(w)}</span>
                <span className="wk-dates">{weekRange(w.monday)}</span>
              </div>
              <div className="wk-due">
                {w.crunch && <p className="crunch-tag"><span>Crunch</span> {w.reason}</p>}
                {w.due.length ? (
                  <ul className="chips" aria-label={`Due in ${weekName(w)}`}>
                    {w.due.map((it) => (
                      <li key={it.id} className={`chip${it.weight >= 15 ? ' is-major' : ''}`}>
                        <span className="chip-course">{courseShort(it.course)}</span> {it.title}
                        <span className="chip-meta"> · {shortDate(it.date)} · {it.weight}%</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="none">Nothing due</p>
                )}
              </div>
              <div className="wk-load">
                <Bar label="Last minute" value={w.lastMinute} max={max} kind="last" />
                <Bar label="With the plan" value={w.planned} max={max} kind="plan" />
                {work.length > 0 && (
                  <button type="button" className="link small" aria-expanded={isOpen} aria-controls={id} onClick={() => setOpen(isOpen ? null : w.monday)}>
                    {isOpen ? 'Hide this week’s plan' : 'What to work on'}
                  </button>
                )}
              </div>
              {isOpen && (
                <div className="wk-plan" id={id}>
                  <p className="wk-plan-title">Planned work in {weekName(w)}</p>
                  <ul>
                    {work.map(({ item, h }) => (
                      <li key={item.id}><span className="h">{hours(h)}</span> {item.title} <span className="muted">({courseShort(item.course)}, due {shortDate(item.date)})</span></li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function weekWork(plan: Plan, w: Week, byId: Map<string, Item>): { item: Item; h: number }[] {
  const end = addDays(w.monday, 6)
  const out: { item: Item; h: number }[] = []
  for (const [id, p] of Object.entries(plan.items)) {
    const item = byId.get(id)
    if (!item) continue
    let h = 0
    for (const [day, v] of Object.entries(p.hours)) if (day >= w.monday && day <= end) h += v
    if (h >= 0.25) out.push({ item, h })
  }
  return out.sort((a, b) => b.h - a.h)
}

function Bar({ label, value, max, kind }: { label: string; value: number; max: number; kind: string }) {
  const width = Math.max(value > 0 ? 1.5 : 0, (value / max) * 100)
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <svg className={`bar ${kind}`} viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
        <rect className="track" x="0" y="0" width="100" height="10" rx="2" />
        <rect className="fill" x="0" y="0" width={width} height="10" rx="2" />
      </svg>
      <span className="bar-value">{hours(value)}</span>
    </div>
  )
}

function StartList({ plan, items }: { plan: Plan; items: Item[] }) {
  const [all, setAll] = useState(false)
  const moved = items.filter((it) => (plan.items[it.id]?.earlierBy ?? 0) > 0)
  const shown = (all || !moved.length ? items : moved)
    .filter((it) => plan.items[it.id])
    .sort((a, b) => plan.items[a.id].start.localeCompare(plan.items[b.id].start) || a.date.localeCompare(b.date))
  return (
    <section className="starts" aria-labelledby="starts-title">
      <div className="map-head">
        <h3 id="starts-title" className="section-title">{all || !moved.length ? 'When to start everything' : 'Start these earlier than usual'}</h3>
        {moved.length > 0 && moved.length < items.length && (
          <button type="button" className="link small" onClick={() => setAll(!all)} aria-expanded={all}>
            {all ? `Only the ${moved.length} that start early` : `Show start dates for all ${items.length} items`}
          </button>
        )}
      </div>
      {!all && moved.length > 0 && (
        <p className="fine starts-intro">
          Everything else can start in the usual few days before it is due. These {moved.length} need an earlier start to keep every
          day under {hours(plan.cap)}.
        </p>
      )}
      <ol className="start-list">
        {shown.map((it) => {
          const p = plan.items[it.id]
          return (
            <li key={it.id} className={p.earlierBy > 0 ? 'is-moved' : ''}>
              <div className="start-date"><span>{dayDate(p.start).split(',')[0]}</span>{shortDate(p.start)}</div>
              <div className="start-body">
                <p className="start-title">{it.title} <span className="muted">· {it.course}</span></p>
                <p className="start-meta">
                  Due {dayDate(it.date)} · about {hours(it.hours)}
                  {p.earlierBy > 0 && <> · <strong>{plural(p.earlierBy, 'day')} before a last-minute start</strong></>}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function DeadlineTable({ items, onEdit }: { items: Item[]; onEdit: (it: Item, o: Override) => void }) {
  const rows = [...items].sort((a, b) => a.date.localeCompare(b.date) || a.course.localeCompare(b.course))
  return (
    <section className="deadlines" aria-labelledby="deadlines-title">
      <div className="map-head">
        <h3 id="deadlines-title" className="section-title">Check the deadlines</h3>
        <p className="fine">{plural(items.length, 'item')} read from your syllabi. Fix anything that was read wrong; the map updates as you type.</p>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">Include</span></th>
              <th scope="col">Due</th>
              <th scope="col">Item</th>
              <th scope="col">Kind</th>
              <th scope="col">Weight</th>
              <th scope="col">Hours</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((it) => (
              <tr key={it.id} className={it.include ? '' : 'is-off'}>
                <td data-label="Include">
                  <label className="include">
                    <input type="checkbox" checked={it.include} onChange={(e) => onEdit(it, { include: e.target.checked })} aria-label={`Include ${it.title} (${it.course}) in the plan`} />
                    <span className="include-text" aria-hidden="true">In the plan</span>
                  </label>
                </td>
                <td data-label="Due">
                  <input type="date" value={it.date} onChange={(e) => isIsoDate(e.target.value) && onEdit(it, { date: e.target.value })} aria-label={`Due date of ${it.title}`} />
                </td>
                <td data-label="Item" className="cell-item">
                  <input type="text" value={it.title} onChange={(e) => onEdit(it, { title: e.target.value })} aria-label={`Name of item from ${it.course}`} />
                  <span className="course-tag">{courseShort(it.course)}</span>
                  <span className="source" title="The line this item was read from">{it.source}</span>
                </td>
                <td data-label="Kind">
                  <select value={it.type} onChange={(e) => onEdit(it, { type: e.target.value as ItemType })} aria-label={`Kind of ${it.title}`}>
                    {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                  </select>
                </td>
                <td data-label="Weight">
                  <span className="num-field">
                    <input type="number" min={0} max={100} step={0.5} value={it.weight} onChange={(e) => e.target.value !== '' && onEdit(it, { weight: Math.max(0, Math.min(100, Number(e.target.value))) })} aria-label={`Weight of ${it.title} in percent`} />
                    <span aria-hidden="true">%</span>
                  </span>
                  {it.weightSource === 'default' && <span className="badge" title="Not stated in the syllabus; a typical weight for this kind of work">est.</span>}
                  {it.weightSource === 'grading' && <span className="badge" title="Shared out from the course's grading breakdown">grading</span>}
                </td>
                <td data-label="Hours">
                  <span className="num-field">
                    <input type="number" min={0} max={200} step={1} value={it.hours} onChange={(e) => e.target.value !== '' && onEdit(it, { hours: Math.max(0, Math.min(200, Number(e.target.value))) })} aria-label={`Estimated hours for ${it.title}`} />
                    <span aria-hidden="true">h</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
