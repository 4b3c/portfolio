"""Players and the games they've played, in a SQLite file: instance/stonkle.db.

A player is a random id in a cookie; their level and points come from their games.
"""
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path

from flask import g, request

DB = Path(__file__).parent.parent / "instance" / "stonkle.db"
COOKIE = "player_id"

SCHEMA = """
CREATE TABLE IF NOT EXISTS players (
    id         TEXT PRIMARY KEY,
    level      INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    last_seen  TEXT
);
CREATE TABLE IF NOT EXISTS games (
    id            INTEGER PRIMARY KEY,
    player_id     TEXT NOT NULL REFERENCES players(id),
    game_code     TEXT,
    selection     TEXT,
    difficulty    REAL,
    points_gained REAL,
    result        TEXT,
    created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS games_player ON games(player_id);
"""


def now():
    return datetime.now(timezone.utc).isoformat()


def db():
    if "stonkle_db" not in g:
        DB.parent.mkdir(exist_ok=True)
        g.stonkle_db = sqlite3.connect(DB, timeout=5)
        g.stonkle_db.row_factory = sqlite3.Row
        g.stonkle_db.executescript(SCHEMA)
    return g.stonkle_db


def close(_exc=None):
    conn = g.pop("stonkle_db", None)
    if conn is not None:
        conn.close()


def db_get_or_create_player(response=None):
    player_id = request.cookies.get(COOKIE)
    try:
        uuid.UUID(player_id or "")
    except ValueError:
        player_id = str(uuid.uuid4())
        if response:
            response.set_cookie(COOKIE, player_id, max_age=60*60*24*30)  # 30 days

    with db() as conn:
        conn.execute("INSERT OR IGNORE INTO players (id, created_at) VALUES (?, ?)", (player_id, now()))
    return player_id


def db_get_player_level(player_id):
    row = db().execute("SELECT level FROM players WHERE id = ?", (player_id,)).fetchone()
    return row["level"] if row else 0


def db_save_played_game(player_id, game_code, selection, difficulty, points_gained, result):
    with db() as conn:
        conn.execute(
            "INSERT INTO games (player_id, game_code, selection, difficulty, points_gained, result, created_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (player_id, game_code, selection, difficulty, points_gained, result, now()))
        conn.execute("UPDATE players SET last_seen = ? WHERE id = ?", (now(), player_id))


def db_update_player_level(player_id, level):
    with db() as conn:
        conn.execute("UPDATE players SET level = ? WHERE id = ?", (level, player_id))


def db_get_player_stats(player_id):
    row = db().execute("""
        SELECT p.level,
               COALESCE(SUM(g.points_gained), 0)  AS total_points,
               COUNT(g.id)                        AS total_games,
               COALESCE(SUM(g.result = 'win'), 0) AS total_wins
        FROM players p LEFT JOIN games g ON g.player_id = p.id
        WHERE p.id = ? GROUP BY p.id""", (player_id,)).fetchone()
    if not row:
        return {"level": 0, "total_points": 0, "total_games": 0, "total_wins": 0}
    return dict(row)
