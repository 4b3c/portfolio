import os


class Config:
    SECRET_KEY = "dev"

    # The contact form (the cabin's mailbox) emails each note through this SMTP
    # account. Gmail works with an app password: https://myaccount.google.com/apppasswords
    # With MAIL_USERNAME unset, notes are saved to instance/messages.jsonl instead.
    MAIL_SERVER = os.environ.get("MAIL_SERVER", "smtp.gmail.com")
    MAIL_PORT = int(os.environ.get("MAIL_PORT", 587))
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD")
    CONTACT_TO = os.environ.get("CONTACT_TO")  # where notes go; defaults to MAIL_USERNAME
