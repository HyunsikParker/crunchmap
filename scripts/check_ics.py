"""Parses an exported Crunchmap calendar with the icalendar library, an independent iCalendar implementation, and checks
the events. usage: python3 scripts/check_ics.py <file.ics>   (pip install icalendar)"""
import sys
from datetime import date, timedelta

from icalendar import Calendar

cal = Calendar.from_ical(open(sys.argv[1], "rb").read())
assert str(cal["VERSION"]) == "2.0"
events = list(cal.walk("VEVENT"))
uids = [str(e["UID"]) for e in events]
assert len(uids) == len(set(uids)), "duplicate UIDs"
due = start = alarms = 0
for e in events:
    begin, end = e.decoded("DTSTART"), e.decoded("DTEND")
    assert type(begin) is date and end - begin == timedelta(days=1), "events must be all-day"
    summary = str(e["SUMMARY"])
    if summary.startswith("Due: "):
        due += 1
    elif summary.startswith("Start: "):
        start += 1
        for alarm in e.walk("VALARM"):
            assert alarm.decoded("TRIGGER") == timedelta(hours=9)
            alarms += 1
    else:
        raise AssertionError(summary)
assert start == alarms
print(f"ok: {len(events)} events ({due} deadlines, {start} start reminders with 9 am alarms), all-day, unique UIDs")
