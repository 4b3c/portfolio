"""halloween.abrampierce.com: the 2025 Halloween party's drink counter.

Join with a name, tap + and -, and the leaderboard ranks everyone. Moved from
its own repo (4b3c/halloween) on 2026-11-09; the counts are in
instance/halloween.db, so every worker sees the same ones.
"""
import json
import sqlite3
from pathlib import Path

from flask import Flask, g, jsonify, redirect, render_template, request, session, url_for

INSTANCE = Path(__file__).parent.parent / "instance"
DB = INSTANCE / "halloween.db"
# the counts from before the move (the old app's data.json): read once, into an empty database
SEED = INSTANCE / "halloween.json"


def db():
    if "halloween_db" not in g:
        INSTANCE.mkdir(exist_ok=True)
        conn = g.halloween_db = sqlite3.connect(DB, timeout=5)
        with conn:
            conn.execute("CREATE TABLE IF NOT EXISTS participants (name TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0)")
            if SEED.exists() and not conn.execute("SELECT 1 FROM participants LIMIT 1").fetchone():
                seed = json.loads(SEED.read_text() or "{}")
                conn.executemany("INSERT OR IGNORE INTO participants VALUES (?, ?)",
                                 [(name, int(n)) for name, n in seed.items()])
    return g.halloween_db


def count(name):
    row = db().execute("SELECT count FROM participants WHERE name = ?", (name,)).fetchone()
    return row[0] if row else 0


def add(name, n):
    """Change name's count by n (never below 0), and return the new count."""
    with db() as conn:
        conn.execute("INSERT OR IGNORE INTO participants (name) VALUES (?)", (name,))
        conn.execute("UPDATE participants SET count = MAX(0, count + ?) WHERE name = ?", (n, name))
    return count(name)


def create_app():
    app = Flask(__name__)

    @app.teardown_appcontext
    def close(_exc=None):
        conn = g.pop("halloween_db", None)
        if conn is not None:
            conn.close()

    @app.route('/')
    def index():
        """Landing page where users enter their name"""
        return render_template('index.html')

    @app.route('/join', methods=['POST'])
    def join():
        name = request.form.get('name', '').strip()[:50]
        if not name:
            return redirect(url_for('index'))
        session['name'] = name
        add(name, 0)
        return redirect(url_for('counter'))

    @app.route('/counter')
    def counter():
        if 'name' not in session:
            return redirect(url_for('index'))
        return render_template('counter.html', name=session['name'], count=count(session['name']))

    @app.route('/increment', methods=['POST'])
    def increment():
        if 'name' not in session:
            return jsonify({'error': 'Not logged in'}), 401
        return jsonify({'success': True, 'count': add(session['name'], 1)})

    @app.route('/decrement', methods=['POST'])
    def decrement():
        if 'name' not in session:
            return jsonify({'error': 'Not logged in'}), 401
        return jsonify({'success': True, 'count': add(session['name'], -1)})

    @app.route('/leaderboard')
    def leaderboard():
        return render_template('leaderboard.html')

    @app.route('/api/participants')
    def api_participants():
        """All participants, most drinks first"""
        rows = db().execute("SELECT name, count FROM participants ORDER BY count DESC").fetchall()
        return jsonify([{'name': name, 'count': n} for name, n in rows])

    return app
