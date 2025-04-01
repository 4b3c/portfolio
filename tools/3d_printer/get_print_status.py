import requests
import printer

def get_printer_status():
    try:
        resp = requests.get(f"{printer.BASE_URL}/printer/objects/query?heater_bed&extruder&print_stats")
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        print(f"Error getting printer status: {e}")
        return None

print("\nFetching printer status...")
status = get_printer_status()
if status:
    print("Printer Status:")
    print(status['result'])
