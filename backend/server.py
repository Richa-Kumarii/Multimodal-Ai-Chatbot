import os
import io
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from PIL import Image

# 1. Load environment variables (.env) from current or parent directory
load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

# Determine frontend static path (points to ../frontend if present, else fallback)
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))
if not os.path.exists(FRONTEND_DIR):
    FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "static"))

app = Flask(__name__, static_folder=FRONTEND_DIR)
CORS(app)  # Enable Cross-Origin Resource Sharing for separated frontend testing

# Get API key (supporting GEMINI_API_KEY or GEMINI_API_Key)
GEMINI_API_KEY = (os.getenv("GEMINI_API_KEY") or os.getenv("GEMINI_API_Key") or "").strip()

# Initialize Google GenAI client
ai_client = None
if GEMINI_API_KEY:
    try:
        from google import genai
        from google.genai import types
        ai_client = genai.Client(api_key=GEMINI_API_KEY)
        print("[OK] Google Gemini Client initialized successfully!")
    except Exception as e:
        print(f"Warning: Failed to initialize Gemini client: {e}")
else:
    print("[INFO] No GEMINI_API_KEY found. Running in beginner-friendly Mock Mode.")


def extract_text_from_pdf(file_bytes):
    """Safely extracts text from a PDF file using pypdf."""
    try:
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(file_bytes))
        full_text = []
        for i, page in enumerate(reader.pages):
            text = page.extract_text()
            if text:
                full_text.append(f"--- Page {i + 1} ---\n{text}")
        return "\n\n".join(full_text)
    except Exception as e:
        print(f"PDF extract error: {e}")
        return ""


@app.route("/")
def serve_index():
    """Serves the main web interface."""
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:path>")
def serve_static_files(path):
    """Serves static assets like style.css and app.js directly from the static folder."""
    return send_from_directory(app.static_folder, path)


@app.route("/api/status", methods=["GET"])
def get_status():
    """Returns whether live Gemini or Mock Mode is currently active."""
    return jsonify({
        "status": "online",
        "mode": "Gemini 3.5 Flash (Live)" if ai_client else "Mock Mode (No Key)",
        "has_key": bool(ai_client)
    })


@app.route("/api/chat", methods=["POST"])
def chat():
    """
    Multimodal Chatbot Endpoint:
    Handles text, images, PDF/document uploads, and audio files.
    """
    try:
        user_message = request.form.get("message", "").strip()
        uploaded_file = request.files.get("file")

        # Basic input validation
        if not user_message and not uploaded_file:
            return jsonify({"error": "Please provide a question or attach a file."}), 400

        filename = uploaded_file.filename if uploaded_file else ""
        mimetype = uploaded_file.mimetype if uploaded_file else ""
        file_bytes = uploaded_file.read() if uploaded_file else None

        # Determine file category
        is_image = False
        is_pdf = False
        is_audio = False
        is_text_doc = False

        if uploaded_file and file_bytes:
            lower_name = filename.lower()
            if lower_name.endswith(('.png', '.jpg', '.jpeg', '.webp', '.gif')) or mimetype.startswith('image/'):
                is_image = True
            elif lower_name.endswith('.pdf') or 'pdf' in mimetype:
                is_pdf = True
            elif lower_name.endswith(('.mp3', '.wav', '.m4a', '.ogg', '.webm')) or mimetype.startswith('audio/'):
                is_audio = True
            elif lower_name.endswith(('.txt', '.md', '.py', '.js', '.csv', '.json', '.html')):
                is_text_doc = True

        # System prompt for Study Buddy persona
        study_buddy_instructions = (
            "You are 'Study Buddy', an encouraging, highly knowledgeable, and clear college lab assistant. "
            "Help the student understand concepts thoroughly with step-by-step explanations, key takeaways, "
            "and simple analogies. Keep formatting clean with bullet points and bold headers."
        )

        # ----------------------------------------------------------------------
        # MODE 1: LIVE GEMINI API
        # ----------------------------------------------------------------------
        if ai_client:
            try:
                from google.genai import types
                contents = []

                # Handle Image Attachment
                if is_image:
                    image_obj = Image.open(io.BytesIO(file_bytes))
                    # Convert to RGB if RGBA/P to ensure standard JPEG/PNG compatibility
                    if image_obj.mode in ("RGBA", "P"):
                        image_obj = image_obj.convert("RGB")
                    # Resize if extremely large to prevent payload timeouts while preserving clarity
                    image_obj.thumbnail((1600, 1600))
                    contents.append(image_obj)
                    prompt_text = user_message or "Analyze this image in detail and explain the key concepts for a student."
                    contents.append(prompt_text)

                # Handle PDF Document Attachment
                elif is_pdf:
                    pdf_text = extract_text_from_pdf(file_bytes)
                    if pdf_text.strip():
                        # Truncate if exceptionally huge to stay within fast response limits
                        sample_pdf = pdf_text[:40000]
                        prompt_text = (
                            f"Below is the extracted text from the uploaded document '{filename}':\n\n"
                            f"{sample_pdf}\n\n"
                            f"Student's Question / Request: {user_message or 'Summarize this document and highlight key study takeaways.'}"
                        )
                        contents.append(prompt_text)
                    else:
                        # Fallback to binary upload if scanned PDF
                        contents.append(types.Part.from_bytes(data=file_bytes, mime_type="application/pdf"))
                        contents.append(user_message or "Please summarize this document.")

                # Handle Text Documents (.txt, .py, .md, etc.)
                elif is_text_doc:
                    doc_content = file_bytes.decode('utf-8', errors='ignore')
                    prompt_text = (
                        f"Attached document '{filename}':\n\n{doc_content[:30000]}\n\n"
                        f"Student Question: {user_message or 'Please analyze this document.'}"
                    )
                    contents.append(prompt_text)

                # Handle Audio Files (.mp3, .wav, etc.)
                elif is_audio:
                    audio_mime = mimetype or "audio/mp3"
                    if filename.lower().endswith(".wav"):
                        audio_mime = "audio/wav"
                    elif filename.lower().endswith(".m4a"):
                        audio_mime = "audio/m4a"

                    contents.append(types.Part.from_bytes(data=file_bytes, mime_type=audio_mime))
                    prompt_text = (
                        user_message or 
                        "Transcribe this audio recording and provide a clear, concise bulleted summary of the main points discussed."
                    )
                    contents.append(prompt_text)

                # Pure Text Query
                else:
                    contents.append(user_message)

                # Candidate models prioritizing ultra-fast stable response time
                # gemini-3.5-flash delivers 2-7 second responses for images
                candidate_models = ["gemini-3.5-flash", "gemini-3.8-flash", "gemini-flash-latest"]
                last_err = None
                response = None

                for model_name in candidate_models:
                    try:
                        response = ai_client.models.generate_content(
                            model=model_name,
                            contents=contents,
                            config=types.GenerateContentConfig(
                                system_instruction=study_buddy_instructions
                            )
                        )
                        if response and response.text:
                            break
                    except Exception as err:
                        last_err = err
                        print(f"Model {model_name} warning: {err}, trying fallback...")
                        continue

                if response and response.text:
                    return jsonify({"reply": response.text})
                else:
                    raise last_err

            except Exception as e:
                print(f"Gemini API Error: {e}")
                return jsonify({"error": f"AI service error: {str(e)}"}), 502

        # ----------------------------------------------------------------------
        # MODE 2: MOCK BACKEND (Fallback if no key is configured)
        # ----------------------------------------------------------------------
        if is_image:
            reply = (
                f"📷 **Study Buddy (Mock Mode - Image Analysis):**\n\n"
                f"I received your image: `{filename}`.\n\n"
                f"• **Visual Breakdown:** The image appears to show study notes, a chart, or lab diagram.\n"
                f"• **Your Question:** \"{user_message or 'General visual explanation'}\"\n"
                f"• **Study Note:** To activate real multimodal vision analysis, add your GEMINI_API_KEY to your `.env` file!"
            )
        elif is_pdf or is_text_doc:
            reply = (
                f"📄 **Study Buddy (Mock Mode - Document Analysis):**\n\n"
                f"I processed your document: `{filename}`.\n\n"
                f"• **Document Summary:** Key study concepts, theorems, and definitions found.\n"
                f"• **Student Query:** \"{user_message or 'Summary requested'}\"\n"
                f"• **Recommendation:** Review the main definitions and practice sample exam problems."
            )
        elif is_audio:
            reply = (
                f"🎙️ **Study Buddy (Mock Mode - Audio Transcription):**\n\n"
                f"I received your audio clip: `{filename}`.\n\n"
                f"• **Transcription Mock:** \"Today's lecture covers core algorithms, computational complexity, and system design...\"\n"
                f"• **Key Discussion Points:**\n"
                f"  1. Definition of core principles.\n"
                f"  2. Practical applications and lab exercises.\n"
                f"  3. Q&A session review."
            )
        else:
            reply = (
                f"📚 **Study Buddy (Mock Mode):**\n\n"
                f"Great question! You asked: \"{user_message}\"\n\n"
                f"Here are key study takeaways:\n"
                f"• **Core Principle:** Foundation concept explanation.\n"
                f"• **Application:** How this is typically tested in exams and lab projects.\n"
                f"• **Review Tip:** Try solving an example on paper without looking at the solution!"
            )

        return jsonify({"reply": reply})

    except Exception as e:
        print(f"Server error: {e}")
        return jsonify({"error": f"Internal server error: {str(e)}"}), 500


if __name__ == "__main__":
    print("Starting Study Buddy Chat on http://127.0.0.1:5000 ...")
    app.run(host="127.0.0.1", port=5000, debug=True)
