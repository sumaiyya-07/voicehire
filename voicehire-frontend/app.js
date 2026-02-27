// ═══════════════════════════════════════════════
//  VoiceHire Frontend — app.js
//  API client, SPA router, auth, interview, report
// ═══════════════════════════════════════════════

const API = '/api';

// ─── State ───
let TOKEN = localStorage.getItem('voicehire_token') || '';
let USER = JSON.parse(localStorage.getItem('voicehire_user') || 'null');
let currentInterview = null;  // { id, questions:[] }
let currentQIndex = 0;
let feedbackReceived = false;
let recognition = null;
let isRecording = false;
let speakerEnabled = true;
let currentUtterance = null;
let cameraEnabled = true;
let cameraStream = null;

// ─── Proctoring State ───
let proctorWarnings = 0;
const MAX_PROCTOR_WARNINGS = 3;
let proctorActive = false;
let faceDetectionInterval = null;
let previousFrameData = null;
let proctorCooldown = false; // prevents rapid-fire warnings

// ─── Boot ───
document.addEventListener('DOMContentLoaded', async () => {
    if (TOKEN && USER) {
        // Validate the stored token with the backend before showing app
        try {
            const res = await fetch(`${API}/auth/me`, {
                headers: { 'Authorization': `Bearer ${TOKEN}` }
            });
            if (res.ok) {
                const data = await res.json();
                USER = data.user;
                localStorage.setItem('voicehire_user', JSON.stringify(USER));
                showApp();
                navigate('dashboard');
            } else {
                // Token is invalid/expired — silently clear and show login
                TOKEN = '';
                USER = null;
                localStorage.removeItem('voicehire_token');
                localStorage.removeItem('voicehire_user');
            }
        } catch (err) {
            // Backend unreachable — clear and show login
            TOKEN = '';
            USER = null;
            localStorage.removeItem('voicehire_token');
            localStorage.removeItem('voicehire_user');
        }
    }
});

// ═══════════════════════════════════════════════
//  API HELPERS
// ═══════════════════════════════════════════════
async function api(path, opts = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (TOKEN) headers['Authorization'] = `Bearer ${TOKEN}`;

    const res = await fetch(`${API}${path}`, {
        ...opts,
        headers: { ...headers, ...(opts.headers || {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    const data = await res.json();
    if (!res.ok) {
        // Handle expired token (but not on auth endpoints — those return 401 for bad credentials)
        const isAuthEndpoint = path.startsWith('/auth/login') || path.startsWith('/auth/register');
        if (res.status === 401 && !isAuthEndpoint) {
            logout();
            throw new Error('Session expired. Please login again.');
        }
        throw new Error(data.message || `API error ${res.status}`);
    }
    return data;
}

// ═══════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════
function navigate(screen) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(`screen-${screen}`);
    if (target) target.classList.add('active');

    // Update nav active state
    document.querySelectorAll('.nav-links button').forEach(b => b.classList.remove('active'));
    if (screen === 'dashboard') document.getElementById('nav-dashboard')?.classList.add('active');
    if (screen === 'setup') document.getElementById('nav-new')?.classList.add('active');

    // Hooks
    if (screen === 'dashboard') loadDashboard();

    // Stop camera and proctoring when leaving session screen
    if (screen !== 'session') {
        stopCamera();
        stopProctoring();
    }
}

function showApp() {
    document.getElementById('navbar').style.display = 'flex';
    document.getElementById('nav-name').textContent = USER?.name || 'User';
    const avatar = document.getElementById('nav-avatar');
    avatar.textContent = (USER?.name || 'U').charAt(0).toUpperCase();
}

// ═══════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════
function switchAuthTab(tab) {
    document.getElementById('toggle-login').classList.toggle('active', tab === 'login');
    document.getElementById('toggle-register').classList.toggle('active', tab === 'register');
    document.getElementById('form-login').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('form-register').style.display = tab === 'register' ? 'block' : 'none';
}

async function handleLogin(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-login');
    btn.disabled = true;
    showLoading('Signing in...');

    try {
        const data = await api('/auth/login', {
            method: 'POST',
            body: {
                email: document.getElementById('login-email').value,
                password: document.getElementById('login-password').value,
            }
        });
        TOKEN = data.token;
        USER = data.user;
        localStorage.setItem('voicehire_token', TOKEN);
        localStorage.setItem('voicehire_user', JSON.stringify(USER));
        showApp();
        navigate('dashboard');
        toast('Welcome back, ' + USER.name + '! 🎉', 'success');
    } catch (err) {
        toast(err.message, 'error');
    } finally {
        hideLoading();
        btn.disabled = false;
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-register');
    btn.disabled = true;
    showLoading('Creating your account...');

    try {
        const data = await api('/auth/register', {
            method: 'POST',
            body: {
                name: document.getElementById('reg-name').value,
                email: document.getElementById('reg-email').value,
                password: document.getElementById('reg-password').value,
            }
        });
        TOKEN = data.token;
        USER = data.user;
        localStorage.setItem('voicehire_token', TOKEN);
        localStorage.setItem('voicehire_user', JSON.stringify(USER));
        showApp();
        navigate('dashboard');
        toast('Account created! Welcome, ' + USER.name + '! 🚀', 'success');
    } catch (err) {
        toast(err.message, 'error');
    } finally {
        hideLoading();
        btn.disabled = false;
    }
}

function logout() {
    TOKEN = '';
    USER = null;
    localStorage.removeItem('voicehire_token');
    localStorage.removeItem('voicehire_user');
    document.getElementById('navbar').style.display = 'none';
    navigate('auth');
    // Clear forms
    document.getElementById('form-login').reset();
    document.getElementById('form-register').reset();
    switchAuthTab('login');
}

// ═══════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════
async function loadDashboard() {
    document.getElementById('dash-name').textContent = USER?.name || 'User';

    try {
        const data = await api('/interview/history');
        const interviews = data.interviews || [];

        // Stats
        const total = interviews.length;
        const completed = interviews.filter(i => i.status === 'completed').length;
        const scores = interviews.filter(i => i.overall_score).map(i => i.overall_score);
        const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
        const best = interviews.find(i => i.grade)?.grade || null;

        document.getElementById('stat-total').textContent = total;
        document.getElementById('stat-completed').textContent = completed;
        document.getElementById('stat-avg-score').textContent = avg !== null ? avg : '—';
        document.getElementById('stat-best').textContent = best || '—';

        // Interview list
        const listEl = document.getElementById('interview-list');
        if (interviews.length === 0) {
            listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🎙️</div>
          <p>No interviews yet. Start your first mock interview!</p>
          <button class="btn btn-primary" onclick="navigate('setup')">Start Interview</button>
        </div>`;
            return;
        }

        listEl.innerHTML = interviews.map(iv => {
            const statusBadge = iv.status === 'completed'
                ? '<span class="badge badge-completed">Completed</span>'
                : '<span class="badge badge-in-progress">In Progress</span>';
            const diffBadge = `<span class="badge badge-${iv.difficulty.toLowerCase()}">${iv.difficulty}</span>`;
            const scoreEl = iv.overall_score
                ? `<div class="score-circle ${getScoreClass(iv.overall_score)}">${iv.overall_score}</div>`
                : '';
            const date = new Date(iv.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

            return `
        <div class="glass-card interview-card" onclick="viewInterview(${iv.id}, '${iv.status}')">
          <div class="ic-left">
            <div class="ic-role">${escapeHtml(iv.job_role)}</div>
            <div class="ic-meta">
              <span>${iv.interview_type}</span>
              <span>${iv.num_questions} Q's</span>
              <span>${date}</span>
            </div>
          </div>
          <div class="ic-right">
            ${diffBadge}
            ${statusBadge}
            ${scoreEl}
          </div>
        </div>`;
        }).join('');

    } catch (err) {
        toast('Failed to load dashboard: ' + err.message, 'error');
    }
}

async function viewInterview(id, status) {
    if (status === 'completed') {
        // Load and show report
        showLoading('Loading report...');
        try {
            const data = await api(`/report/${id}`);
            renderReport(data);
            navigate('report');
        } catch (err) {
            // Report not generated yet, try to generate
            try {
                const data = await api(`/report/generate/${id}`, { method: 'POST' });
                renderReport(data);
                navigate('report');
            } catch (err2) {
                toast('Could not load report: ' + err2.message, 'error');
            }
        } finally {
            hideLoading();
        }
    } else {
        // Resume interview
        showLoading('Loading interview...');
        try {
            const data = await api(`/interview/${id}`);
            resumeInterview(data);
        } catch (err) {
            toast('Failed to load interview: ' + err.message, 'error');
        } finally {
            hideLoading();
        }
    }
}

function resumeInterview(data) {
    const questions = data.questions || [];
    currentInterview = {
        id: data.interview.id,
        questions: questions.map(q => ({
            id: q.id,
            index: q.question_index,
            text: q.question_text,
            answered: !!q.answer_text,
        }))
    };
    // Find first unanswered question
    currentQIndex = currentInterview.questions.findIndex(q => !q.answered);
    if (currentQIndex === -1) currentQIndex = currentInterview.questions.length - 1;
    feedbackReceived = false;
    navigate('session');
    renderCurrentQuestion();
}

// ═══════════════════════════════════════════════
//  INTERVIEW SETUP
// ═══════════════════════════════════════════════
async function handleStartInterview(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-start-interview');
    btn.disabled = true;
    showLoading('Morgan Reid is preparing your interview questions...');

    try {
        const body = {
            jobRole: document.getElementById('setup-role').value,
            experience: document.getElementById('setup-experience').value,
            interviewType: document.getElementById('setup-type').value,
            difficulty: document.getElementById('setup-difficulty').value,
            numQuestions: parseInt(document.getElementById('setup-num').value),
            topic: document.getElementById('setup-topic').value,
        };

        const data = await api('/interview/start', { method: 'POST', body });

        currentInterview = {
            id: data.interviewId,
            questions: data.questions.map(q => ({
                id: q.id,
                index: q.question_index,
                text: q.question_text,
                answered: false,
            }))
        };
        currentQIndex = 0;
        feedbackReceived = false;
        navigate('session');
        renderCurrentQuestion();
        toast('Interview started! Good luck! 🍀', 'success');
    } catch (err) {
        toast('Failed to start interview: ' + err.message, 'error');
    } finally {
        hideLoading();
        btn.disabled = false;
    }
}

// ═══════════════════════════════════════════════
//  INTERVIEW SESSION
// ═══════════════════════════════════════════════
function renderCurrentQuestion() {
    const q = currentInterview.questions[currentQIndex];
    const total = currentInterview.questions.length;
    const progress = ((currentQIndex) / total) * 100;

    document.getElementById('session-progress-bar').style.width = progress + '%';
    document.getElementById('session-progress-text').textContent =
        `Question ${currentQIndex + 1} of ${total}`;
    document.getElementById('q-label').textContent = `Question ${currentQIndex + 1}`;
    document.getElementById('q-text').textContent = q.text;
    document.getElementById('answer-text').value = '';
    document.getElementById('feedback-area').innerHTML = '';
    feedbackReceived = false;

    // Button states
    document.getElementById('btn-submit-answer').style.display = 'inline-flex';
    document.getElementById('btn-skip').style.display = 'inline-flex';
    document.getElementById('btn-next').style.display = 'none';
    document.getElementById('btn-finish').style.display = 'none';
    document.getElementById('answer-text').disabled = false;
    document.getElementById('answer-text').focus();

    // Reset voice input
    stopVoice();

    // Start camera if enabled
    if (cameraEnabled && !cameraStream) {
        startCamera();
    }

    // Start proctoring if not already active
    if (!proctorActive) {
        startProctoring();
    }

    // Interviewer speaks the question aloud
    speakText(`Question ${currentQIndex + 1}. ${q.text}`);
}

async function submitAnswer() {
    const answerText = document.getElementById('answer-text').value.trim();
    if (answerText.length < 5) {
        toast('Please provide a longer answer (at least 5 characters).', 'error');
        return;
    }

    const q = currentInterview.questions[currentQIndex];
    const btn = document.getElementById('btn-submit-answer');
    btn.disabled = true;
    showLoading('AI is evaluating your answer...');

    try {
        const data = await api(`/interview/${currentInterview.id}/answer`, {
            method: 'POST',
            body: { questionId: q.id, answerText }
        });

        q.answered = true;
        feedbackReceived = true;

        // Render feedback
        const fb = data.feedback;
        document.getElementById('feedback-area').innerHTML = `
      <div class="glass-card feedback-card">
        <div class="feedback-header">
          <div>
            <div class="feedback-label">Score</div>
            <div class="feedback-score" style="color:${getScoreColor(fb.score)}">${fb.score}/100</div>
          </div>
        </div>
        <div class="feedback-item positive">
          <strong>✅ Strength</strong>
          <p>${escapeHtml(fb.positive)}</p>
        </div>
        <div class="feedback-item improve">
          <strong>💡 Improvement</strong>
          <p>${escapeHtml(fb.improve)}</p>
        </div>
      <div class="feedback-brief">"${escapeHtml(fb.brief)}"</div>
      </div>`;

        // 🔊 Interviewer speaks the feedback
        speakText(fb.brief);

        // Update buttons
        document.getElementById('btn-submit-answer').style.display = 'none';
        document.getElementById('btn-skip').style.display = 'none';
        document.getElementById('answer-text').disabled = true;

        const isLast = currentQIndex >= currentInterview.questions.length - 1;
        if (isLast) {
            document.getElementById('btn-finish').style.display = 'inline-flex';
        } else {
            document.getElementById('btn-next').style.display = 'inline-flex';
        }

        stopVoice();
    } catch (err) {
        toast('Error submitting answer: ' + err.message, 'error');
    } finally {
        hideLoading();
        btn.disabled = false;
    }
}

function skipQuestion() {
    const total = currentInterview.questions.length;
    if (currentQIndex < total - 1) {
        currentQIndex++;
        renderCurrentQuestion();
    } else {
        finishInterview();
    }
}

function nextQuestion() {
    currentQIndex++;
    renderCurrentQuestion();
}

async function finishInterview() {
    showLoading('Completing interview and generating your report...');

    try {
        // Mark as completed
        await api(`/interview/${currentInterview.id}/complete`, { method: 'PATCH' });

        // Generate report
        const data = await api(`/report/generate/${currentInterview.id}`, { method: 'POST' });

        renderReport(data);
        navigate('report');
        toast('Interview complete! Here\'s your performance report 🎯', 'success');
    } catch (err) {
        toast('Error finishing interview: ' + err.message, 'error');
        navigate('dashboard');
    } finally {
        hideLoading();
    }
}

// ═══════════════════════════════════════════════
//  VOICE (Web Speech API)
// ═══════════════════════════════════════════════
function toggleVoice() {
    if (isRecording) {
        stopVoice();
    } else {
        startVoice();
    }
}

function startVoice() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        toast('Voice recognition is not supported in this browser. Try Chrome.', 'error');
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';

    let finalTranscript = document.getElementById('answer-text').value;

    recognition.onresult = (event) => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript + ' ';
            } else {
                interim += event.results[i][0].transcript;
            }
        }
        document.getElementById('answer-text').value = finalTranscript + interim;
    };

    recognition.onerror = (event) => {
        console.error('Speech error:', event.error);
        if (event.error !== 'no-speech') {
            toast('Voice error: ' + event.error, 'error');
        }
        stopVoice();
    };

    recognition.onend = () => {
        if (isRecording) {
            // Restart if we're still in recording mode (browser stops after silence)
            try { recognition.start(); } catch (e) { }
        }
    };

    recognition.start();
    isRecording = true;
    document.getElementById('mic-btn').classList.add('recording');
    document.getElementById('voice-status').textContent = '🔴 Listening... Click mic to stop';
}

function stopVoice() {
    isRecording = false;
    if (recognition) {
        try { recognition.stop(); } catch (e) { }
        recognition = null;
    }
    document.getElementById('mic-btn').classList.remove('recording');
    document.getElementById('voice-status').textContent = 'Click the mic to speak your answer';
}

// ═══════════════════════════════════════════════
//  TEXT-TO-SPEECH (Interviewer Voice)
// ═══════════════════════════════════════════════
function speakText(text) {
    if (!speakerEnabled || !('speechSynthesis' in window)) return;

    // Stop any current speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 0.85;
    utterance.volume = 1;

    // Pick the best Indian English voice available
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => v.lang === 'en-IN')
        || voices.find(v =>
            v.name.includes('Google हिन्दी') ||
            v.name.includes('Microsoft Heera') ||
            v.name.includes('Microsoft Ravi')
        )
        || voices.find(v => v.lang.startsWith('en') && v.name.toLowerCase().includes('india'))
        || voices.find(v => v.lang.startsWith('en'))
        || voices[0];

    if (preferred) utterance.voice = preferred;
    utterance.lang = 'en-IN';

    currentUtterance = utterance;

    const speakerBtn = document.getElementById('speaker-btn');
    if (speakerBtn) speakerBtn.textContent = '🔊';

    utterance.onend = () => {
        if (speakerBtn) speakerBtn.textContent = '🔈';
    };

    window.speechSynthesis.speak(utterance);
}

function toggleSpeaker() {
    speakerEnabled = !speakerEnabled;
    const btn = document.getElementById('speaker-btn');
    if (btn) {
        btn.textContent = speakerEnabled ? '🔈' : '🔇';
        btn.title = speakerEnabled ? 'Speaker On (click to mute)' : 'Speaker Off (click to unmute)';
    }
    if (!speakerEnabled) {
        window.speechSynthesis.cancel();
    }
    toast(speakerEnabled ? 'Interviewer voice enabled 🔊' : 'Interviewer voice muted 🔇', 'success');
}

// Preload voices
if ('speechSynthesis' in window) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}

// ═══════════════════════════════════════════════
//  CAMERA (getUserMedia)
// ═══════════════════════════════════════════════
function toggleCamera() {
    if (cameraStream) {
        stopCamera();
        cameraEnabled = false;
        toast('Camera turned off 📷', 'success');
    } else {
        startCamera();
        cameraEnabled = true;
        toast('Camera turned on 📹', 'success');
    }
}

async function startCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
            audio: false
        });
        cameraStream = stream;
        const video = document.getElementById('camera-video');
        video.srcObject = stream;
        video.play();

        // Update UI
        const panel = document.getElementById('camera-panel');
        panel.classList.add('camera-active');
        const btn = document.getElementById('camera-btn');
        btn.classList.add('camera-on');
        btn.textContent = '📹';
        btn.title = 'Camera On (click to turn off)';
    } catch (err) {
        console.error('Camera error:', err);
        if (err.name === 'NotAllowedError') {
            toast('Camera access denied. Please allow camera permissions.', 'error');
        } else if (err.name === 'NotFoundError') {
            toast('No camera found on this device.', 'error');
        } else {
            toast('Could not access camera: ' + err.message, 'error');
        }
        cameraEnabled = false;
    }
}

function stopCamera() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
        cameraStream = null;
    }
    const video = document.getElementById('camera-video');
    if (video) video.srcObject = null;

    const panel = document.getElementById('camera-panel');
    if (panel) panel.classList.remove('camera-active');
    const btn = document.getElementById('camera-btn');
    if (btn) {
        btn.classList.remove('camera-on');
        btn.textContent = '📹';
        btn.title = 'Camera Off (click to turn on)';
    }
}

function takeSnapshot() {
    if (!cameraStream) {
        toast('Turn on the camera first to take a snapshot.', 'error');
        return;
    }

    const video = document.getElementById('camera-video');
    const canvas = document.getElementById('snapshot-canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Mirror the snapshot to match the preview
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Trigger flash animation
    const flash = document.getElementById('snapshot-flash');
    flash.classList.remove('flash');
    void flash.offsetWidth; // force reflow
    flash.classList.add('flash');

    // Download the snapshot
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.download = `voicehire-snapshot-${timestamp}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    toast('Snapshot saved! 📸', 'success');
}

// ═══════════════════════════════════════════════
//  PROCTORING (Cheating Detection)
// ═══════════════════════════════════════════════

function startProctoring() {
    if (proctorActive) return;
    proctorActive = true;
    proctorWarnings = 0;
    previousFrameData = null;
    proctorCooldown = false;

    // Update status bar
    updateProctorStatusBar();

    // 1. Tab Switch Detection (Page Visibility API)
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 2. Window blur detection (catches Alt+Tab, clicking outside browser)
    window.addEventListener('blur', handleWindowBlur);

    // 3. Face/Head Movement Detection via canvas frame comparison
    startFaceDetection();

    console.log('[Proctor] Proctoring started');
}

function stopProctoring() {
    if (!proctorActive) return;
    proctorActive = false;

    // Remove listeners
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('blur', handleWindowBlur);

    // Stop face detection
    if (faceDetectionInterval) {
        clearInterval(faceDetectionInterval);
        faceDetectionInterval = null;
    }
    previousFrameData = null;

    console.log('[Proctor] Proctoring stopped');
}

// --- Tab Visibility Change ---
function handleVisibilityChange() {
    if (!proctorActive) return;
    if (document.hidden) {
        handleProctorViolation('You switched away from the interview tab. Please stay focused on this page.');
    }
}

// --- Window Blur (Alt+Tab, clicking outside) ---
function handleWindowBlur() {
    if (!proctorActive) return;
    // Small delay to avoid false positives from UI interactions
    setTimeout(() => {
        if (!proctorActive) return;
        if (document.hidden) {
            // Already handled by visibilitychange
            return;
        }
        handleProctorViolation('You navigated away from the browser window. Please keep this window focused.');
    }, 300);
}

// --- Face/Head Movement Detection ---
function startFaceDetection() {
    if (faceDetectionInterval) clearInterval(faceDetectionInterval);

    // Check every 2 seconds
    faceDetectionInterval = setInterval(() => {
        if (!proctorActive || !cameraStream) return;
        detectFaceMovement();
    }, 2000);
}

function detectFaceMovement() {
    const video = document.getElementById('camera-video');
    const canvas = document.getElementById('proctor-canvas');
    if (!video || !canvas || !video.videoWidth) return;

    const ctx = canvas.getContext('2d');
    canvas.width = 160;  // Low-res for performance
    canvas.height = 120;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const currentData = currentFrame.data;

    if (!previousFrameData) {
        previousFrameData = currentData.slice();
        return;
    }

    // Compare frames: count pixels with significant change
    let changedPixels = 0;
    const totalPixels = canvas.width * canvas.height;
    const threshold = 60; // Per-channel difference threshold

    for (let i = 0; i < currentData.length; i += 4) {
        const rDiff = Math.abs(currentData[i] - previousFrameData[i]);
        const gDiff = Math.abs(currentData[i + 1] - previousFrameData[i + 1]);
        const bDiff = Math.abs(currentData[i + 2] - previousFrameData[i + 2]);
        const avgDiff = (rDiff + gDiff + bDiff) / 3;

        if (avgDiff > threshold) {
            changedPixels++;
        }
    }

    const changePercent = (changedPixels / totalPixels) * 100;
    previousFrameData = currentData.slice();

    // If more than 40% of the frame changed dramatically, likely head moved away
    if (changePercent > 40) {
        console.log(`[Proctor] Significant movement detected: ${changePercent.toFixed(1)}% pixels changed`);
        handleProctorViolation('Excessive head movement detected. Please face the camera and stay focused on the interview.');
    }
}

// --- Violation Handler ---
function handleProctorViolation(reason) {
    if (!proctorActive || proctorCooldown) return;

    proctorWarnings++;
    proctorCooldown = true;

    // Cooldown: prevent multiple warnings within 8 seconds
    setTimeout(() => { proctorCooldown = false; }, 8000);

    updateProctorStatusBar();

    console.log(`[Proctor] Violation #${proctorWarnings}: ${reason}`);

    if (proctorWarnings >= MAX_PROCTOR_WARNINGS) {
        // Terminate interview
        showInterviewTerminated(reason);
    } else {
        showProctorWarning(reason, proctorWarnings);
    }
}

// --- Update Status Bar ---
function updateProctorStatusBar() {
    const bar = document.getElementById('proctor-status-bar');
    const countEl = document.getElementById('proctor-warning-count');
    if (!bar || !countEl) return;

    countEl.textContent = `Warnings: ${proctorWarnings} / ${MAX_PROCTOR_WARNINGS}`;

    if (proctorWarnings > 0) {
        bar.classList.add('has-warnings');
    } else {
        bar.classList.remove('has-warnings');
    }
}

// --- Show Warning Modal ---
function showProctorWarning(reason, count) {
    const modal = document.getElementById('proctor-warning-modal');
    const reasonEl = document.getElementById('proctor-warning-reason');
    const counterEl = document.getElementById('proctor-warning-counter');

    if (reasonEl) reasonEl.textContent = reason;
    if (counterEl) counterEl.textContent = `Warning ${count} of ${MAX_PROCTOR_WARNINGS}`;

    modal.classList.remove('hidden');

    // Play a warning sound effect using TTS
    speakText('Warning! Suspicious activity has been detected. Please stay focused on your interview.');

    // Auto-dismiss after 8 seconds if not clicked
    setTimeout(() => {
        if (!modal.classList.contains('hidden')) {
            dismissProctorWarning();
        }
    }, 8000);
}

function dismissProctorWarning() {
    const modal = document.getElementById('proctor-warning-modal');
    if (modal) modal.classList.add('hidden');
}

// --- Show Terminated Modal ---
function showInterviewTerminated(lastReason) {
    stopProctoring();
    stopVoice();
    window.speechSynthesis.cancel();

    const modal = document.getElementById('proctor-terminated-modal');
    const detailEl = document.getElementById('proctor-terminated-detail');
    if (detailEl) {
        detailEl.textContent = `Last violation: ${lastReason}`;
    }
    modal.classList.remove('hidden');

    // Speak termination message
    speakText('Your interview has been terminated due to multiple proctoring violations.');
}

async function dismissTerminatedModal() {
    const modal = document.getElementById('proctor-terminated-modal');
    if (modal) modal.classList.add('hidden');

    // Try to mark interview as completed
    if (currentInterview) {
        try {
            await api(`/interview/${currentInterview.id}/complete`, { method: 'PATCH' });
        } catch (e) {
            console.error('Failed to mark terminated interview:', e);
        }
    }

    stopCamera();
    navigate('dashboard');
    toast('Interview was terminated due to proctoring violations.', 'error');
}

// ═══════════════════════════════════════════════
//  REPORT
// ═══════════════════════════════════════════════
function renderReport(data) {
    const report = data.report;
    const interview = data.interview;
    const qas = data.qaBreakdown || [];

    // Determine score color
    const scoreColor = getScoreColor(report.overallScore || report.overall_score);
    const overallScore = report.overallScore || report.overall_score;
    const grade = report.grade;

    // Skill scores
    const skills = [
        { name: 'Communication', score: report.communication },
        { name: 'Relevance', score: report.relevance },
        { name: 'Confidence', score: report.confidence },
        { name: 'Structure', score: report.structure },
        { name: 'Depth', score: report.depth },
    ];

    // Strengths / Improvements
    const strengths = Array.isArray(report.strengths) ? report.strengths : JSON.parse(report.strengths || '[]');
    const improvements = Array.isArray(report.improvements) ? report.improvements : JSON.parse(report.improvements || '[]');
    const recommendation = report.recommendation || '';

    const container = document.getElementById('report-content');
    container.innerHTML = `
    <div class="report-header">
      <h2>Performance <span>Report</span></h2>
      <div class="report-meta">
        ${escapeHtml(interview.jobRole || interview.job_role)} · ${interview.difficulty || ''} · ${interview.interviewType || interview.interview_type || ''}
      </div>
    </div>

    <div class="glass-card report-score-main">
      <div class="report-score-big" style="color:${scoreColor}">${overallScore}</div>
      <div class="report-grade" style="color:${scoreColor}">${grade}</div>
    </div>

    <div class="glass-card" style="padding:24px; margin-bottom:24px;">
      <div class="section-title">📊 Skill Breakdown</div>
      <div class="skill-bars">
        ${skills.map(s => `
          <div class="skill-bar-item">
            <div class="skill-bar-label">
              <span>${s.name}</span>
              <span>${s.score}/100</span>
            </div>
            <div class="skill-bar-track">
              <div class="skill-bar-fill" style="width:${s.score}%; background:${getScoreColor(s.score)};"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="si-grid">
      <div class="glass-card si-card strengths">
        <h4>💪 Strengths</h4>
        <ul>
          ${strengths.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
        </ul>
      </div>
      <div class="glass-card si-card improvements">
        <h4>🔧 Areas to Improve</h4>
        <ul>
          ${improvements.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
        </ul>
      </div>
    </div>

    ${recommendation ? `
    <div class="glass-card recommendation-card">
      <h4>🎯 Recommendation</h4>
      <p>${escapeHtml(recommendation)}</p>
    </div>` : ''}

    <div class="section-title">📝 Question & Answer Breakdown</div>
    <div class="qa-breakdown">
      ${qas.map((qa, i) => `
        <div class="glass-card qa-item">
          <div class="qa-q">Q${i + 1}: ${escapeHtml(qa.question_text)}</div>
          ${qa.answer_text
            ? `<div class="qa-a">${escapeHtml(qa.answer_text)}</div>
               <div class="qa-score-row">
                 <span class="qa-s" style="color:${getScoreColor(qa.score)}">Score: ${qa.score}/100</span>
                 ${qa.positive ? `<span>✅ ${escapeHtml(qa.positive)}</span>` : ''}
               </div>`
            : '<div class="qa-a" style="color:var(--text-muted); font-style:italic;">— Skipped —</div>'}
        </div>
      `).join('')}
    </div>

    <div style="display:flex; gap:12px; justify-content:center; margin-top:24px; padding-bottom:40px;">
      <button class="btn btn-secondary" onclick="navigate('dashboard')">← Back to Dashboard</button>
      <button class="btn btn-primary" onclick="navigate('setup')">🎙️ New Interview</button>
    </div>
  `;

    // Animate skill bars after render
    setTimeout(() => {
        container.querySelectorAll('.skill-bar-fill').forEach(bar => {
            bar.style.width = bar.style.width; // trigger reflow
        });
    }, 100);
}

// ═══════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════
function showLoading(text = 'Loading...') {
    document.getElementById('loading-text').textContent = text;
    document.getElementById('loading').classList.remove('hidden');
}

function hideLoading() {
    document.getElementById('loading').classList.add('hidden');
}

function toast(message, type = 'success') {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.className = `toast ${type} show`;
    setTimeout(() => el.classList.remove('show'), 4000);
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function getScoreColor(score) {
    if (score >= 85) return '#10b981';
    if (score >= 70) return '#06b6d4';
    if (score >= 55) return '#f59e0b';
    return '#f43f5e';
}

function getScoreClass(score) {
    if (score >= 85) return 'score-excellent';
    if (score >= 70) return 'score-good';
    if (score >= 55) return 'score-average';
    return 'score-poor';
}
