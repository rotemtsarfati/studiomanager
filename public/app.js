const message = document.querySelector('#message');
const send = document.querySelector('#send');
const clearMessage = document.querySelector('#clearMessage');
const clearConversation = document.querySelector('#clearConversation');
const screenshots = document.querySelector('#screenshots');
const imageCount = document.querySelector('#imageCount');
const preview = document.querySelector('#preview');
const answer = document.querySelector('#answer');
const card = document.querySelector('#answerCard');
const contextCard = document.querySelector('#contextCard');
const historyEl = document.querySelector('#history');
const turnCount = document.querySelector('#turnCount');
const status = document.querySelector('#status');
const copy = document.querySelector('#copy');
const feedback = document.querySelector('#feedback');
const refine = document.querySelector('#refine');
const rememberGuidance = document.querySelector('#rememberGuidance');
const guidanceStatus = document.querySelector('#guidanceStatus');
const voiceFeedback = document.querySelector('#voiceFeedback');
const voiceLanguage = document.querySelector('#voiceLanguage');
const voiceStatus = document.querySelector('#voiceStatus');

let imageData = [];
let history = [];
let guidance = [];
let recognition = null;
let isListening = false;
let speechBaseText = '';

try { history = JSON.parse(localStorage.getItem('beStudiosConversation') || '[]'); } catch { history = []; }
try { guidance = JSON.parse(localStorage.getItem('beStudiosGuidance') || '[]'); } catch { guidance = []; }
if (!Array.isArray(guidance)) guidance = [];

function saveHistory() {
  localStorage.setItem('beStudiosConversation', JSON.stringify(history));
}

function saveGuidance() {
  guidance = guidance.map(x => String(x || '').trim()).filter(Boolean).slice(-20);
  localStorage.setItem('beStudiosGuidance', JSON.stringify(guidance));
  renderGuidanceStatus();
}

function renderGuidanceStatus() {
  guidanceStatus.textContent = guidance.length
    ? `${guidance.length} staff preference${guidance.length === 1 ? '' : 's'} remembered on this device.`
    : 'Guidance can be remembered on this device for future replies.';
}

function renderHistory() {
  if (!history.length) {
    contextCard.classList.add('hidden');
    historyEl.innerHTML = '';
    turnCount.textContent = '';
    return;
  }
  contextCard.classList.remove('hidden');
  turnCount.textContent = `${history.length} turn${history.length === 1 ? '' : 's'} remembered`;
  historyEl.innerHTML = history.map((item, i) => `<div class="historyTurn"><strong>${i + 1}. Customer</strong><div>${escapeHtml(item.customer || '[from screenshot]')}</div><strong>Be Studios</strong><div>${escapeHtml(item.reply || '')}</div></div>`).join('');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

function clearImages() {
  imageData = [];
  screenshots.value = '';
  preview.innerHTML = '';
  imageCount.textContent = 'No screenshots added';
}

screenshots.addEventListener('change', async () => {
  const files = [...screenshots.files].slice(0, 6);
  imageData = [];
  preview.innerHTML = '';
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const data = await readFile(file);
    imageData.push(data);
    const img = document.createElement('img');
    img.src = data;
    img.alt = 'Conversation screenshot';
    preview.appendChild(img);
  }
  imageCount.textContent = imageData.length ? `${imageData.length} screenshot${imageData.length === 1 ? '' : 's'} added` : 'No screenshots added';
});

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function postJsonWithRetry(url, payload, options = {}) {
  const timeoutMs = options.timeoutMs || 45000;
  const attempts = options.attempts || 2;
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const raw = await r.text();
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch { data = { error: raw || 'Invalid server response' }; }
      if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
      if (!data || typeof data.reply !== 'string' || !data.reply.trim()) {
        throw new Error('The AI returned an empty reply. Retrying…');
      }
      return data;
    } catch (e) {
      lastError = e;
      const retryable = e.name === 'AbortError' || /empty reply|network|fetch|timeout|failed/i.test(String(e.message || e));
      if (!retryable || attempt === attempts) break;
      status.textContent = 'The reply did not come through. Retrying automatically…';
      await new Promise(resolve => setTimeout(resolve, 700));
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastError?.name === 'AbortError') throw new Error('The reply took too long. Please tap Create reply again.');
  throw lastError || new Error('Could not create a reply. Please try again.');
}

send.addEventListener('click', async () => {
  const text = message.value.trim();
  if (!text && !imageData.length) return;
  send.disabled = true;
  send.textContent = 'Writing…';
  status.textContent = '';
  answer.textContent = '';
  try {
    const data = await postJsonWithRetry('/api/chat', { message: text, images: imageData, history, guidance });
    answer.textContent = data.reply.trim();
    card.classList.remove('hidden');
    history.push({ customer: text || '[message shown in screenshot]', reply: data.reply.trim() });
    history = history.slice(-8);
    saveHistory();
    renderHistory();
    message.value = '';
    feedback.value = '';
    clearImages();
    status.textContent = '';
  } catch (e) {
    card.classList.add('hidden');
    status.textContent = e.message || 'Could not create a reply. Please try again.';
  } finally {
    send.disabled = false;
    send.textContent = 'Create reply';
  }
});

refine.addEventListener('click', async () => {
  const note = feedback.value.trim();
  const currentReply = answer.textContent.trim();
  const latest = history[history.length - 1];
  if (!note || !currentReply || !latest) return;
  refine.disabled = true;
  refine.textContent = 'Revising…';
  status.textContent = '';
  try {
    const data = await postJsonWithRetry('/api/refine', {
      message: latest.customer === '[message shown in screenshot]' ? '' : latest.customer,
      currentReply,
      feedback: note,
      history,
      guidance
    });
    answer.textContent = data.reply.trim();
    latest.reply = data.reply.trim();
    saveHistory();
    renderHistory();
    if (rememberGuidance.checked) {
      const normalized = note.replace(/\s+/g, ' ').trim();
      if (normalized && !guidance.some(x => String(x).toLowerCase() === normalized.toLowerCase())) guidance.push(normalized);
      saveGuidance();
    }
    feedback.value = '';
    status.textContent = '';
  } catch (e) {
    status.textContent = e.message || 'Could not revise the reply. Please try again.';
  } finally {
    refine.disabled = false;
    refine.textContent = 'Revise reply';
  }
});

function setupVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    voiceFeedback.disabled = true;
    voiceFeedback.textContent = '🎙️ Voice unavailable';
    voiceStatus.textContent = 'Voice dictation is not supported in this browser.';
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    isListening = true;
    speechBaseText = feedback.value.trim();
    voiceFeedback.classList.add('listening');
    voiceFeedback.textContent = '⏹ Stop';
    voiceStatus.textContent = voiceLanguage.value === 'he-IL' ? 'מקשיבה… דברי בעברית' : 'Listening… speak now';
  };

  recognition.onresult = event => {
    let finalTranscript = '';
    let interimTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += transcript;
      else interimTranscript += transcript;
    }
    const spoken = `${finalTranscript || interimTranscript}`.trim();
    const prefix = speechBaseText ? `${speechBaseText} ` : '';
    if (spoken) feedback.value = `${prefix}${spoken}`.trim();
    if (voiceLanguage.value === 'he-IL') feedback.dir = 'auto';
  };

  recognition.onerror = event => {
    if (event.error !== 'aborted') {
      voiceStatus.textContent = event.error === 'not-allowed'
        ? 'Microphone access is blocked. Please allow microphone access and try again.'
        : `Voice input error: ${event.error}`;
    }
  };

  recognition.onend = () => {
    isListening = false;
    voiceFeedback.classList.remove('listening');
    voiceFeedback.textContent = '🎙️ Speak';
    if (!voiceStatus.textContent.includes('error') && !voiceStatus.textContent.includes('blocked')) {
      voiceStatus.textContent = feedback.value.trim() ? 'Voice note added. You can edit it before revising.' : '';
    }
  };

  voiceFeedback.addEventListener('click', () => {
    if (isListening) {
      recognition.stop();
      return;
    }
    recognition.lang = voiceLanguage.value;
    voiceStatus.textContent = '';
    try {
      recognition.start();
    } catch {
      voiceStatus.textContent = 'Could not start voice input. Please try again.';
    }
  });
}

clearMessage.addEventListener('click', () => {
  message.value = '';
  answer.textContent = '';
  feedback.value = '';
  status.textContent = '';
  card.classList.add('hidden');
  clearImages();
  message.focus();
});

clearConversation.addEventListener('click', () => {
  history = [];
  saveHistory();
  renderHistory();
  message.value = '';
  answer.textContent = '';
  feedback.value = '';
  status.textContent = '';
  card.classList.add('hidden');
  clearImages();
  message.focus();
});

copy.addEventListener('click', async () => {
  await navigator.clipboard.writeText(answer.textContent);
  copy.textContent = 'Copied';
  setTimeout(() => copy.textContent = 'Copy', 1200);
});

message.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') send.click();
});

feedback.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') refine.click();
});

renderHistory();
renderGuidanceStatus();
setupVoiceInput();
