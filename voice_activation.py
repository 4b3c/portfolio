import speech_recognition as sr
import time

recognizer = sr.Recognizer()
mic = sr.Microphone()

WAKE_WORD = "zipper"

print("Zipper daemon running... Say 'zipper' to activate.")

while True:
    with mic as source:
        recognizer.adjust_for_ambient_noise(source, duration=0.5)
        print("🎧 Listening for wake word...")
        audio = recognizer.listen(source, phrase_time_limit=3)

    try:
        transcript = recognizer.recognize_google(audio).lower()
        print(f"👂 Heard: {transcript}")

        if WAKE_WORD in transcript:
            print("✅ Wake word detected! Listening for command...")

            # Prompt for command
            with mic as source:
                recognizer.adjust_for_ambient_noise(source, duration=0.5)
                audio = recognizer.listen(source, phrase_time_limit=6)

            command = recognizer.recognize_google(audio)
            print(f"🧠 Zipper heard: {command}")
            # Here you can add logic to call Zipper tools or API later

            print("🎤 Listening again...\n")

    except sr.UnknownValueError:
        continue  # Didn't understand speech
    except sr.RequestError as e:
        print(f"🔌 Speech Recognition error: {e}")
        time.sleep(5)
