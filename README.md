# abrampierce.com

Every site on abrampierce.com, in one container. One folder per subdomain:

- `www/` — the portfolio (abrampierce.com and www.)
- `cepier/` — cepier.abrampierce.com
- `stonkle/` — stonkle.abrampierce.com, the stock guessing game
- `halloween/` — halloween.abrampierce.com, the party drink counter
- `gifs/` — gifs.abrampierce.com, GIFs Against Humanity. Its own container, not in
  `run.py`: games live in memory and need websockets. Its GIF files, deck and settings are
  in `instance/gifs/`; see `gifs/README.md` for the game itself.

`run.py` picks the site from the Host header. A subdomain that isn't listed there
goes to www. To add a site: a folder with a `create_app()`, and a line in `SITES`.
Each site keeps its data in `instance/` (SQLite), which lives outside the image.

## Run

```
pip install -r requirements.txt
npm install && npm run build
python run.py
```

Locally every host that isn't `*.abrampierce.com` gets the portfolio; to see another
site, send its Host header (`curl -H "Host: stonkle.abrampierce.com" localhost:5000`).

## Deploy

Push to `main`, then on the host: `cd /opt/portfolio && git pull && docker compose up -d --build`.
nginx config is in `deploy/`: the apex and www, and one wildcard vhost for every subdomain.
