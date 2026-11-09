"""Every *.abrampierce.com site, in one process. One folder per subdomain.

nginx sends abrampierce.com and every subdomain here; the Host header picks the
site. To add one: a folder with a create_app(), and a line in SITES. A
subdomain that isn't in SITES is sent to the portfolio, www.

GIFs Against Humanity (gifs/) and the toggle (toggle/) are the exceptions: each runs
in its own container (docker-compose.yml says why), and nginx sends their subdomains
straight there.
"""
import hashlib
import hmac
import os

from flask import redirect
from werkzeug.wrappers import Request

import cepier
import halloween
import stonkle
import www

DOMAIN = "abrampierce.com"

# one secret in .env (SECRET_KEY), and each site signs its cookies with its own key made from it
SECRET = os.environ.get("SECRET_KEY", "dev").encode()


def site_key(name):
    return hmac.new(SECRET, name.encode(), hashlib.sha256).hexdigest()


SITES = {
    "www": www.create_app(),
    "cepier": cepier.create_app(),
    "stonkle": stonkle.create_app(),
    "halloween": halloween.create_app(),
}
for name, site in SITES.items():
    site.secret_key = site_key(name)

portfolio = SITES["www"]


def app(environ, start_response):
    host = Request(environ).host.split(":")[0].lower()
    if host in (DOMAIN, f"www.{DOMAIN}") or not host.endswith(f".{DOMAIN}"):
        # the apex, www, and anything that isn't us at all (localhost, the bare IP)
        return portfolio(environ, start_response)
    sub = host[: -len(DOMAIN) - 1]
    if sub in SITES:
        return SITES[sub](environ, start_response)
    # a subdomain with nothing on it: the portfolio, at www
    path = environ.get("PATH_INFO", "/")
    return redirect(f"https://www.{DOMAIN}{path}", code=302)(environ, start_response)


if __name__ == "__main__":
    from werkzeug.serving import run_simple
    run_simple("127.0.0.1", 5000, app, use_reloader=True, use_debugger=True)
