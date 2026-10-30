// DOM Elements
const chatMessages = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const attachBtn = document.getElementById("attach-btn");
const fileInput = document.getElementById("file-input");
const micBtn = document.getElementById("mic-btn");
const voiceToggleBtn = document.getElementById("voice-toggle-btn");
const loadingIndicator = document.getElementById("loading-indicator");
const loadingLabel = document.getElementById("loading-label");
const errorBanner = document.getElementById("error-banner");
const errorText = document.getElementById("error-text");
const dismissErrorBtn = document.getElementById("dismiss-error");
const modeBadge = document.getElementById("mode-badge");

// Preview Elements
const previewBar = document.getElementById("attachment-preview-bar");
const previewIcon = document.getElementById("preview-icon");
const previewName = document.getElementById("preview-filename");
const previewSize = document.getElementById("preview-filesize");
const previewImg = document.getElementById("preview-img");
const removeFileBtn = document.getElementById("remove-file-btn");

// State Variables
let attachedFile = null;
let autoVoiceEnabled = true;
let isRecordingVoice = false;
let speechRecognition = null;

// Initialize Speech Recognition if browser supports it
if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  speechRecognition = new SpeechRec();
  speechRecognition.continuous = false;
  speechRecognition.interimResults = false;
  speechRecognition.lang = "en-US";

  speechRecognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    userInput.value = userInput.value ? `${userInput.value} ${transcript}` : transcript;
    autoGrowTextarea();
  };

  speechRecognition.onerror = (event) => {
    console.warn("Speech recognition error:", event.error);
    stopRecording();
  };

  speechRecognition.onend = () => {
    stopRecording();
  };
} else {
  micBtn.style.display = "none";
}

function startRecording() {
  if (!speechRecognition) return;
  try {
    speechRecognition.start();
    isRecordingVoice = true;
    micBtn.classList.add("recording");
    micBtn.title = "Listening... click to stop";
  } catch (err) {
    console.error(err);
  }
}

function stopRecording() {
  if (!speechRecognition) return;
  try {
    speechRecognition.stop();
  } catch (e) {}
  isRecordingVoice = false;
  micBtn.classList.remove("recording");
  micBtn.title = "Speak into microphone";
}

micBtn.addEventListener("click", () => {
  if (isRecordingVoice) {
    stopRecording();
  } else {
    startRecording();
  }
});

// Voice Readout Toggle
voiceToggleBtn.addEventListener("click", () => {
  autoVoiceEnabled = !autoVoiceEnabled;
  if (autoVoiceEnabled) {
    voiceToggleBtn.classList.add("active");
    voiceToggleBtn.querySelector(".icon").textContent = "🔊";
    voiceToggleBtn.querySelector(".label").textContent = "Voice: ON";
  } else {
    voiceToggleBtn.classList.remove("active");
    voiceToggleBtn.querySelector(".icon").textContent = "🔇";
    voiceToggleBtn.querySelector(".label").textContent = "Voice: OFF";
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }
});

// Text-to-Speech function
function speakText(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel(); // Stop any active speech

  // Strip markdown formatting characters for natural voice reading
  const cleanText = text
    .replace(/[#*_`~>-]/g, " ")
    .replace(/\n+/g, ". ")
    .trim();

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.rate = 1.0;
  utterance.pitch = 1.0;
  window.speechSynthesis.speak(utterance);
}

// Auto-grow textarea height
function autoGrowTextarea() {
  userInput.style.height = "auto";
  userInput.style.height = Math.min(userInput.scrollHeight, 120) + "px";
}
userInput.addEventListener("input", autoGrowTextarea);

// Enter to submit (Shift+Enter for newline)
userInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event("submit"));
  }
});

// Base API URL (relative if served by backend, or localhost:5000 if opened directly)
const API_BASE = window.location.origin.includes("5000") ? "" : "http://127.0.0.1:5000";

// Status check on load
async function checkStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/status`);
    if (res.ok) {
      const data = await res.json();
      modeBadge.textContent = data.mode;
    }
  } catch (err) {
    modeBadge.textContent = "Offline";
  }
}

// Error handling helpers
function showError(message) {
  errorText.textContent = message;
  errorBanner.classList.remove("hidden");
}

function hideError() {
  errorBanner.classList.add("hidden");
  errorText.textContent = "";
}
dismissErrorBtn.addEventListener("click", hideError);

// Attachment handling
attachBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  if (fileInput.files && fileInput.files[0]) {
    setAttachedFile(fileInput.files[0]);
  }
});

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function setAttachedFile(file) {
  attachedFile = file;
  previewName.textContent = file.name;
  previewSize.textContent = formatFileSize(file.size);

  const lower = file.name.toLowerCase();
  previewImg.classList.add("hidden");
  previewIcon.classList.remove("hidden");

  if (file.type.startsWith("image/") || lower.match(/\.(png|jpg|jpeg|webp|gif)$/)) {
    previewIcon.textContent = "🖼️";
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      previewImg.classList.remove("hidden");
      previewIcon.classList.add("hidden");
    };
    reader.readAsDataURL(file);
  } else if (lower.endsWith(".pdf")) {
    previewIcon.textContent = "📄";
  } else if (file.type.startsWith("audio/") || lower.match(/\.(mp3|wav|m4a|ogg)$/)) {
    previewIcon.textContent = "🎙️";
  } else {
    previewIcon.textContent = "📝";
  }

  previewBar.classList.remove("hidden");
}

removeFileBtn.addEventListener("click", () => {
  attachedFile = null;
  fileInput.value = "";
  previewBar.classList.add("hidden");
});

// Markdown-like basic renderer for friendly display
function formatMarkdown(text) {
  const div = document.createElement("div");
  // Simple bold and code formatting
  let formatted = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");

  // Convert newlines to paragraphs/breaks
  formatted = formatted.split("\n\n").map(p => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("");
  div.innerHTML = formatted;
  return div;
}

// Append message bubble
function appendMessage(role, text, fileData = null) {
  const msgDiv = document.createElement("div");
  msgDiv.className = `message ${role}`;

  const bubbleDiv = document.createElement("div");
  bubbleDiv.className = "bubble";

  // If user uploaded an attachment, render preview in bubble
  if (fileData) {
    if (fileData.isImage && fileData.dataUrl) {
      const imgContainer = document.createElement("div");
      imgContainer.className = "bubble-attachment";
      const img = document.createElement("img");
      img.src = fileData.dataUrl;
      img.alt = "Attached Image";
      imgContainer.appendChild(img);
      bubbleDiv.appendChild(imgContainer);
    } else {
      const badge = document.createElement("div");
      badge.className = "bubble-file-badge";
      badge.innerHTML = `<span>${fileData.icon || "📎"}</span> <strong>${fileData.name}</strong>`;
      bubbleDiv.appendChild(badge);
    }
  }

  // Render text
  if (text) {
    bubbleDiv.appendChild(formatMarkdown(text));
  }

  // If assistant response, add a "Read Aloud" button
  if (role === "assistant" && text) {
    const controls = document.createElement("div");
    controls.className = "bubble-voice-controls";
    const speakBtn = document.createElement("button");
    speakBtn.className = "speak-btn";
    speakBtn.innerHTML = "<span>🔊</span> Read Aloud";
    speakBtn.addEventListener("click", () => speakText(text));
    controls.appendChild(speakBtn);
    bubbleDiv.appendChild(controls);
  }

  msgDiv.appendChild(bubbleDiv);
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Form Submission
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError();

  const text = userInput.value.trim();
  const file = attachedFile;

  if (!text && !file) return;

  // 1. Prepare user bubble preview
  let userFileMeta = null;
  if (file) {
    const lower = file.name.toLowerCase();
    const isImg = file.type.startsWith("image/") || lower.match(/\.(png|jpg|jpeg|webp|gif)$/);
    userFileMeta = {
      name: file.name,
      isImage: isImg,
      icon: lower.endsWith(".pdf") ? "📄" : (lower.match(/\.(mp3|wav|m4a)$/) ? "🎙️" : "📎"),
      dataUrl: isImg ? previewImg.src : null
    };
  }

  // 2. Add to chat UI
  appendMessage("user", text, userFileMeta);

  // 3. Prepare FormData
  const formData = new FormData();
  if (text) formData.append("message", text);
  if (file) formData.append("file", file);

  // Clear inputs
  userInput.value = "";
  userInput.style.height = "auto";
  attachedFile = null;
  fileInput.value = "";
  previewBar.classList.add("hidden");

  // Loading state
  loadingLabel.textContent = file ? "Study Buddy is analyzing your file..." : "Study Buddy is thinking...";
  loadingIndicator.classList.remove("hidden");
  sendBtn.disabled = true;
  userInput.disabled = true;

  // Timeout controller: abort after 45 seconds so it never hangs indefinitely
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      body: formData,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Unable to get an answer. Please try again.");
    }

    // 4. Show AI response
    appendMessage("assistant", data.reply);

    // 5. Read aloud if voice toggle is ON
    if (autoVoiceEnabled && data.reply) {
      speakText(data.reply);
    }
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError") {
      showError("Request timed out. The server or AI took longer than 45 seconds to respond. Please try again.");
    } else {
      showError(error.message || "Connection failed. Please ensure the server is running.");
    }
  } finally {
    loadingIndicator.classList.add("hidden");
    sendBtn.disabled = false;
    userInput.disabled = false;
    userInput.focus();
  }
});

// Run status check on start
checkStatus();
