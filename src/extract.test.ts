import { describe, expect, it } from 'vitest'
import { classify, extractItems, findDate, gradingRules, statedWeight, type Term } from './extract'
import { SAMPLE_COURSES, SAMPLE_TERM } from './sample'

const FALL: Term = { start: '2026-08-31', end: '2026-12-18' }
const date = (line: string, term = FALL) => findDate(line, term)?.date ?? null

describe('findDate', () => {
  it('reads the common syllabus date formats', () => {
    expect(date('Oct 14 Midterm')).toBe('2026-10-14')
    expect(date('October 14th: Midterm')).toBe('2026-10-14')
    expect(date('Oct. 14 – essay')).toBe('2026-10-14')
    expect(date('14 Oct essay')).toBe('2026-10-14')
    expect(date('Due 10/14')).toBe('2026-10-14')
    expect(date('Due 10/14/2026')).toBe('2026-10-14')
    expect(date('Due 10/14/26')).toBe('2026-10-14')
    expect(date('2026-10-14 quiz')).toBe('2026-10-14')
    expect(date('Wednesday, October 14, 2026: quiz')).toBe('2026-10-14')
  })

  it('counts weeks from the week the term starts', () => {
    // Week 1 starts Monday Aug 31, so week 7 starts Oct 12.
    expect(date('Week 7 Thursday – Midterm')).toBe('2026-10-15')
    expect(date('Week 7 (Thu) – Midterm')).toBe('2026-10-15')
    expect(date('Wk 3 Mon – Problem set 2')).toBe('2026-09-14')
    expect(date('Week 7 – Midterm')).toBe('2026-10-16') // a bare week means its Friday
  })

  it('picks the year that puts the date inside the term', () => {
    const winter: Term = { start: '2026-08-31', end: '2027-01-15' }
    expect(date('Jan 12 Final exam', winter)).toBe('2027-01-12')
    expect(date('Sep 2 Quiz', winter)).toBe('2026-09-02')
  })

  it('uses the date after "due" when a line has two dates', () => {
    expect(date('Sep 30: Project assigned, due Oct 14')).toBe('2026-10-14')
    expect(date('Proposal due Oct 14 (assigned Sep 30)')).toBe('2026-10-14')
  })

  it('ignores numbers that only look like dates', () => {
    expect(date('Write a 1/2 page summary')).toBeNull()
    expect(date('Chapter 3.2 and 4.1')).toBeNull()
    expect(date('Room 101, 9:30')).toBeNull()
  })
})

describe('classify and weights', () => {
  it('tells item types apart', () => {
    expect(classify('Midterm exam')).toBe('exam')
    expect(classify('Final')).toBe('exam')
    expect(classify('Midterm review session')).toBe('other')
    expect(classify('Lab report 2')).toBe('assignment')
    expect(classify('Final project presentation')).toBe('presentation')
    expect(classify('Final paper')).toBe('paper')
    expect(classify('Team project proposal')).toBe('project')
    expect(classify('Problem set 4')).toBe('assignment')
    expect(classify('Quiz 2')).toBe('quiz')
    expect(classify('Read chapter 5')).toBe('reading')
  })

  it('reads a stated weight', () => {
    expect(statedWeight('Midterm (20%)')).toBe(20)
    expect(statedWeight('Quiz 2.5 %')).toBe(2.5)
    expect(statedWeight('Essay, 15 percent of the grade')).toBe(15)
    expect(statedWeight('Essay')).toBeNull()
  })

  it('reads a grading breakdown', () => {
    const rules = gradingRules('Grading: problem sets 30%, two exams 20% each, final exam 30%.', FALL)
    expect(rules).toEqual([
      { type: 'assignment', percent: 30, each: false, qualifier: undefined },
      { type: 'exam', percent: 20, each: true, qualifier: undefined },
      { type: 'exam', percent: 30, each: false, qualifier: 'final' },
    ])
  })
})

describe('extractItems', () => {
  it('keeps graded work and drops dated lines that are not work', () => {
    const text = [
      'Sep 3: Introduction to cells',
      'Sep 7 Labor Day, no class',
      'HW 3 out Sep 10',
      'Sep 17: HW 3 due',
      'Oct 12–16: Fall break',
      'Oct 14 Midterm review session',
      'Oct 15 Midterm 1 (20%)',
      'Oct 30: last day to drop',
      'Dec 15, 8:00–10:00 am: Final (30%)',
    ].join('\n')
    const items = extractItems('BIO', text, FALL)
    expect(items.map((i) => [i.title, i.date, i.type, i.weight])).toEqual([
      ['HW 3', '2026-09-17', 'assignment', 5],
      ['Midterm 1', '2026-10-15', 'exam', 20],
      ['Final', '2026-12-15', 'exam', 30],
    ])
  })

  it('cleans titles and gives ids by line number', () => {
    const items = extractItems('CS', 'Week 8 Tue – Midterm exam (20%)\n\nFriday, January 29: Problem set 1 due', SAMPLE_TERM, 'cs')
    expect(items.map((i) => [i.id, i.title])).toEqual([
      ['cs-1', 'Midterm exam'],
      ['cs-3', 'Problem set 1'],
    ])
  })

  it('reads every course in the sample semester', () => {
    const items = SAMPLE_COURSES.flatMap((c, k) => extractItems(c.name, c.text, SAMPLE_TERM, `c${k}`))
    const count = (name: string) => items.filter((i) => i.course === name).length
    expect(SAMPLE_COURSES.map((c) => count(c.name))).toEqual([11, 10, 9, 9])
    for (const c of SAMPLE_COURSES.slice(0, 3)) {
      const total = items.filter((i) => i.course === c.name).reduce((s, i) => s + i.weight, 0)
      expect(total).toBe(100)
    }
    const math = items.filter((i) => i.course.startsWith('MATH'))
    expect(math.filter((i) => i.type === 'assignment').map((i) => i.weight)).toEqual([5, 5, 5, 5, 5, 5])
    expect(math.filter((i) => i.type === 'exam').map((i) => [i.title, i.weight])).toEqual([
      ['Exam 1', 20],
      ['Exam 2', 20],
      ['Final exam', 30],
    ])
    expect(math.every((i) => i.weightSource === 'grading')).toBe(true)
    const cs = items.filter((i) => i.course.startsWith('CS'))
    expect(cs.find((i) => i.title === 'Midterm exam')?.date).toBe('2027-03-09')
    expect(items.find((i) => i.title === 'Final exam' && i.course.startsWith('BIO'))?.date).toBe('2027-05-10')
    expect(items.find((i) => i.title === 'Paper 1')?.date).toBe('2027-03-12')
  })
})
