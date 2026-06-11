"""Tests SB Access — trajets récurrents automatiques (logique scheduler)."""
from datetime import datetime, timezone

from routes.sb_access import _recurring_summary, _recurring_due, _next_occurrence, _occurrence_label


def test_summary_weekly_and_daily():
    assert _recurring_summary({"frequency": "weekly", "days_of_week": [0, 3], "time_hhmm": "09:05"}) == "Lundi, Jeudi à 09:05"
    assert _recurring_summary({"frequency": "daily", "time_hhmm": "08:00"}) == "Tous les jours à 08:00"
    assert _recurring_summary({"frequency": "weekly", "days_of_week": [], "time_hhmm": "10:00"}) == "Chaque semaine à 10:00"


def test_due_weekly_only_on_matching_day_after_time():
    # 2026-06-11 is a Thursday (weekday 3)
    thursday_10h = datetime(2026, 6, 11, 10, 0, tzinfo=timezone.utc)
    rec = {"active": True, "frequency": "weekly", "days_of_week": [3], "time_hhmm": "09:00", "last_run_date": None}
    assert _recurring_due(rec, thursday_10h) is True
    # Before the scheduled time -> not due
    thursday_8h = datetime(2026, 6, 11, 8, 0, tzinfo=timezone.utc)
    assert _recurring_due(rec, thursday_8h) is False
    # Wrong day (Friday) -> not due
    friday_10h = datetime(2026, 6, 12, 10, 0, tzinfo=timezone.utc)
    assert _recurring_due(rec, friday_10h) is False


def test_due_respects_last_run_and_active_flag():
    thursday_10h = datetime(2026, 6, 11, 10, 0, tzinfo=timezone.utc)
    rec = {"active": True, "frequency": "daily", "time_hhmm": "09:00", "last_run_date": "2026-06-11"}
    assert _recurring_due(rec, thursday_10h) is False  # already run today
    rec2 = {"active": False, "frequency": "daily", "time_hhmm": "09:00", "last_run_date": None}
    assert _recurring_due(rec2, thursday_10h) is False  # paused
    rec3 = {"active": True, "frequency": "daily", "time_hhmm": "09:00", "last_run_date": "2026-06-10"}
    assert _recurring_due(rec3, thursday_10h) is True  # ran yesterday, due again today


def test_next_occurrence_skips_and_reminder_window():
    # Thursday 2026-06-11 08:00, weekly Tue(1)+Thu(3) at 09:00
    thu_8h = datetime(2026, 6, 11, 8, 0, tzinfo=timezone.utc)
    rec = {"active": True, "frequency": "weekly", "days_of_week": [1, 3], "time_hhmm": "09:00", "skip_dates": []}
    nxt = _next_occurrence(rec, thu_8h)
    assert nxt.strftime("%Y-%m-%d %H:%M") == "2026-06-11 09:00"  # today, slot not passed
    # After today's slot passed -> next is Tuesday 2026-06-16
    thu_10h = datetime(2026, 6, 11, 10, 0, tzinfo=timezone.utc)
    assert _next_occurrence(rec, thu_10h).strftime("%Y-%m-%d") == "2026-06-16"
    # Skip that Tuesday -> jumps to Thursday 2026-06-18
    rec["skip_dates"] = ["2026-06-16"]
    assert _next_occurrence(rec, thu_10h).strftime("%Y-%m-%d") == "2026-06-18"


def test_reminder_is_day_before():
    # daily at 09:00; "now" is Wed 18:00 -> next occurrence is Thu 09:00 (tomorrow)
    wed_18h = datetime(2026, 6, 10, 18, 0, tzinfo=timezone.utc)
    rec = {"active": True, "frequency": "daily", "time_hhmm": "09:00", "skip_dates": []}
    nxt = _next_occurrence(rec, wed_18h)
    assert (nxt.date() - wed_18h.date()).days == 1  # day-before reminder should fire
    assert _occurrence_label(nxt) == "jeudi 11 à 09:00"
