// A made-up spring semester with four courses. Each schedule is written the way a different instructor might write it,
// so the sample also shows the date formats Crunchmap understands. No real course or school is described.

import type { Term } from './extract'

export const SAMPLE_TERM: Term = { start: '2027-01-19', end: '2027-05-14' }

export const SAMPLE_COURSES: { name: string; text: string }[] = [
  {
    name: 'CS 201 · Data Structures',
    text: `Week 2 Fri – Programming assignment 1 due (5%)
Week 4 Fri – Programming assignment 2 due (5%)
Week 5 Wed – Quiz 1 (2.5%)
Week 6 Fri – Programming assignment 3 due (5%)
Week 8 Tue – Midterm exam (20%)
Week 9 – Spring break, no classes
Week 11 Fri – Programming assignment 4 due (5%)
Week 12 Wed – Quiz 2 (2.5%)
Week 13 Fri – Team project proposal due (5%)
Week 14 Fri – Programming assignment 5 due (5%)
Week 16 Thu – Team project final submission (20%)
Week 17 Tue – Final exam (25%)`,
  },
  {
    name: 'BIO 210 · Cell Biology',
    text: `Jan 21  Syllabus and introduction
Jan 28  Lab report 1 due (5%)
Feb 11  Lab report 2 due (5%)
Feb 18  Quiz: membranes (5%)
Feb 25  Lab report 3 due (5%)
Mar 11  Midterm 1 (15%)
Mar 15–19  Spring break
Mar 25  Lab report 4 due (5%)
Apr 8   Midterm 2 (15%)
Apr 15  Lab report 5 due (5%)
Apr 29  Research poster session (15%)
May 10  Final exam, 8:00–10:00 am (25%)`,
  },
  {
    name: 'HIST 150 · The Modern World',
    text: `1/19  First class: course overview
1/26  Reading response 1 due (5%)
2/9   Reading response 2 due (5%)
2/23  Primary source analysis due (10%)
3/12  Paper 1 due (15%)
3/30  Reading response 3 due (5%)
4/13  Reading response 4 due (5%)
4/23  Final paper proposal due (5%)
5/7   Final paper due (25%)
5/12  Final exam (25%)`,
  },
  {
    name: 'MATH 220 · Linear Algebra',
    text: `Grading: problem sets 30%, two exams 20% each, final exam 30%.
Friday, January 29: Problem set 1 due
Friday, February 12: Problem set 2 due
Friday, February 26: Problem set 3 due
Wednesday, March 10: Exam 1
Friday, March 26: Problem set 4 due
Friday, April 9: Problem set 5 due
Wednesday, April 21: Exam 2
Friday, May 7: Problem set 6 due
Thursday, May 13: Final exam`,
  },
]
