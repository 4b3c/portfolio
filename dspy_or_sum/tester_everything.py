
text = "/send_file tools/3d_printer/snapshots/snapshot.jpg hello welcome"
filename = text.split("/send_file ")[1].split(" ")[0].strip()
print(filename)