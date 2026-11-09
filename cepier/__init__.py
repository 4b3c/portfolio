"""cepier.abrampierce.com: one static page."""
from pathlib import Path

from flask import Flask, redirect

HERE = Path(__file__).parent


def create_app():
    app = Flask(__name__, static_folder=None)

    @app.route("/")
    @app.route("/index.html")
    def index():
        return (HERE / "index.html").read_text(), 200, {"Content-Type": "text/html; charset=utf-8"}

    @app.errorhandler(404)
    def not_found(_):
        return redirect("/")

    return app
