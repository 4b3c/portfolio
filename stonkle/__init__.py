"""stonkle.abrampierce.com: guess whether a hidden stock goes up or down.

Moved from its own repo (4b3c/stonkle, on Render with Supabase) on 2026-11-09;
players and games are now in instance/stonkle.db (database.py).
"""
import json

from flask import Flask, jsonify, make_response, render_template, request, session

from . import database, game


def create_app():
    app = Flask(__name__)
    app.teardown_appcontext(database.close)

    @app.route('/')
    def landing():
        return render_template('landing.html')

    # play page (SPA style)
    @app.route('/play/')
    def play():
        return render_template("play.html")

    @app.route('/api/stock-data/first-half')
    def get_first_half():
        # Generate a new random game code and store in session
        game_code = game.random_game_code()
        ticker, start_date = game.decode_game_code(game_code)
        session['game_code'] = game_code
        session['ticker'] = ticker
        session['start_date'] = start_date

        # Ensure player_id is set, use player_level to set difficulty
        response = make_response()
        player_id = database.db_get_or_create_player(response)
        player_level = database.db_get_player_level(player_id)
        session['player_id'] = player_id
        session['difficulty'] = game.LEVELS[player_level][1]

        result = game.get_half_window_df('first')
        if isinstance(result, tuple):
            # Error case - result is (response, status_code)
            return result

        data = result.get_json()
        data['metadata'] = {
            'game_code': game_code,
            'difficulty': session['difficulty'],
            'player_level': player_level
        }
        response.set_data(json.dumps(data))
        response.mimetype = 'application/json'
        return response

    @app.route('/api/stock-data/second-half')
    def get_second_half():
        result = game.get_half_window_df('second')
        if isinstance(result, tuple):
            return result

        data = result.get_json()
        data['metadata'] = {
            'ticker_name': game.COMPANY_NAMES[session['ticker']]
        }
        return jsonify(data)

    @app.route('/api/save-game', methods=['POST'])
    def save_game():
        data = request.get_json(silent=True) or {}
        player_id = session.get('player_id')
        if not player_id:
            return jsonify({'error': 'Player ID not found'}), 400
        result = data.get('result')
        database.db_save_played_game(player_id, session.get('game_code'), data.get('selection'),
                                     data.get('difficulty'), data.get('points_gained'), result)

        stats = database.db_get_player_stats(player_id)
        next_level = stats['level'] + 1
        if result == 'win' and next_level in game.LEVELS and stats['total_points'] >= game.LEVELS[next_level][0]:
            database.db_update_player_level(player_id, next_level)
            return jsonify({'status': 'success', 'level_up': True, 'level': next_level})

        return jsonify({'status': 'success', 'level_up': False})

    @app.route('/api/get-player-score')
    def get_player_score():
        # a first visit asks before its first round has made it a player: no points yet
        player_id = session.get('player_id')
        if not player_id:
            return jsonify({'score': 0})
        return jsonify({'score': database.db_get_player_stats(player_id)['total_points']})

    return app
