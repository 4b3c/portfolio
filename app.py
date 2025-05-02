from flask import Flask, request, render_template_string, jsonify
import speech_recognition as sr
from pydub import AudioSegment
import io

app = Flask(__name__)

HTML = """
<!DOCTYPE html>
<html>
<head>
  <title>Zipper Voice</title>
</head>
<body>
  <h1>🎙️ Talk to Zipper</h1>
  <button onclick="startRecording()">Start Recording</button>
  <button onclick="stopRecording()">Stop</button>
  <p id="status"></p>
  <p><strong>Transcript:</strong> <span id="result"></span></p>

<script>
let mediaRecorder;
let audioChunks = [];

function startRecording() {
  document.getElementById("status").textContent = "Recording...";
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.start();

      mediaRecorder.ondataavailable = e => {
        audioChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('audio', blob);

        const response = await fetch('/transcribe', { method: 'POST', body: formData });
        const data = await response.json();
        document.getElementById("result").textContent = data.transcript || "Could not understand";
        document.getElementById("status").textContent = "Done.";
        audioChunks = [];
      };
    });
}

function stopRecording() {
  if (mediaRecorder) mediaRecorder.stop();
}
</script>
</body>
</html>
"""

@app.route("/")
def index():
    return render_template_string(HTML)

@app.route("/transcribe", methods=["POST"])
def transcribe():
    if "audio" not in request.files:
        return jsonify({"error": "No audio file uploaded"}), 400

    audio_file = request.files["audio"]
    audio_bytes = audio_file.read()

    # Convert webm to wav using pydub
    audio = AudioSegment.from_file(io.BytesIO(audio_bytes), format="webm")
    wav_io = io.BytesIO()
    audio.export(wav_io, format="wav")
    wav_io.seek(0)

    recognizer = sr.Recognizer()
    with sr.AudioFile(wav_io) as source:
        audio_data = recognizer.record(source)

    try:
        transcript = recognizer.recognize_google(audio_data)
        print("You said:", transcript)
        return jsonify({"transcript": transcript})
    except sr.UnknownValueError:
        return jsonify({"transcript": ""})
    except sr.RequestError as e:
        return jsonify({"error": str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True)
