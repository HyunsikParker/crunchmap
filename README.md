# Crunchmap

**Paste your syllabi. See which weeks of the term will pile up, and get start dates that keep every day manageable.
Everything happens in your browser.**

Live demo: https://hyunsikparker.github.io/crunchmap/ · Video walkthrough (1 min 47 s, captions):
https://hyunsikparker.github.io/crunchmap/demo.html

The video is recorded from the live page by `scripts/demo.mjs` (Playwright), which first checks every number the
narration quotes against the page. The narration is a synthetic voice (Qwen3-TTS, run locally).

## The problem

Each syllabus lists its own deadlines, and each instructor sets them without seeing the others. A student finds out that
three exams and a paper fall in the same week only when that week arrives, and by then it is too late to spread
the work out.

The timing matters. In the University of Sydney's own assessment data, students did best when their deadlines were about
a week apart and worse when deadlines came closer together
([Teaching@Sydney, March 2023](https://educational-innovation.sydney.edu.au/teaching@sydney/charting-our-students-assessment-workload/)).
Universities publish staff guidance on
[reducing deadline bunching](https://ljmu.ac.uk/staff/assessment-and-feedback-guidance/reducing-deadline-bunching), but a
student can't move a deadline. What a student can move is when the work starts.

## What it does

1. **Read the syllabi.** Paste the schedule part of each syllabus (or the whole thing). Crunchmap finds every line with a
   date and graded work, works out the kind of work (exam, paper, project, problem set, quiz...) and its weight, and lists
   what it found in an editable table.
2. **Map the term.** A week-by-week chart shows the hours of work each week would take if every item were done in the
   few days before it is due, and flags **crunch weeks**: weeks with two or more major deadlines (15% or more each) or 35
   grade points due. The headline names the hardest week and why, including last-minute work for the next week's exams
   that spills into it.
3. **Plan the starts.** Crunchmap computes the latest start date for each item that keeps every day under a daily limit,
   and lists the items that need to start earlier than usual. The limit defaults to the lowest one that still fits every
   deadline, and you can raise it.
4. **Add it to your calendar.** One standard iCalendar (`.ics`) file with every deadline as an all-day event, plus a
   "start" event with a 9 am reminder for each item the plan starts early or that needs 8 hours or more. Google
   Calendar, Apple Calendar and Outlook all import `.ics` files.

## Example

The built-in sample is a made-up spring semester with four courses, each written in a different instructor's style
(`Week 8 Tue`, `Mar 11`, `3/12`, `Friday, January 29`, plus one course whose weights come only from a grading line).
Crunchmap reads 39 deadlines and finds three crunch weeks: week 8 (three exams and a paper, right before spring break),
week 16 (a team project and a final paper) and finals week. Done at the last minute, the busiest week takes about 74
hours and the busiest day 16. With the plan, which starts 14 items earlier (the team project on April 3, about a month
before it is due), no day goes over 4 hours and no week over 28.

## How the plan is computed

- **Hours.** Each item gets an estimate from its kind and weight (for example, a 20% exam is about 12 hours of study and
  a 5% problem set about 4). Every estimate can be changed in the table.
- **Last minute.** The comparison spreads each item's hours over the few days before it is due (3 for an exam, 5 for a
  project, 4 for a paper, 2 for a problem set).
- **The plan.** Each item may start at most a set number of days before it is due (14 for an exam, 35 for a project, 28
  for a paper, 7 for a problem set) and never before the term starts. Crunchmap schedules backwards from the end of the
  term: each day's hours go to the open item whose window closes soonest. This is earliest-deadline-first scheduling run
  in reverse time, so it finds a schedule whenever one exists, and every item starts as late as the daily limit allows.
  A binary search finds the lowest daily limit that fits every deadline.
- **Weights.** A percentage on the item's line is used as written. A grading line without a date, such as
  `Problem sets 30%, two exams 20% each, final exam 30%`, is shared out over the matching items. Anything else gets a
  typical weight for its kind and is marked "est.".

## Honest limits

- The hours are rough estimates, and so is the last-minute comparison. The point is the shape of the term, not an exact
  number; edit the hours if you know better.
- The parser reads common English date formats and course vocabulary. A line it misreads can be fixed in the table, and
  a missed deadline can be added by typing one more line into the syllabus box (for example `Oct 14 Midterm (20%)`).
- It plans coursework only. It does not know about your job, your lectures or your weekends.
- Pasting from a PDF table sometimes merges columns. Check the deadline table after pasting.

## Privacy

There is no server, no account and no analytics. The deployed page ships a Content Security Policy with
`connect-src 'none'`, so the browser blocks any network request from the page. What you paste is kept only in this
browser's local storage so it survives a reload; "Clear everything" removes it.

## How it was checked

- 22 unit tests (`npm test`): date formats (`Oct 14`, `October 14th`, `14 Oct`, `10/14`, `10/14/26`, `2026-10-14`,
  `Week 7 Thursday`), year choice for terms that cross New Year, "due" dates on lines with two dates, fractions that are
  not dates, item kinds, grading-line weights, the sample semester, a cap-respecting plan that never schedules work
  outside an item's window, and the `.ics` output (75-octet line folding without splitting characters, escaping, stable
  UIDs).
- 3 browser tests (`npm run test:e2e`, Playwright on the production build): the sample flow end to end including the
  calendar download, keyboard use of the chart, an automated accessibility scan with axe (no violations), no console
  errors, no network requests, pasting a new course and editing it, state kept across a reload, and no horizontal
  scrolling at phone width.
- The calendar file downloaded by the browser test is parsed again with the Python
  [icalendar](https://pypi.org/project/icalendar/) library, an independent implementation
  (`python3 scripts/check_ics.py test-results/crunchmap-sample.ics`): 55 all-day events (39 deadlines and 16 start
  events with 9 am reminders) and no duplicate UIDs.

## Run it locally

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm test           # unit tests
npm run test:e2e   # browser tests on the production build
```

## Code map

- `src/extract.ts` reads dates, kinds and weights from pasted text.
- `src/plan.ts` builds the weeks, finds crunch weeks and computes the plan.
- `src/ics.ts` writes the calendar file.
- `src/App.tsx` and `src/styles.css` are the interface; the chart is plain SVG.

## Credits and disclosure

- Built during LaunchPad Hacks 2026 (started October 22, 2026). No pre-existing project code.
- **AI assistance:** built with Claude (Anthropic), an AI coding assistant, which wrote the code, the tests and this
  README.
- Libraries: React, Vite and TypeScript; Vitest, Testing Library, Playwright and axe-core for tests.
- The sample courses, dates and weights are made up.

## License

MIT
