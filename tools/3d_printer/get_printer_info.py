import requests
import printer

def get_printer_info():
    try:
        resp = requests.get(f"{printer.BASE_URL}/printer/info")
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"Error getting printer info: {e}")
        return None

print("Fetching printer info...")
info = get_printer_info()
if info:
    print("Printer Info:")
    print(info['result'])