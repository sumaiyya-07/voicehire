'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

const API = '/api';

// ═══════════════════════════════════════════════
//  MAIN APP COMPONENT
// ═══════════════════════════════════════════════
export default function VoiceHireApp() {
  // ─── State ───
  const [token, setToken] = useState('');
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState('auth');
  const [authTab, setAuthTab] = useState('login');
  const [loadingText, setLoadingText] = useState('');
  const [toastMsg, setToastMsg] = useState({ text: '', type: '', show: false });

  // Dashboard
  const [interviews, setInterviews] = useState([]);

  // Interview session
  const [currentInterview, setCurrentInterview] = useState(null);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [feedbackReceived, setFeedbackReceived] = useState(false);
  const [answerText, setAnswerText] = useState('');
  const [feedbackData, setFeedbackData] = useState(null);

  // Report
  const [reportData, setReportData] = useState(null);

  // Voice
  const [isRecording, setIsRecording] = useState(false);
  const [speakerEnabled, setSpeakerEnabled] = useState(true);
  const recognitionRef = useRef(null);

  // Camera
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const cameraStreamRef = useRef(null);
  const videoRef = useRef(null);
  const snapshotCanvasRef = useRef(null);
  const proctorCanvasRef = useRef(null);
  const flashRef = useRef(null);
  const [cameraActive, setCameraActive] = useState(false);

  // Proctoring
  const [proctorWarnings, setProctorWarnings] = useState(0);
  const MAX_PROCTOR_WARNINGS = 3;
  const proctorActiveRef = useRef(false);
  const proctorCooldownRef = useRef(false);
  const previousFrameRef = useRef(null);
  const faceIntervalRef = useRef(null);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningReason, setWarningReason] = useState('');
  const [showTerminatedModal, setShowTerminatedModal] = useState(false);
  const [terminatedReason, setTerminatedReason] = useState('');
  const proctorWarningsRef = useRef(0);

  // ─── Boot ───
  useEffect(() => {
    const savedToken = localStorage.getItem('voicehire_token') || '';
    const savedUser = JSON.parse(localStorage.getItem('voicehire_user') || 'null');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(savedUser);
      // Validate token
      fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${savedToken}` } })
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error('Invalid token');
        })
        .then((data) => {
          setUser(data.user);
          localStorage.setItem('voicehire_user', JSON.stringify(data.user));
          setScreen('dashboard');
        })
        .catch(() => {
          setToken('');
          setUser(null);
          localStorage.removeItem('voicehire_token');
          localStorage.removeItem('voicehire_user');
        });
    }
  }, []);

  // Preload voices
  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
  }, []);

  // ─── API Helper ───
  const api = useCallback(async (path, opts = {}) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    let res;
    try {
      res = await fetch(`${API}${path}`, {
        ...opts,
        headers: { ...headers, ...(opts.headers || {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
      });
    } catch (networkErr) {
      throw new Error('Cannot connect to server.');
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      if (res.status === 429) throw new Error('Too many requests. Please wait a few minutes.');
      throw new Error(`Server returned an unexpected response (${res.status}).`);
    }
    const data = await res.json();
    if (!res.ok) {
      const isAuthEndpoint = path.startsWith('/auth/login') || path.startsWith('/auth/register');
      if (res.status === 401 && !isAuthEndpoint) {
        doLogout();
        throw new Error('Session expired. Please login again.');
      }
      throw new Error(data.message || `API error ${res.status}`);
    }
    return data;
  }, [token]);

  // ─── Toast ───
  const toast = (text, type = 'success') => {
    setToastMsg({ text, type, show: true });
    setTimeout(() => setToastMsg((p) => ({ ...p, show: false })), 4000);
  };

  const showLoading = (text) => setLoadingText(text);
  const hideLoading = () => setLoadingText('');

  // ─── Navigate ───
  const navigate = useCallback((s) => {
    setScreen(s);
    if (s !== 'session') {
      stopCamera();
      stopProctoring();
    }
  }, []);

  // ─── Auth ───
  const handleLogin = async (e) => {
    e.preventDefault();
    const form = e.target;
    const email = form.elements['login-email'].value;
    const password = form.elements['login-password'].value;
    showLoading('Signing in...');
    try {
      const data = await api('/auth/login', { method: 'POST', body: { email, password } });
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('voicehire_token', data.token);
      localStorage.setItem('voicehire_user', JSON.stringify(data.user));
      setScreen('dashboard');
      toast('Welcome back, ' + data.user.name + '! 🎉', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      hideLoading();
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.elements['reg-name'].value;
    const email = form.elements['reg-email'].value;
    const password = form.elements['reg-password'].value;
    showLoading('Creating your account...');
    try {
      const data = await api('/auth/register', { method: 'POST', body: { name, email, password } });
      setToken(data.token);
      setUser(data.user);
      localStorage.setItem('voicehire_token', data.token);
      localStorage.setItem('voicehire_user', JSON.stringify(data.user));
      setScreen('dashboard');
      toast('Account created! Welcome, ' + data.user.name + '! 🚀', 'success');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      hideLoading();
    }
  };

  const doLogout = () => {
    setToken('');
    setUser(null);
    localStorage.removeItem('voicehire_token');
    localStorage.removeItem('voicehire_user');
    setScreen('auth');
    setAuthTab('login');
  };

  // ─── Dashboard ───
  const loadDashboard = useCallback(async () => {
    try {
      const data = await api('/interview/history');
      setInterviews(data.interviews || []);
    } catch (err) {
      toast('Failed to load dashboard: ' + err.message, 'error');
    }
  }, [api]);

  useEffect(() => {
    if (screen === 'dashboard' && token) loadDashboard();
  }, [screen, token, loadDashboard]);

  const viewInterview = async (id, status) => {
    if (status === 'completed') {
      showLoading('Loading report...');
      try {
        const data = await api(`/report/${id}`);
        setReportData(data);
        setScreen('report');
      } catch {
        try {
          const data = await api(`/report/generate/${id}`, { method: 'POST' });
          setReportData(data);
          setScreen('report');
        } catch (err2) {
          toast('Could not load report: ' + err2.message, 'error');
        }
      } finally {
        hideLoading();
      }
    } else {
      showLoading('Loading interview...');
      try {
        const data = await api(`/interview/${id}`);
        const questions = data.questions || [];
        const ci = {
          id: data.interview.id || data.interview._id,
          questions: questions.map((q) => ({
            id: q.id || q._id,
            index: q.question_index,
            text: q.question_text,
            answered: !!q.answer_text,
          })),
        };
        setCurrentInterview(ci);
        const firstUnanswered = ci.questions.findIndex((q) => !q.answered);
        setCurrentQIndex(firstUnanswered === -1 ? ci.questions.length - 1 : firstUnanswered);
        setFeedbackReceived(false);
        setFeedbackData(null);
        setAnswerText('');
        setScreen('session');
      } catch (err) {
        toast('Failed to load interview: ' + err.message, 'error');
      } finally {
        hideLoading();
      }
    }
  };

  // ─── Interview Setup ───
  const handleStartInterview = async (e) => {
    e.preventDefault();
    const form = e.target;
    showLoading('Morgan Reid is preparing your interview questions...');
    try {
      const body = {
        jobRole: form.elements['setup-role'].value,
        experience: form.elements['setup-experience'].value,
        interviewType: form.elements['setup-type'].value,
        difficulty: form.elements['setup-difficulty'].value,
        numQuestions: parseInt(form.elements['setup-num'].value),
        topic: form.elements['setup-topic'].value,
      };
      const data = await api('/interview/start', { method: 'POST', body });
      const ci = {
        id: data.interviewId,
        questions: data.questions.map((q) => ({
          id: q.id || q._id,
          index: q.question_index,
          text: q.question_text,
          answered: false,
        })),
      };
      setCurrentInterview(ci);
      setCurrentQIndex(0);
      setFeedbackReceived(false);
      setFeedbackData(null);
      setAnswerText('');
      setScreen('session');
      toast('Interview started! Good luck! 🍀', 'success');
    } catch (err) {
      toast('Failed to start interview: ' + err.message, 'error');
    } finally {
      hideLoading();
    }
  };

  // ─── Voice (Web Speech API) ───
  const speakText = useCallback((text) => {
    if (!speakerEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 0.85;
    utterance.volume = 1;
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => v.lang === 'en-IN') ||
      voices.find((v) => v.name.includes('Google हिन्दी') || v.name.includes('Microsoft Heera') || v.name.includes('Microsoft Ravi')) ||
      voices.find((v) => v.lang.startsWith('en') && v.name.toLowerCase().includes('india')) ||
      voices.find((v) => v.lang.startsWith('en')) ||
      voices[0];
    if (preferred) utterance.voice = preferred;
    utterance.lang = 'en-IN';
    window.speechSynthesis.speak(utterance);
  }, [speakerEnabled]);

  const startVoice = () => {
    if (typeof window === 'undefined') return;
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast('Voice recognition not supported. Try Chrome.', 'error');
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-IN';
    let finalT = answerText;
    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalT += event.results[i][0].transcript + ' ';
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setAnswerText(finalT + interim);
    };
    rec.onerror = (event) => {
      if (event.error !== 'no-speech') toast('Voice error: ' + event.error, 'error');
      stopVoice();
    };
    rec.onend = () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.start(); } catch { }
      }
    };
    rec.start();
    recognitionRef.current = rec;
    setIsRecording(true);
  };

  const stopVoice = () => {
    setIsRecording(false);
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { }
      recognitionRef.current = null;
    }
  };

  const toggleSpeaker = () => {
    setSpeakerEnabled((prev) => {
      if (prev) window.speechSynthesis?.cancel();
      toast(!prev ? 'Interviewer voice enabled 🔊' : 'Interviewer voice muted 🔇', 'success');
      return !prev;
    });
  };

  // ─── Camera ───
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      cameraStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      if (err.name === 'NotAllowedError') toast('Camera access denied.', 'error');
      else if (err.name === 'NotFoundError') toast('No camera found.', 'error');
      else toast('Could not access camera: ' + err.message, 'error');
      setCameraEnabled(false);
    }
  };

  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((t) => t.stop());
      cameraStreamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };

  const toggleCamera = () => {
    if (cameraStreamRef.current) {
      stopCamera();
      setCameraEnabled(false);
      toast('Camera turned off 📷', 'success');
    } else {
      startCamera();
      setCameraEnabled(true);
      toast('Camera turned on 📹', 'success');
    }
  };

  const takeSnapshot = () => {
    if (!cameraStreamRef.current) { toast('Turn on camera first.', 'error'); return; }
    const video = videoRef.current;
    const canvas = snapshotCanvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (flashRef.current) {
      flashRef.current.classList.remove('flash');
      void flashRef.current.offsetWidth;
      flashRef.current.classList.add('flash');
    }
    const link = document.createElement('a');
    link.download = `voicehire-snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('Snapshot saved! 📸', 'success');
  };

  // ─── Proctoring ───
  const handleProctorViolation = useCallback((reason) => {
    if (!proctorActiveRef.current || proctorCooldownRef.current) return;
    proctorWarningsRef.current += 1;
    const newCount = proctorWarningsRef.current;
    setProctorWarnings(newCount);
    proctorCooldownRef.current = true;
    setTimeout(() => { proctorCooldownRef.current = false; }, 8000);
    if (newCount >= MAX_PROCTOR_WARNINGS) {
      proctorActiveRef.current = false;
      setTerminatedReason(reason);
      setShowTerminatedModal(true);
      speakText('Your interview has been terminated due to multiple proctoring violations.');
    } else {
      setWarningReason(reason);
      setShowWarningModal(true);
      speakText('Warning! Suspicious activity has been detected.');
      setTimeout(() => setShowWarningModal(false), 8000);
    }
  }, [speakText]);

  const startProctoring = useCallback(() => {
    if (proctorActiveRef.current) return;
    proctorActiveRef.current = true;
    proctorWarningsRef.current = 0;
    setProctorWarnings(0);
    previousFrameRef.current = null;
    proctorCooldownRef.current = false;

    const visHandler = () => {
      if (!proctorActiveRef.current) return;
      if (document.hidden) handleProctorViolation('You switched away from the interview tab.');
    };
    const blurHandler = () => {
      if (!proctorActiveRef.current) return;
      setTimeout(() => {
        if (!proctorActiveRef.current || document.hidden) return;
        handleProctorViolation('You navigated away from the browser window.');
      }, 200);
    };
    document.addEventListener('visibilitychange', visHandler);
    window.addEventListener('blur', blurHandler);

    // Face detection interval
    faceIntervalRef.current = setInterval(() => {
      if (!proctorActiveRef.current || !cameraStreamRef.current) return;
      const video = videoRef.current;
      const canvas = proctorCanvasRef.current;
      if (!video || !canvas || !video.videoWidth) return;
      const ctx = canvas.getContext('2d');
      canvas.width = 160;
      canvas.height = 120;
      ctx.drawImage(video, 0, 0, 160, 120);
      const frame = ctx.getImageData(0, 0, 160, 120);
      const cur = frame.data;
      if (!previousFrameRef.current) { previousFrameRef.current = cur.slice(); return; }
      let changed = 0;
      const total = 160 * 120;
      for (let i = 0; i < cur.length; i += 4) {
        const avg = (Math.abs(cur[i] - previousFrameRef.current[i]) +
          Math.abs(cur[i + 1] - previousFrameRef.current[i + 1]) +
          Math.abs(cur[i + 2] - previousFrameRef.current[i + 2])) / 3;
        if (avg > 60) changed++;
      }
      previousFrameRef.current = cur.slice();
      if ((changed / total) * 100 > 40) {
        handleProctorViolation('Excessive head movement detected.');
      }
    }, 2000);

    // Store cleanup refs
    window._proctorVisHandler = visHandler;
    window._proctorBlurHandler = blurHandler;
  }, [handleProctorViolation]);

  const stopProctoring = useCallback(() => {
    if (!proctorActiveRef.current) return;
    proctorActiveRef.current = false;
    if (window._proctorVisHandler) document.removeEventListener('visibilitychange', window._proctorVisHandler);
    if (window._proctorBlurHandler) window.removeEventListener('blur', window._proctorBlurHandler);
    if (faceIntervalRef.current) { clearInterval(faceIntervalRef.current); faceIntervalRef.current = null; }
    previousFrameRef.current = null;
  }, []);

  // ─── Session: render question, start camera/proctoring ───
  useEffect(() => {
    if (screen === 'session' && currentInterview) {
      if (cameraEnabled && !cameraStreamRef.current) startCamera();
      if (!proctorActiveRef.current) startProctoring();
      const q = currentInterview.questions[currentQIndex];
      if (q) speakText(`Question ${currentQIndex + 1}. ${q.text}`);
    }
  }, [screen, currentQIndex]);

  const submitAnswer = async () => {
    if (answerText.trim().length < 5) {
      toast('Please provide a longer answer (at least 5 characters).', 'error');
      return;
    }
    const q = currentInterview.questions[currentQIndex];
    showLoading('AI is evaluating your answer...');
    try {
      const data = await api(`/interview/${currentInterview.id}/answer`, {
        method: 'POST',
        body: { questionId: q.id, answerText },
      });
      const updated = { ...currentInterview };
      updated.questions[currentQIndex].answered = true;
      setCurrentInterview(updated);
      setFeedbackReceived(true);
      setFeedbackData(data.feedback);
      speakText(data.feedback.brief);
      stopVoice();
    } catch (err) {
      toast('Error submitting answer: ' + err.message, 'error');
    } finally {
      hideLoading();
    }
  };

  const skipQuestion = () => {
    if (currentQIndex < currentInterview.questions.length - 1) {
      setCurrentQIndex((i) => i + 1);
      setFeedbackReceived(false);
      setFeedbackData(null);
      setAnswerText('');
    } else {
      finishInterview();
    }
  };

  const nextQuestion = () => {
    setCurrentQIndex((i) => i + 1);
    setFeedbackReceived(false);
    setFeedbackData(null);
    setAnswerText('');
  };

  const finishInterview = async () => {
    showLoading('Completing interview and generating your report...');
    try {
      await api(`/interview/${currentInterview.id}/complete`, { method: 'PATCH' });
      const data = await api(`/report/generate/${currentInterview.id}`, { method: 'POST' });
      setReportData(data);
      navigate('report');
      toast("Interview complete! Here's your performance report 🎯", 'success');
    } catch (err) {
      toast('Error finishing interview: ' + err.message, 'error');
      navigate('dashboard');
    } finally {
      hideLoading();
    }
  };

  const dismissTerminated = async () => {
    setShowTerminatedModal(false);
    if (currentInterview) {
      try { await api(`/interview/${currentInterview.id}/complete`, { method: 'PATCH' }); } catch { }
    }
    stopCamera();
    navigate('dashboard');
    toast('Interview was terminated due to proctoring violations.', 'error');
  };

  // ─── Utilities ───
  const escapeHtml = (str) => {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };

  const getScoreColor = (score) => {
    if (score >= 85) return '#10b981';
    if (score >= 70) return '#06b6d4';
    if (score >= 55) return '#f59e0b';
    return '#f43f5e';
  };

  const getScoreClass = (score) => {
    if (score >= 85) return 'score-excellent';
    if (score >= 70) return 'score-good';
    if (score >= 55) return 'score-average';
    return 'score-poor';
  };

  // ─── Computed stats ───
  const total = interviews.length;
  const completed = interviews.filter((i) => i.status === 'completed').length;
  const scores = interviews.filter((i) => i.overall_score).map((i) => i.overall_score);
  const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
  const bestGrade = interviews.find((i) => i.grade)?.grade || null;

  // ═══════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════
  return (
    <div className="app-wrapper">
      {/* ═══ Navbar ═══ */}
      {user && (
        <nav className="flex items-center justify-between px-8 py-4 bg-[rgba(10,10,15,0.8)] backdrop-blur-[20px] border-b border-border-default sticky top-0 z-[100]">
          <div className="text-[1.4rem] font-extrabold gradient-text tracking-tight">
            Voice<span className="font-normal opacity-70">Hire</span>
          </div>
          <div className="flex gap-2 items-center">
            <button
              onClick={() => navigate('dashboard')}
              className={`bg-transparent border border-border-default text-text-secondary px-4 py-2 rounded-lg text-[0.85rem] font-sans cursor-pointer transition-all duration-300 hover:bg-bg-card-hover hover:text-text-primary hover:border-accent-violet ${screen === 'dashboard' ? 'gradient-bg text-white !border-transparent' : ''}`}
            >
              📊 Dashboard
            </button>
            <button
              onClick={() => navigate('setup')}
              className={`bg-transparent border border-border-default text-text-secondary px-4 py-2 rounded-lg text-[0.85rem] font-sans cursor-pointer transition-all duration-300 hover:bg-bg-card-hover hover:text-text-primary hover:border-accent-violet ${screen === 'setup' ? 'gradient-bg text-white !border-transparent' : ''}`}
            >
              🎙️ New Interview
            </button>
          </div>
          <div className="flex items-center gap-[10px] text-text-secondary text-[0.85rem]">
            <div className="w-8 h-8 rounded-full gradient-bg flex items-center justify-center font-bold text-[0.8rem] text-white">
              {(user?.name || 'U').charAt(0).toUpperCase()}
            </div>
            <span>{user?.name || 'User'}</span>
            <button className="btn btn-secondary !py-[6px] !px-3 !text-[0.8rem]" onClick={doLogout}>
              Logout
            </button>
          </div>
        </nav>
      )}

      {/* ═══ Loading Overlay ═══ */}
      {loadingText && (
        <div className="loading-overlay">
          <div className="spinner" />
          <div className="text-text-secondary text-[0.9rem]">{loadingText}</div>
        </div>
      )}

      {/* ═══ Toast ═══ */}
      <div className={`toast-notification ${toastMsg.type} ${toastMsg.show ? 'show' : ''}`}>
        {toastMsg.text}
      </div>

      {/* ═══════════════════════════════════════════
           SCREEN 1: AUTH
           ═══════════════════════════════════════════ */}
      {screen === 'auth' && (
        <div className="screen-container">
          <div className="screen-center">
            <div className="glass-card !rounded-3xl !p-10 shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
              <h1 className="text-[1.75rem] font-bold text-center mb-1 gradient-text">VoiceHire</h1>
              <p className="text-center text-text-muted text-[0.9rem] mb-7">AI-Powered Mock Interviews</p>

              <div className="flex bg-bg-input rounded-lg p-1 mb-7">
                <button onClick={() => setAuthTab('login')} className={`flex-1 py-[10px] border-none rounded-md font-semibold text-[0.9rem] cursor-pointer transition-all duration-300 ${authTab === 'login' ? 'gradient-bg text-white shadow-[0_2px_12px_rgba(124,58,237,0.3)]' : 'bg-transparent text-text-muted'}`}>Login</button>
                <button onClick={() => setAuthTab('register')} className={`flex-1 py-[10px] border-none rounded-md font-semibold text-[0.9rem] cursor-pointer transition-all duration-300 ${authTab === 'register' ? 'gradient-bg text-white shadow-[0_2px_12px_rgba(124,58,237,0.3)]' : 'bg-transparent text-text-muted'}`}>Register</button>
              </div>

              {authTab === 'login' ? (
                <form onSubmit={handleLogin}>
                  <div className="mb-[18px]">
                    <label className="block text-[0.8rem] font-semibold text-text-secondary mb-[6px] uppercase tracking-[0.5px]">Email</label>
                    <input type="email" name="login-email" placeholder="you@example.com" required className="form-input" />
                  </div>
                  <div className="mb-[18px]">
                    <label className="block text-[0.8rem] font-semibold text-text-secondary mb-[6px] uppercase tracking-[0.5px]">Password</label>
                    <input type="password" name="login-password" placeholder="Enter password" required className="form-input" />
                  </div>
                  <button type="submit" className="btn btn-primary w-full">Sign In →</button>
                </form>
              ) : (
                <form onSubmit={handleRegister}>
                  <div className="mb-[18px]">
                    <label className="block text-[0.8rem] font-semibold text-text-secondary mb-[6px] uppercase tracking-[0.5px]">Full Name</label>
                    <input type="text" name="reg-name" placeholder="John Doe" required minLength={2} className="form-input" />
                  </div>
                  <div className="mb-[18px]">
                    <label className="block text-[0.8rem] font-semibold text-text-secondary mb-[6px] uppercase tracking-[0.5px]">Email</label>
                    <input type="email" name="reg-email" placeholder="you@example.com" required className="form-input" />
                  </div>
                  <div className="mb-[18px]">
                    <label className="block text-[0.8rem] font-semibold text-text-secondary mb-[6px] uppercase tracking-[0.5px]">Password</label>
                    <input type="password" name="reg-password" placeholder="Minimum 6 characters" required minLength={6} className="form-input" />
                  </div>
                  <button type="submit" className="btn btn-primary w-full">Create Account →</button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
           SCREEN 2: DASHBOARD
           ═══════════════════════════════════════════ */}
      {screen === 'dashboard' && (
        <div className="screen-container">
          <div className="screen-dashboard">
            <div className="text-center py-8 pb-6">
              <h1 className="text-[2rem] font-extrabold mb-1">Welcome back, <span className="gradient-text">{user?.name || 'User'}</span></h1>
              <p className="text-text-muted text-[0.95rem]">Track your interview performance and keep improving</p>
            </div>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4 mb-8">
              {[
                { val: total, label: 'Total Interviews' },
                { val: completed, label: 'Completed' },
                { val: avg !== null ? avg : '—', label: 'Avg Score' },
                { val: bestGrade || '—', label: 'Best Grade' },
              ].map((s, i) => (
                <div key={i} className="glass-card text-center !p-5">
                  <div className="text-[2rem] font-extrabold gradient-text">{s.val}</div>
                  <div className="text-[0.8rem] text-text-muted uppercase tracking-[0.5px] mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center mb-4">
              <div className="text-[1.15rem] font-bold flex items-center gap-2">📋 Interview History</div>
              <button className="btn btn-primary" onClick={() => navigate('setup')}>+ New Interview</button>
            </div>

            <div className="flex flex-col gap-3">
              {interviews.length === 0 ? (
                <div className="text-center py-[60px] px-5 text-text-muted">
                  <div className="text-[3rem] mb-3 opacity-50">🎙️</div>
                  <p className="text-[0.95rem] mb-4">No interviews yet. Start your first mock interview!</p>
                  <button className="btn btn-primary" onClick={() => navigate('setup')}>Start Interview</button>
                </div>
              ) : (
                interviews.map((iv) => (
                  <div key={iv.id || iv._id} className="glass-card flex items-center justify-between !py-[18px] !px-[22px] cursor-pointer max-md:flex-col max-md:items-start max-md:gap-3" onClick={() => viewInterview(iv.id || iv._id, iv.status)}>
                    <div className="flex-1">
                      <div className="font-semibold text-[1.05rem] mb-1">{iv.job_role}</div>
                      <div className="flex gap-3 text-[0.8rem] text-text-muted">
                        <span>{iv.interview_type}</span>
                        <span>{iv.num_questions} Q&apos;s</span>
                        <span>{new Date(iv.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 max-md:w-full max-md:justify-between">
                      <span className={`badge badge-${iv.difficulty.toLowerCase()}`}>{iv.difficulty}</span>
                      <span className={`badge ${iv.status === 'completed' ? 'badge-completed' : 'badge-in-progress'}`}>{iv.status === 'completed' ? 'Completed' : 'In Progress'}</span>
                      {iv.overall_score && <div className={`score-circle ${getScoreClass(iv.overall_score)}`}>{iv.overall_score}</div>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
           SCREEN 3: INTERVIEW SETUP
           ═══════════════════════════════════════════ */}
      {screen === 'setup' && (
        <div className="screen-container">
          <div className="screen-setup">
            <h2 className="text-[1.5rem] font-bold mb-6 text-center">Configure Your <span className="gradient-text">Interview</span></h2>
            <form className="glass-card !p-8" onSubmit={handleStartInterview}>
              <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
                <div className="col-span-2 max-md:col-span-1">
                  <label className="block text-[0.8rem] font-semibold text-text-secondary mb-[6px] uppercase tracking-[0.5px]">Job Role *</label>
                  <input type="text" name="setup-role" placeholder="e.g. Software Engineer, Product Manager" required className="form-input" />
                </div>
                <div>
                  <label className="block text-[0.8rem] font-semibold text-text-secondary mb-[6px] uppercase tracking-[0.5px]">Experience Level</label>
                  <select name="setup-experience" className="form-input">
                    <option value="">Select level</option>
                    <option>Fresher (0-1 yr)</option>
                    <option>Junior (1-3 yrs)</option>
                    <option>Mid-level (3-6 yrs)</option>
                    <option>Senior (6-10 yrs)</option>
                    <option>Lead / Staff (10+ yrs)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[0.8rem] font-semibold text-text-secondary mb-[6px] uppercase tracking-[0.5px]">Interview Type *</label>
                  <select name="setup-type" required className="form-input">
                    <option value="behavioral">Behavioral</option>
                    <option value="technical">Technical</option>
                    <option value="situational">Situational</option>
                    <option value="mixed">Mixed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[0.8rem] font-semibold text-text-secondary mb-[6px] uppercase tracking-[0.5px]">Difficulty *</label>
                  <select name="setup-difficulty" required className="form-input" defaultValue="Medium">
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                    <option value="Expert">Expert</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[0.8rem] font-semibold text-text-secondary mb-[6px] uppercase tracking-[0.5px]">Number of Questions *</label>
                  <select name="setup-num" required className="form-input" defaultValue="5">
                    <option value="3">3 Questions</option>
                    <option value="5">5 Questions</option>
                    <option value="7">7 Questions</option>
                    <option value="10">10 Questions</option>
                  </select>
                </div>
                <div className="col-span-2 max-md:col-span-1">
                  <label className="block text-[0.8rem] font-semibold text-text-secondary mb-[6px] uppercase tracking-[0.5px]">Topic / Focus Area (optional)</label>
                  <input type="text" name="setup-topic" placeholder="e.g. React, System Design, Leadership" className="form-input" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button type="button" className="btn btn-secondary flex-1" onClick={() => navigate('dashboard')}>← Back</button>
                <button type="submit" className="btn btn-primary flex-[2]">🎙️ Start Interview</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════
           SCREEN 4: INTERVIEW SESSION
           ═══════════════════════════════════════════ */}
      {screen === 'session' && currentInterview && (() => {
        const q = currentInterview.questions[currentQIndex];
        const totalQ = currentInterview.questions.length;
        const progress = (currentQIndex / totalQ) * 100;
        const isLast = currentQIndex >= totalQ - 1;
        return (
          <div className="screen-container">
            <div className="screen-session">
              {/* Proctoring Status Bar */}
              <div className={`proctor-status-bar ${proctorWarnings > 0 ? 'has-warnings' : ''}`}>
                <span className="text-[1.1rem]">🛡️</span>
                <span className={`uppercase tracking-[1px] text-[0.72rem] ${proctorWarnings > 0 ? 'text-accent-amber' : 'text-accent-green'}`}>Proctoring Active</span>
                <span className={`ml-auto font-medium ${proctorWarnings > 0 ? 'text-accent-amber font-bold' : 'text-text-muted'}`}>Warnings: {proctorWarnings} / {MAX_PROCTOR_WARNINGS}</span>
              </div>

              {/* Camera Panel */}
              <div className={`camera-panel glass-card !p-0 ${cameraActive ? 'camera-active' : ''}`}>
                <video ref={videoRef} autoPlay playsInline muted />
                {!cameraActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[rgba(17,17,24,0.95)] rounded-2xl">
                    <div className="text-[2.5rem] opacity-40 mb-2">📷</div>
                    <div className="text-[0.8rem] text-text-muted uppercase tracking-[1px] font-semibold">Camera Off</div>
                  </div>
                )}
                <canvas ref={snapshotCanvasRef} className="hidden" />
                <canvas ref={proctorCanvasRef} className="hidden" />
                <div ref={flashRef} className="snapshot-flash" />
                <div className="absolute bottom-[10px] right-[10px] flex gap-2 z-[4]">
                  <button onClick={takeSnapshot} title="Take Snapshot" className="w-9 h-9 rounded-full border border-white/20 bg-black/50 backdrop-blur-lg text-white text-base cursor-pointer transition-all duration-300 flex items-center justify-center hover:bg-black/70 hover:border-white/40 hover:scale-110">📸</button>
                </div>
              </div>

              {/* Progress */}
              <div className="mb-6">
                <div className="w-full h-[6px] bg-bg-input rounded-[3px] overflow-hidden mb-2">
                  <div className="h-full gradient-bg rounded-[3px] transition-[width] duration-500" style={{ width: `${progress}%` }} />
                </div>
                <div className="text-[0.8rem] text-text-muted text-right">Question {currentQIndex + 1} of {totalQ}</div>
              </div>

              {/* Question Card */}
              <div className="glass-card !p-8 mb-5">
                <div className="text-[0.75rem] text-accent-violet uppercase tracking-[1px] font-bold mb-[10px]">Question {currentQIndex + 1}</div>
                <div className="text-[1.2rem] font-semibold leading-[1.5]">{q?.text || 'Loading...'}</div>
              </div>

              {/* Voice Controls */}
              <div className="flex items-center gap-3 mb-4">
                <button className={`mic-btn ${isRecording ? 'recording' : ''}`} onClick={() => isRecording ? stopVoice() : startVoice()} title="Click to speak">🎤</button>
                <button className="mic-btn" onClick={toggleSpeaker} title={speakerEnabled ? 'Speaker On' : 'Speaker Off'} style={{ borderColor: 'var(--color-accent-cyan)' }}>{speakerEnabled ? '🔈' : '🔇'}</button>
                <button className={`mic-btn ${cameraActive ? 'camera-on' : ''}`} onClick={toggleCamera} title="Toggle Camera" style={{ borderColor: 'var(--color-accent-green)' }}>📹</button>
                <div className="text-[0.85rem] text-text-muted">{isRecording ? '🔴 Listening... Click mic to stop' : 'Click the mic to speak your answer'}</div>
              </div>

              {/* Answer Area */}
              <div className="mb-5">
                <textarea
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  placeholder="Type or speak your answer here..."
                  disabled={feedbackReceived}
                  className="w-full min-h-[140px] resize-y form-input !rounded-xl !p-4 leading-[1.6]"
                />
              </div>

              {/* Feedback */}
              {feedbackData && (
                <div className="glass-card feedback-card">
                  <div className="flex items-center justify-between mb-[14px]">
                    <div>
                      <div className="text-[0.8rem] text-text-muted uppercase tracking-[0.5px] font-semibold">Score</div>
                      <div className="text-[1.8rem] font-extrabold" style={{ color: getScoreColor(feedbackData.score) }}>{feedbackData.score}/100</div>
                    </div>
                  </div>
                  <div className="mb-3">
                    <strong className="text-[0.8rem] uppercase tracking-[0.5px] text-accent-green">✅ Strength</strong>
                    <p className="text-text-secondary text-[0.9rem] mt-1">{feedbackData.positive}</p>
                  </div>
                  <div className="mb-3">
                    <strong className="text-[0.8rem] uppercase tracking-[0.5px] text-accent-amber">💡 Improvement</strong>
                    <p className="text-text-secondary text-[0.9rem] mt-1">{feedbackData.improve}</p>
                  </div>
                  <div className="py-3 px-4 bg-[rgba(124,58,237,0.08)] rounded-lg text-text-primary italic text-[0.9rem] mt-2">&quot;{feedbackData.brief}&quot;</div>
                </div>
              )}

              {/* Session Actions */}
              <div className="flex gap-3 justify-end max-md:flex-col">
                {!feedbackReceived && (
                  <>
                    <button className="btn btn-secondary max-md:w-full" onClick={skipQuestion}>Skip →</button>
                    <button className="btn btn-primary max-md:w-full" onClick={submitAnswer}>Submit Answer →</button>
                  </>
                )}
                {feedbackReceived && !isLast && (
                  <button className="btn btn-primary max-md:w-full" onClick={nextQuestion}>Next Question →</button>
                )}
                {feedbackReceived && isLast && (
                  <button className="btn btn-primary max-md:w-full" onClick={finishInterview}>🏁 Finish & Get Report</button>
                )}
              </div>
            </div>

            {/* Proctoring Warning Modal */}
            {showWarningModal && (
              <div className="proctor-modal-overlay">
                <div className="proctor-warning-card">
                  <div className="text-[3.5rem] mb-3" style={{ animation: 'warningPulse 1.5s ease-in-out infinite' }}>⚠️</div>
                  <h2 className="text-[1.6rem] font-extrabold text-accent-amber mb-[10px]">Warning!</h2>
                  <p className="text-text-primary text-base mb-4 leading-[1.5]">{warningReason}</p>
                  <div className="inline-block bg-[rgba(245,158,11,0.15)] border border-[rgba(245,158,11,0.3)] text-accent-amber font-bold text-[0.85rem] py-[6px] px-4 rounded-[20px] mb-[14px]">Warning {proctorWarnings} of {MAX_PROCTOR_WARNINGS}</div>
                  <p className="text-text-muted text-[0.82rem] mb-5 leading-[1.5]">Further violations will result in automatic termination.</p>
                  <button className="btn btn-primary" onClick={() => setShowWarningModal(false)}>I Understand — Continue</button>
                </div>
              </div>
            )}

            {/* Proctoring Terminated Modal */}
            {showTerminatedModal && (
              <div className="proctor-modal-overlay">
                <div className="proctor-terminated-card">
                  <div className="text-[3.5rem] mb-3">🚫</div>
                  <h2 className="text-[1.6rem] font-extrabold text-accent-rose mb-[10px]">Interview Terminated</h2>
                  <p className="text-text-secondary text-[0.95rem] mb-3 leading-[1.5]">Your interview has been automatically ended due to multiple proctoring violations.</p>
                  <p className="text-text-muted !text-[0.82rem] italic mb-5">Last violation: {terminatedReason}</p>
                  <button className="btn btn-primary" onClick={dismissTerminated}>Return to Dashboard</button>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ═══════════════════════════════════════════
           SCREEN 5: REPORT
           ═══════════════════════════════════════════ */}
      {screen === 'report' && reportData && (() => {
        const report = reportData.report;
        const interview = reportData.interview;
        const qas = reportData.qaBreakdown || [];
        const overallScore = report.overallScore || report.overall_score;
        const grade = report.grade;
        const skills = [
          { name: 'Communication', score: report.communication },
          { name: 'Relevance', score: report.relevance },
          { name: 'Confidence', score: report.confidence },
          { name: 'Structure', score: report.structure },
          { name: 'Depth', score: report.depth },
        ];
        const strengths = Array.isArray(report.strengths) ? report.strengths : JSON.parse(report.strengths || '[]');
        const improvements = Array.isArray(report.improvements) ? report.improvements : JSON.parse(report.improvements || '[]');
        const recommendation = report.recommendation || '';

        return (
          <div className="screen-container">
            <div className="screen-report">
              <div className="text-center mb-8">
                <h2 className="text-[1.6rem] font-bold mb-1">Performance <span className="gradient-text">Report</span></h2>
                <div className="text-text-muted text-[0.85rem]">
                  {interview.jobRole || interview.job_role} · {interview.difficulty || ''} · {interview.interviewType || interview.interview_type || ''}
                </div>
              </div>

              <div className="glass-card text-center !p-10 mb-6">
                <div className="text-[4rem] font-extrabold leading-none" style={{ color: getScoreColor(overallScore) }}>{overallScore}</div>
                <div className="text-[1.1rem] mt-2 font-semibold" style={{ color: getScoreColor(overallScore) }}>{grade}</div>
              </div>

              <div className="glass-card !p-6 mb-6">
                <div className="text-[1.15rem] font-bold flex items-center gap-2 mb-4">📊 Skill Breakdown</div>
                <div className="mb-6">
                  {skills.map((s, i) => (
                    <div key={i} className="mb-[14px]">
                      <div className="flex justify-between text-[0.85rem] mb-[6px]">
                        <span className="font-semibold">{s.name}</span>
                        <span className="text-text-muted">{s.score}/100</span>
                      </div>
                      <div className="skill-bar-track">
                        <div className="skill-bar-fill" style={{ width: `${s.score}%`, background: getScoreColor(s.score) }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6 max-md:grid-cols-1">
                <div className="glass-card !p-5">
                  <h4 className="text-[0.85rem] uppercase tracking-[0.5px] mb-3 flex items-center gap-[6px] text-accent-green font-semibold">💪 Strengths</h4>
                  <ul className="list-none p-0">
                    {strengths.map((s, i) => (
                      <li key={i} className="py-2 border-b border-border-default text-text-secondary text-[0.9rem] flex items-start gap-2 last:border-b-0">
                        <span className="w-[6px] h-[6px] rounded-full bg-accent-green mt-2 shrink-0" />{s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="glass-card !p-5">
                  <h4 className="text-[0.85rem] uppercase tracking-[0.5px] mb-3 flex items-center gap-[6px] text-accent-amber font-semibold">🔧 Areas to Improve</h4>
                  <ul className="list-none p-0">
                    {improvements.map((s, i) => (
                      <li key={i} className="py-2 border-b border-border-default text-text-secondary text-[0.9rem] flex items-start gap-2 last:border-b-0">
                        <span className="w-[6px] h-[6px] rounded-full bg-accent-amber mt-2 shrink-0" />{s}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {recommendation && (
                <div className="glass-card recommendation-card !p-6 mb-6">
                  <h4 className="text-[0.85rem] text-accent-cyan uppercase tracking-[0.5px] mb-2 font-semibold">🎯 Recommendation</h4>
                  <p className="text-text-secondary text-[0.95rem] leading-[1.6]">{recommendation}</p>
                </div>
              )}

              <div className="text-[1.15rem] font-bold flex items-center gap-2 mb-4">📝 Question & Answer Breakdown</div>
              <div className="mb-6">
                {qas.map((qa, i) => (
                  <div key={i} className="glass-card !p-5 mb-3">
                    <div className="font-semibold mb-2 text-[0.95rem]">Q{i + 1}: {qa.question_text}</div>
                    {qa.answer_text ? (
                      <>
                        <div className="text-text-secondary text-[0.9rem] mb-2 pl-3 border-l-2 border-border-default">{qa.answer_text}</div>
                        <div className="flex gap-4 text-[0.8rem] text-text-muted">
                          <span className="font-bold" style={{ color: getScoreColor(qa.score) }}>Score: {qa.score}/100</span>
                          {qa.positive && <span>✅ {qa.positive}</span>}
                        </div>
                      </>
                    ) : (
                      <div className="text-text-muted text-[0.9rem] italic pl-3 border-l-2 border-border-default">— Skipped —</div>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex gap-3 justify-center mt-6 pb-10">
                <button className="btn btn-secondary" onClick={() => navigate('dashboard')}>← Back to Dashboard</button>
                <button className="btn btn-primary" onClick={() => navigate('setup')}>🎙️ New Interview</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
