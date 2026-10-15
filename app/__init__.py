import os

from flask import Flask
from werkzeug.middleware.proxy_fix import ProxyFix

def create_app():
    app = Flask(__name__)
    app.config.from_object("app.config.Config")
    # Live, nginx sits in front and passes on the visitor's address in
    # X-Forwarded-For; trust that one hop, so request.remote_addr is the visitor
    # (the contact form's rate limit is per visitor). Only nginx can reach the
    # app: docker-compose binds its port to 127.0.0.1.
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)

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
