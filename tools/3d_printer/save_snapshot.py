import requests
import printer

def download_snapshot():
    try:
        resp = requests.get(printer.SNAPSHOT_URL)
        resp.raise_for_status()
        with open(printer.SNAPSHOT_SAVE_PATH, "wb") as f:
            f.write(resp.content)
        print(f"Snapshot saved to {printer.SNAPSHOT_SAVE_PATH}")
    except Exception as e:
        print(f"Error downloading snapshot: {e}")


print("\nDownloading webcam snapshot...")
download_snapshot()

