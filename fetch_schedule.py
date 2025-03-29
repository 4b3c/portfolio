import os.path
import datetime
import sys
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from google.auth.transport.requests import Request

# Only read access
SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']

def authenticate_google_calendar():
    creds = None
    # Load saved credentials
    if os.path.exists('.token.json'):
        creds = Credentials.from_authorized_user_file('.token.json', SCOPES)

    # If credentials are invalid or expired
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            # First-time login flow
            flow = InstalledAppFlow.from_client_secrets_file('.google.json', SCOPES)
            creds = flow.run_local_server(port=0)
        # Save credentials
        with open('.token.json', 'w') as token:
            token.write(creds.to_json())

    return build('calendar', 'v3', credentials=creds)

def parse_start_time(event):
    dt_str = event['start'].get('dateTime', event['start'].get('date'))

    try:
        dt = datetime.datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=datetime.timezone.utc)
        return dt
    except Exception:
        return datetime.datetime.max.replace(tzinfo=datetime.timezone.utc)


def get_soonest_events(service, count=10):
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    all_events = []

    calendar_list = service.calendarList().list().execute().get('items', [])

    for calendar in calendar_list:
        cal_id = calendar['id']
        events_result = service.events().list(
            calendarId=cal_id,
            timeMin=now,
            maxResults=10,
            singleEvents=True,
            orderBy='startTime'
        ).execute()
        events = events_result.get('items', [])
        for event in events:
            event['calendarName'] = calendar.get('summary', 'Unnamed Calendar')
            all_events.append(event)

    # Sort all events across calendars by start time
    all_events.sort(key=parse_start_time)
    soonest = all_events[:count]

    for event in soonest:
        start = event['start'].get('dateTime', event['start'].get('date'))
        summary = event.get('summary', '(No title)')
        print(f"  {start} - {summary}")

    return soonest

service = authenticate_google_calendar()
get_soonest_events(service, int(sys.argv[1] if len(sys.argv) > 1 else 10))