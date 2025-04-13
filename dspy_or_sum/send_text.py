import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv
import os

# Email info
load_dotenv()
sender_email = "abepierce22@gmail.com"
receiver_email = "9282251145@tmomail.net"
app_password = os.environ.get('app_pass')

# Create the email
msg = MIMEMultipart()
msg['From'] = sender_email
msg['To'] = receiver_email
msg['Subject'] = ""

# Email body
body = "don't forget your water bottle btw"
msg.attach(MIMEText(body, 'plain'))

# Send the email
try:
    with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
        server.login(sender_email, app_password)
        server.sendmail(sender_email, receiver_email, msg.as_string())
        print("Email sent successfully!")
except Exception as e:
    print(f"Error: {e}")
