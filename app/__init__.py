import os

from flask import Flask

def create_app():
    app = Flask(__name__)
    app.config.from_object("app.config.Config")

    from .routes import main
    app.register_blueprint(main)

    # ?v=<last modified time> on script URLs, so browsers fetch a script again
    # as soon as it changes instead of running a cached copy
    @app.context_processor
    def asset_versions():
        def asset_version(filename):
            try:
                return int(os.path.getmtime(os.path.join(app.static_folder, filename)))
            except OSError:
                return 0
        return {"asset_version": asset_version}

    return app
