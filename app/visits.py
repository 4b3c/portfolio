"""Notes on how people use the site (static/src/projects/visits.js sends them).

Kept in a SQLite file, instance/visits.db:
  visitors  one row per browser (a random id it keeps), and who they are if
            they've sent a note through the contact form
  visits    one row per page load: when, how long it was on screen, where they
            came from, their browser, system, screen, language and timezone
  events    what they did on each visit: cards opened, the list, the cabin,
            the arcade, links followed, the contact form

/visits shows it all, by day in Arizona time, behind a password (VISITS_PASSWORD;
with none set, the page doesn't exist). A visit that was never on screen for a
second (MIN_ACTIVE_MS) isn't kept: those are previews and scanners, not people.
"""
import os
import re
import sqlite3
import time
from datetime import datetime, timedelta, timezone

from flask import Blueprint, Response, abort, current_app, g, render_template, request

bp = Blueprint("visits", __name__)

ID = re.compile(r"[0-9a-f-]{36}")
MAX_EVENTS = 200           # per note, so one browser can't fill the disk
MIN_ACTIVE_MS = 1000       # less on screen than this is not a visit (visits.js waits for it too)
AZ = timezone(timedelta(hours=-7), "MST")   # Arizona keeps MST all year, so no tz database needed
BOTS = re.compile(r"bot|crawl|spider|slurp|headless|preview|fetch|curl|wget|python", re.I)

SCHEMA = """
CREATE TABLE IF NOT EXISTS visitors (
  id TEXT PRIMARY KEY, first_seen REAL, last_seen REAL, visits INTEGER DEFAULT 0,
  name TEXT, email TEXT
);
CREATE TABLE IF NOT EXISTS visits (
  id TEXT PRIMARY KEY, visitor TEXT, started REAL, last_seen REAL, active_ms INTEGER DEFAULT 0,
  referrer TEXT, path TEXT, browser TEXT, system TEXT, device TEXT,
  language TEXT, timezone TEXT, screen TEXT, window TEXT, before INTEGER
);
CREATE TABLE IF NOT EXISTS events (visit TEXT, at_ms INTEGER, kind TEXT, detail TEXT);
CREATE INDEX IF NOT EXISTS visits_by_visitor ON visits (visitor);
CREATE INDEX IF NOT EXISTS events_by_visit ON events (visit);
"""


def db():
    if "visits_db" not in g:
        os.makedirs(current_app.instance_path, exist_ok=True)
        g.visits_db = sqlite3.connect(os.path.join(current_app.instance_path, "visits.db"), timeout=5)
        g.visits_db.row_factory = sqlite3.Row
        g.visits_db.execute("PRAGMA journal_mode=WAL")   # gunicorn's workers can write at once
        g.visits_db.executescript(SCHEMA)
    return g.visits_db


@bp.teardown_app_request
def close_db(_):
    conn = g.pop("visits_db", None)
    if conn is not None:
        conn.close()


def clip(value, n=300):
    return str(value or "")[:n]


# A rough read of the user agent: enough to say "Chrome on a Mac", no more.
def describe(agent):
    browser = next((name for pattern, name in [
        ("Edg/", "Edge"), ("OPR/", "Opera"), ("Firefox/", "Firefox"), ("Chrome/", "Chrome"), ("Safari/", "Safari"),
    ] if pattern in agent), "other")
    system = next((name for pattern, name in [
        ("iPhone", "iOS"), ("iPad", "iPadOS"), ("Android", "Android"), ("Windows", "Windows"),
        ("Mac OS X", "macOS"), ("CrOS", "ChromeOS"), ("Linux", "Linux"),
    ] if pattern in agent), "other")
    device = "phone" if "Mobi" in agent else "tablet" if "iPad" in agent or "Tablet" in agent else "computer"
    return browser, system, device


@bp.post("/visits/note")
def note():
    agent = request.headers.get("User-Agent", "")
    data = request.get_json(force=True, silent=True) or {}
    visitor, visit = clip(data.get("visitor"), 36), clip(data.get("visit"), 36)
    if BOTS.search(agent) or not ID.fullmatch(visitor) or not ID.fullmatch(visit):
        return "", 204
    now = time.time()
    active = max(0, min(int(data.get("active") or 0), 24 * 3600 * 1000))
    conn = db()
    with conn:
        info = data.get("info")
        if isinstance(info, dict) and active >= MIN_ACTIVE_MS:
            conn.execute("INSERT OR IGNORE INTO visitors (id, first_seen, last_seen) VALUES (?, ?, ?)", (visitor, now, now))
            new = conn.execute(
                "INSERT OR IGNORE INTO visits (id, visitor, started, last_seen, referrer, path, browser, system, device,"
                " language, timezone, screen, window, before) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (visit, visitor, now, now, clip(info.get("referrer")), clip(info.get("path")), *describe(agent),
                 clip(info.get("language"), 40), clip(info.get("timezone"), 60), clip(info.get("screen"), 20),
                 clip(info.get("window"), 20), int(info.get("before") or 0)),
            ).rowcount
            if new:
                conn.execute("UPDATE visitors SET visits = visits + 1 WHERE id = ?", (visitor,))
        # only for a visit this visitor started: ids are random, but don't trust them
        owned = conn.execute("SELECT 1 FROM visits WHERE id = ? AND visitor = ?", (visit, visitor)).fetchone()
        if owned:
            conn.execute("UPDATE visitors SET last_seen = ? WHERE id = ?", (now, visitor))
            conn.execute("UPDATE visits SET last_seen = ?, active_ms = MAX(active_ms, ?) WHERE id = ?", (now, active, visit))
            events = data.get("events") if isinstance(data.get("events"), list) else []
            conn.executemany(
                "INSERT INTO events (visit, at_ms, kind, detail) VALUES (?, ?, ?, ?)",
                [(visit, int(e[0]), clip(e[1], 40), clip(e[2], 200)) for e in events[:MAX_EVENTS]
                 if isinstance(e, list) and len(e) == 3 and isinstance(e[0], (int, float))],
            )
    return "", 204


def link(visitor, name, email):
    """A visitor left a note with their email: now we know who they are."""
    if not ID.fullmatch(visitor or ""):
        return
    try:
        with db() as conn:
            now = time.time()
            conn.execute("INSERT OR IGNORE INTO visitors (id, first_seen, last_seen) VALUES (?, ?, ?)", (visitor, now, now))
            conn.execute("UPDATE visitors SET name = COALESCE(?, name), email = ? WHERE id = ?", (name, email, visitor))
    except sqlite3.Error:
        current_app.logger.exception("visits: couldn't link a note to its visitor")


@bp.get("/visits")
def report():
    password = current_app.config["VISITS_PASSWORD"]
    if not password:
        abort(404)
    auth = request.authorization
    if not auth or auth.password != password:
        return Response("Who goes there?", 401, {"WWW-Authenticate": 'Basic realm="visits"'})
    conn = db()
    prune(conn)
    known = {v["id"]: dict(v) for v in conn.execute("SELECT * FROM visitors")}
    # newest day first; under each, the visitors who came that day, with that day's visits
    days = []
    for x in conn.execute("SELECT * FROM visits ORDER BY started DESC LIMIT 1000"):
        x = dict(x)
        x["events"] = [dict(e) for e in conn.execute(
            "SELECT at_ms, kind, detail FROM events WHERE visit = ? ORDER BY at_ms", (x["id"],))]
        day = datetime.fromtimestamp(x["started"], AZ).date()
        if not days or days[-1]["day"] != day:
            days.append({"day": day, "visitors": {}, "visits": 0})
        seen = days[-1]["visitors"]
        if x["visitor"] not in seen:
            seen[x["visitor"]] = {**known.get(x["visitor"], {"id": x["visitor"], "visits": 1}), "visit_list": [], "active_ms": 0}
        seen[x["visitor"]]["visit_list"].append(x)
        seen[x["visitor"]]["active_ms"] += x["active_ms"] or 0
        days[-1]["visits"] += 1
    totals = conn.execute(
        "SELECT COUNT(*) AS visitors, SUM(visits) AS visits, SUM(email IS NOT NULL) AS known FROM visitors").fetchone()
    tried = conn.execute(
        "SELECT kind, detail, COUNT(DISTINCT visit) AS n FROM events WHERE kind IN ('card', 'use')"
        " GROUP BY kind, detail ORDER BY n DESC LIMIT 25").fetchall()
    return render_template("visits.html", days=days, totals=totals, tried=tried)


def prune(conn):
    """Drop visits from before MIN_ACTIVE_MS was enforced, and the visitors only they had."""
    with conn:
        short = "SELECT id FROM visits WHERE active_ms < %d" % MIN_ACTIVE_MS
        if not conn.execute(short + " LIMIT 1").fetchone():
            return
        conn.execute("DELETE FROM events WHERE visit IN (%s)" % short)
        conn.execute("DELETE FROM visits WHERE active_ms < ?", (MIN_ACTIVE_MS,))
        conn.execute("DELETE FROM visitors WHERE email IS NULL AND id NOT IN (SELECT visitor FROM visits)")
        conn.execute(
            "UPDATE visitors SET visits = (SELECT COUNT(*) FROM visits WHERE visitor = visitors.id),"
            " first_seen = COALESCE((SELECT MIN(started) FROM visits WHERE visitor = visitors.id), first_seen),"
            " last_seen = COALESCE((SELECT MAX(last_seen) FROM visits WHERE visitor = visitors.id), last_seen)")


@bp.app_template_filter("when")
def when(t):
    return datetime.fromtimestamp(t, AZ).strftime("%Y-%m-%d %-I:%M %p") if t else ""


@bp.app_template_filter("clock")
def clock(t):
    return datetime.fromtimestamp(t, AZ).strftime("%-I:%M %p") if t else ""


@bp.app_template_filter("duration")
def duration(ms):
    s = int((ms or 0) / 1000)
    return f"{s // 3600}h {s % 3600 // 60}m" if s >= 3600 else f"{s // 60}m {s % 60}s"
