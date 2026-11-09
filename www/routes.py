import json
import os
import re
import smtplib
import time
from email.message import EmailMessage

from flask import Blueprint, current_app, jsonify, redirect, render_template, request, url_for

from . import visits

main = Blueprint("main", __name__)

@main.route("/cepier")
def cepier():
    # CEPIER has its own subdomain now (cepier/ in this repo)
    return redirect("https://cepier.abrampierce.com", code=301)


@main.route("/privacy")
def privacy():
    return current_app.send_static_file("privacy/index.html")


@main.route("/terms")
def terms():
    return current_app.send_static_file("terms/index.html")


@main.route("/")
def home():
    # the project forest is the home page
    return render_template("projects.html", title="Abram's Portfolio")

@main.route("/grid")
def grid():
    return render_template("grid.html")

@main.route("/fall")
def fall():
    return render_template("fall.html")

@main.route("/liquid")
def liquid():
    return render_template("liquid.html")

@main.route("/cube-sand")
def cube_sand():
    return render_template("cube_sand.html")

@main.route("/learn")
def learn():
    return render_template("learn.html")

@main.route("/life")
def life():
    return render_template("life.html")

@main.route("/trees")
def trees():
    return render_template("trees.html")


@main.route("/projects")
def projects():
    return redirect(url_for("main.home"))


# --- contact form (the cabin's mailbox) ---------------------------------------
EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
NOTES_PER_HOUR = 5        # per visitor, so one person (or bot) can't flood the inbox
recent = {}               # (what, ip) -> times of its recent notes or links


def too_many(what, per_hour, ip=None):
    """True if `ip` (or everyone, with no ip) has done `what` per_hour times
    in the last hour already; otherwise counts this time."""
    now = time.time()
    key = (what, ip)
    times = [t for t in recent.get(key, []) if now - t < 3600]
    if len(times) >= per_hour:
        return True
    recent[key] = times + [now]
    return False


@main.post("/contact")
def contact():
    form = request.form
    # The "website" field is hidden from people, so anything in it came from a
    # bot. It's told the note went through, so it doesn't try again.
    if form.get("website"):
        return jsonify(ok=True)
    name = " ".join(form.get("name", "").split())[:100]
    email = form.get("email", "").strip()[:200]
    message = form.get("message", "").strip()[:5000]
    if not name or not message:
        return jsonify(ok=False, error="Please fill in your name and a message."), 400
    if not EMAIL.fullmatch(email):
        return jsonify(ok=False, error="That email doesn't look quite right."), 400

    if too_many("note", NOTES_PER_HOUR, request.remote_addr):
        return jsonify(ok=False, error="That's a lot of notes! Try again in a little while."), 429

    try:
        deliver(name, email, message)
    except Exception:
        current_app.logger.exception("contact form: couldn't send a note")
        return jsonify(ok=False, error="The mailbox is stuck. Try again later?"), 500
    visits.link(form.get("visitor"), name, email)     # now we know who that visitor is
    return jsonify(ok=True)


def deliver(name, email, message):
    cfg = current_app.config
    if not cfg["MAIL_USERNAME"]:
        # no mail account set up (e.g. running locally): keep the note in a file instead
        os.makedirs(current_app.instance_path, exist_ok=True)
        with open(os.path.join(current_app.instance_path, "messages.jsonl"), "a") as f:
            note = {"at": time.strftime("%Y-%m-%d %H:%M:%S"), "name": name, "email": email, "message": message}
            f.write(json.dumps(note) + "\n")
        current_app.logger.warning("MAIL_USERNAME isn't set; saved the note from %s to instance/messages.jsonl", name)
        return

    # reply-to them, so hitting reply answers them
    send_mail(cfg["CONTACT_TO"] or cfg["MAIL_USERNAME"], f"Portfolio note from {name}",
              f"{name} <{email}> wrote:\n\n{message}", reply_to=email)


# One email through the Gmail account (MAIL_USERNAME, with an app password).
def send_mail(to, subject, body, reply_to=None):
    cfg = current_app.config
    mail = EmailMessage()
    mail["Subject"] = subject
    mail["From"] = cfg["MAIL_USERNAME"]
    mail["To"] = to
    if reply_to:
        mail["Reply-To"] = reply_to
    mail.set_content(body)
    with smtplib.SMTP(cfg["MAIL_SERVER"], cfg["MAIL_PORT"], timeout=10) as smtp:
        smtp.starttls()
        smtp.login(cfg["MAIL_USERNAME"], cfg["MAIL_PASSWORD"])
        smtp.send_message(mail)
