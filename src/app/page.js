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

    // Resume Analyzer
    const [resumeText, setResumeText] = useState('');
    const [resumeRole, setResumeRole] = useState('');
    const [resumeResult, setResumeResult] = useState(null);
    const [resumeLoading, setResumeLoading] = useState(false);
    const [resumeInputTab, setResumeInputTab] = useState('paste'); // 'upload' | 'paste'
    const [resumeUploading, setResumeUploading] = useState(false);
    const [resumeFileName, setResumeFileName] = useState('');
    const [resumeDragOver, setResumeDragOver] = useState(false);

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
    const objectDetectCanvasRef = useRef(null);
    const flashRef = useRef(null);
    const [cameraActive, setCameraActive] = useState(false);

    // Proctoring
    const [proctorWarnings, setProctorWarnings] = useState(0);
    const MAX_PROCTOR_WARNINGS = 3;
    const proctorActiveRef = useRef(false);
    const proctorCooldownRef = useRef(false);
    const previousFrameRef = useRef(null);
    const faceIntervalRef = useRef(null);
    const faceDetectIntervalRef = useRef(null);
    const faceDetectorRef = useRef(null);
    const cocoModelRef = useRef(null);
    const objectDetectIntervalRef = useRef(null);
    const [showWarningModal, setShowWarningModal] = useState(false);
    const [warningReason, setWarningReason] = useState('');
    const [showTerminatedModal, setShowTerminatedModal] = useState(false);
    const [terminatedReason, setTerminatedReason] = useState('');
    const proctorWarningsRef = useRef(0);

    // Behavior Analysis
    const behaviorDataRef = useRef({
        fillerCounts: {},
        totalFillers: 0,
        highMovementEvents: 0,
        moderateMovementEvents: 0,
        proctorViolations: 0,
        sessionStartTime: null,
    });
    const [behaviorAnalysis, setBehaviorAnalysis] = useState(null);
    const lastSpeechTextRef = useRef('');

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
        const FILLER_WORDS = ['umm', 'um', 'uh', 'hmm', 'hm', 'like', 'you know', 'basically', 'actually'];
        rec.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    const segment = event.results[i][0].transcript;
                    finalT += segment + ' ';
                    // Detect filler words in this new final segment
                    const lower = segment.toLowerCase();
                    FILLER_WORDS.forEach((filler) => {
                        const regex = new RegExp(`\\b${filler.replace(' ', '\\s+')}\\b`, 'gi');
                        const matches = lower.match(regex);
                        if (matches) {
                            const bd = behaviorDataRef.current;
                            bd.fillerCounts[filler] = (bd.fillerCounts[filler] || 0) + matches.length;
                            bd.totalFillers += matches.length;
                        }
                    });
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
        // Reset behavior tracking
        behaviorDataRef.current = {
            fillerCounts: {},
            totalFillers: 0,
            highMovementEvents: 0,
            moderateMovementEvents: 0,
            proctorViolations: 0,
            sessionStartTime: Date.now(),
        };
        lastSpeechTextRef.current = '';

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

        // Motion detection interval (pixel diff)
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
            const changePct = (changed / total) * 100;
            if (changePct > 40) {
                handleProctorViolation('Excessive head movement detected.');
                behaviorDataRef.current.highMovementEvents += 1;
                behaviorDataRef.current.proctorViolations += 1;
            } else if (changePct > 18) {
                behaviorDataRef.current.moderateMovementEvents += 1;
            }
        }, 2000);

        // Multi-person object detection via COCO-SSD (draws red boxes, terminates on >1 person)
        (async () => {
            try {
                if (!cocoModelRef.current) {
                    const cocoSsd = await import('@tensorflow-models/coco-ssd');
                    await import('@tensorflow/tfjs');
                    cocoModelRef.current = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
                }
                objectDetectIntervalRef.current = setInterval(async () => {
                    if (!proctorActiveRef.current || !cameraStreamRef.current) return;
                    const video = videoRef.current;
                    const canvas = objectDetectCanvasRef.current;
                    if (!video || !canvas || !video.videoWidth || video.readyState < 2) return;

                    // Match overlay canvas to video dimensions
                    const vw = video.videoWidth;
                    const vh = video.videoHeight;
                    const displayW = video.clientWidth || vw;
                    const displayH = video.clientHeight || vh;
                    canvas.width = displayW;
                    canvas.height = displayH;

                    const ctx = canvas.getContext('2d');
                    ctx.clearRect(0, 0, displayW, displayH);

                    let predictions;
                    try {
                        predictions = await cocoModelRef.current.detect(video);
                    } catch { return; }

                    // Filter only "person" class
                    const persons = predictions.filter((p) => p.class === 'person');
                    const scaleX = displayW / vw;
                    const scaleY = displayH / vh;

                    // Draw red bounding boxes for each detected person
                    persons.forEach((p) => {
                        const [x, y, w, h] = p.bbox;
                        const sx = x * scaleX;
                        const sy = y * scaleY;
                        const sw = w * scaleX;
                        const sh = h * scaleY;

                        // Box
                        ctx.strokeStyle = '#ef4444';
                        ctx.lineWidth = 2.5;
                        ctx.strokeRect(sx, sy, sw, sh);

                        // Label background
                        const label = `Person (${Math.round(p.score * 100)}%)`;
                        ctx.font = 'bold 11px Inter, sans-serif';
                        const textW = ctx.measureText(label).width;
                        ctx.fillStyle = 'rgba(239,68,68,0.85)';
                        ctx.fillRect(sx, sy - 20, textW + 10, 20);
                        ctx.fillStyle = '#ffffff';
                        ctx.fillText(label, sx + 5, sy - 5);
                    });

                    // Terminate immediately if >1 person detected
                    if (persons.length > 1 && proctorActiveRef.current) {
                        proctorActiveRef.current = false;
                        setTerminatedReason(
                            `Multiple people detected in camera (${persons.length} people). Only the candidate is allowed.`
                        );
                        setShowTerminatedModal(true);
                        speakText('Your interview has been terminated. Multiple people were detected in the camera.');
                    }
                }, 2000);
            } catch (err) {
                console.warn('COCO-SSD object detection unavailable:', err.message);
            }
        })();

        // Store cleanup refs
        window._proctorVisHandler = visHandler;
        window._proctorBlurHandler = blurHandler;
    }, [handleProctorViolation, speakText]);

    const stopProctoring = useCallback(() => {
        if (!proctorActiveRef.current) return;
        proctorActiveRef.current = false;
        if (window._proctorVisHandler) document.removeEventListener('visibilitychange', window._proctorVisHandler);
        if (window._proctorBlurHandler) window.removeEventListener('blur', window._proctorBlurHandler);
        if (faceIntervalRef.current) { clearInterval(faceIntervalRef.current); faceIntervalRef.current = null; }
        if (faceDetectIntervalRef.current) { clearInterval(faceDetectIntervalRef.current); faceDetectIntervalRef.current = null; }
        if (objectDetectIntervalRef.current) { clearInterval(objectDetectIntervalRef.current); objectDetectIntervalRef.current = null; }
        faceDetectorRef.current = null;
        // Clear detection canvas
        if (objectDetectCanvasRef.current) {
            const ctx = objectDetectCanvasRef.current.getContext('2d');
            ctx.clearRect(0, 0, objectDetectCanvasRef.current.width, objectDetectCanvasRef.current.height);
        }
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

    const computeBehaviorAnalysis = () => {
        const bd = behaviorDataRef.current;
        const totalFillers = bd.totalFillers;
        const movementEvents = bd.highMovementEvents + Math.floor(bd.moderateMovementEvents / 3);
        const violations = bd.proctorViolations;

        // Filler Score (0–10)
        let fillerScore;
        if (totalFillers <= 2) fillerScore = 10;
        else if (totalFillers <= 6) fillerScore = 7;
        else if (totalFillers <= 12) fillerScore = 4;
        else fillerScore = 1;

        // Professionalism (1–10)
        const negativeEvents = movementEvents + violations * 2;
        let professionalism;
        if (negativeEvents === 0) professionalism = 10;
        else if (negativeEvents <= 3) professionalism = 8;
        else if (negativeEvents <= 6) professionalism = 6;
        else if (negativeEvents <= 10) professionalism = 4;
        else professionalism = 2;

        // Confidence Rating
        let confidenceRating;
        if (fillerScore >= 7 && professionalism >= 7) confidenceRating = 'High';
        else if (fillerScore >= 4 || professionalism >= 5) confidenceRating = 'Medium';
        else confidenceRating = 'Low';

        // Filler label
        let fillerLabel;
        if (totalFillers <= 2) fillerLabel = 'Excellent';
        else if (totalFillers <= 6) fillerLabel = 'Good';
        else if (totalFillers <= 12) fillerLabel = 'Moderate Nervousness';
        else fillerLabel = 'High Nervousness';

        // Detected Nervous Behaviors
        const nervousBehaviors = [];
        if (totalFillers > 2) nervousBehaviors.push(`Frequent filler words detected (${totalFillers} total)`);
        if (bd.highMovementEvents > 0) nervousBehaviors.push(`Excessive body/head movement (${bd.highMovementEvents} instance${bd.highMovementEvents > 1 ? 's' : ''})`);
        if (bd.moderateMovementEvents > 2) nervousBehaviors.push(`Repeated posture shifts during responses (${bd.moderateMovementEvents} occurrences)`);
        if (violations > 0) nervousBehaviors.push(`Proctoring violations triggered (${violations})`);
        if (nervousBehaviors.length === 0) nervousBehaviors.push('No significant nervous behaviors detected ✅');

        // Posture Observations
        const postureObs = [];
        if (bd.highMovementEvents === 0 && bd.moderateMovementEvents <= 2) {
            postureObs.push('Maintained a stable and upright posture throughout the session');
            postureObs.push('Minimal unnecessary movement observed — strong attentiveness');
        } else if (bd.highMovementEvents > 0) {
            postureObs.push('Excessive head or body movement detected at times');
            postureObs.push('Consider maintaining a steady, upright seated position');
        } else {
            postureObs.push('Some posture shifts noticed — likely due to nervousness');
            postureObs.push('Try consciously relaxing shoulders and keeping gaze forward');
        }
        if (violations > 0) postureObs.push('Movement triggered proctoring alerts — review camera placement');

        // Improvement Suggestions
        const suggestions = [];
        if (fillerScore < 7) suggestions.push('Practice pausing silently instead of using filler words like "umm" or "uh"');
        if (professionalism < 7) suggestions.push('Work on maintaining a still, upright posture — try practicing in front of a mirror');
        if (confidenceRating === 'Low' || confidenceRating === 'Medium') suggestions.push('Record yourself answering questions and review for body language cues');
        suggestions.push('Take a slow breath before answering each question to center yourself');
        if (violations > 0) suggestions.push('Ensure your face stays clearly visible on camera throughout the interview');
        if (suggestions.length < 3) suggestions.push('Maintain consistent eye contact with the camera to project confidence');

        // Top filler words
        const topFillers = Object.entries(bd.fillerCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

        return {
            confidenceRating,
            professionalism,
            fillerScore,
            fillerLabel,
            totalFillers,
            topFillers,
            nervousBehaviors,
            postureObs,
            suggestions,
        };
    };

    const finishInterview = async () => {
        showLoading('Completing interview and generating your report...');
        try {
            await api(`/interview/${currentInterview.id}/complete`, { method: 'PATCH' });
            const data = await api(`/report/generate/${currentInterview.id}`, { method: 'POST' });
            const behavior = computeBehaviorAnalysis();
            setBehaviorAnalysis(behavior);
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
                <nav className="navbar">
                    <div className="navbar-logo">VoiceHire</div>
                    <div className="navbar-nav">
                        <button onClick={() => navigate('dashboard')} className={`nav-btn ${screen === 'dashboard' ? 'active' : ''}`}>
                            📊 Dashboard
                        </button>
                        <button onClick={() => navigate('setup')} className={`nav-btn ${screen === 'setup' ? 'active' : ''}`}>
                            🎙️ New Interview
                        </button>
                        <button onClick={() => { setResumeResult(null); setResumeText(''); setResumeRole(''); navigate('resume'); }} className={`nav-btn ${screen === 'resume' ? 'active' : ''}`}>
                            📄 Resume Analyzer
                        </button>
                    </div>
                    <div className="navbar-user">
                        <div className="user-avatar">{(user?.name || 'U').charAt(0).toUpperCase()}</div>
                        <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>{user?.name || 'User'}</span>
                        <button className="btn btn-ghost btn-sm" onClick={doLogout}>Sign out</button>
                    </div>
                </nav>
            )}

            {/* ═══ Loading Overlay ═══ */}
            {loadingText && (
                <div className="loading-overlay">
                    <div className="spinner" />
                    <div className="loading-text">{loadingText}</div>
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
                <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'stretch' }}>
                    {/* Left panel — brand */}
                    <div style={{
                        flex: '1', display: 'flex', flexDirection: 'column', justifyContent: 'center',
                        padding: '60px 56px', background: 'linear-gradient(160deg,rgba(139,92,246,0.15) 0%,rgba(34,211,238,0.06) 100%)',
                        borderRight: '1px solid var(--color-border-subtle)',
                        minWidth: '0',
                    }} className="max-md:hidden">
                        <div style={{ marginBottom: '48px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                                <div style={{
                                    width: '48px', height: '48px', borderRadius: '14px',
                                    background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center',
                                    justifyContent: 'center', fontSize: '1.5rem', fontWeight: '900', color: '#fff',
                                    boxShadow: '0 8px 24px rgba(139,92,246,0.4)',
                                }}>V</div>
                                <span style={{ fontSize: '1.8rem', fontWeight: '800', letterSpacing: '-0.5px', background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>VoiceHire</span>
                            </div>
                            <p style={{ fontSize: '1.1rem', color: 'var(--color-text-secondary)', lineHeight: '1.6', maxWidth: '360px' }}>
                                The AI-powered mock interview platform that helps you land your dream job.
                            </p>
                        </div>

                        {[
                            { icon: '🎙️', title: 'Voice-enabled answering', desc: 'Speak naturally — our AI listens and transcribes in real time' },
                            { icon: '🧠', title: 'Instant AI feedback', desc: 'Get scored on communication, relevance, confidence & depth' },
                            { icon: '🛡️', title: 'Proctored sessions', desc: 'Realistic exam conditions with smart monitoring' },
                            { icon: '📊', title: 'Detailed performance reports', desc: 'Track improvement across sessions with visual breakdowns' },
                        ].map((f, i) => (
                            <div key={i} style={{ display: 'flex', gap: '16px', marginBottom: '24px', alignItems: 'flex-start' }}>
                                <div style={{
                                    width: '40px', height: '40px', borderRadius: '10px', flexShrink: '0',
                                    background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem'
                                }}>{f.icon}</div>
                                <div>
                                    <div style={{ fontWeight: '600', fontSize: '0.9rem', marginBottom: '3px' }}>{f.title}</div>
                                    <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', lineHeight: '1.5' }}>{f.desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Right panel — form */}
                    <div style={{
                        width: '440px', flexShrink: '0', display: 'flex', flexDirection: 'column',
                        justifyContent: 'center', padding: '60px 48px',
                    }} className="max-md:w-full max-md:p-8">
                        <div style={{ marginBottom: '32px' }}>
                            <h1 style={{ fontSize: '1.6rem', fontWeight: '800', letterSpacing: '-0.3px', marginBottom: '6px' }}>
                                {authTab === 'login' ? 'Welcome back' : 'Create your account'}
                            </h1>
                            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                                {authTab === 'login' ? 'Sign in to continue your interview prep' : 'Start your AI-powered interview practice today'}
                            </p>
                        </div>

                        <div className="auth-tab-bar" style={{ marginBottom: '28px' }}>
                            <button onClick={() => setAuthTab('login')} className={`auth-tab ${authTab === 'login' ? 'active' : ''}`}>Sign In</button>
                            <button onClick={() => setAuthTab('register')} className={`auth-tab ${authTab === 'register' ? 'active' : ''}`}>Register</button>
                        </div>

                        {authTab === 'login' ? (
                            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                                <div className="form-group">
                                    <label className="form-label">Email address</label>
                                    <input type="email" name="login-email" placeholder="you@company.com" required className="form-input" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Password</label>
                                    <input type="password" name="login-password" placeholder="Enter your password" required className="form-input" />
                                </div>
                                <button type="submit" className="btn btn-primary btn-lg" style={{ marginTop: '4px', width: '100%' }}>
                                    Sign In →
                                </button>
                            </form>
                        ) : (
                            <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                                <div className="form-group">
                                    <label className="form-label">Full name</label>
                                    <input type="text" name="reg-name" placeholder="Jane Smith" required minLength={2} className="form-input" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Email address</label>
                                    <input type="email" name="reg-email" placeholder="you@company.com" required className="form-input" />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Password</label>
                                    <input type="password" name="reg-password" placeholder="Minimum 6 characters" required minLength={6} className="form-input" />
                                </div>
                                <button type="submit" className="btn btn-primary btn-lg" style={{ marginTop: '4px', width: '100%' }}>
                                    Create Account →
                                </button>
                            </form>
                        )}

                        <p style={{ marginTop: '24px', fontSize: '0.78rem', color: 'var(--color-text-muted)', textAlign: 'center' }}>
                            By continuing, you agree to our Terms of Service and Privacy Policy.
                        </p>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════
               SCREEN 2: DASHBOARD
               ═══════════════════════════════════════════ */}
            {screen === 'dashboard' && (
                <div className="screen-container">
                    <div className="screen-dashboard">
                        {/* Hero header */}
                        <div style={{ padding: '32px 0 28px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '16px' }}>
                            <div>
                                <div style={{ fontSize: '0.72rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '6px' }}>
                                    {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                                </div>
                                <h1 style={{ fontSize: '1.9rem', fontWeight: '800', letterSpacing: '-0.5px', lineHeight: '1.15', marginBottom: '6px' }}>
                                    Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'},{' '}
                                    <span className="gradient-text">{user?.name?.split(' ')[0] || 'there'}</span> 👋
                                </h1>
                                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
                                    {interviews.length === 0 ? "Ready to start your interview preparation?" : `You've completed ${completed} of ${total} interview sessions.`}
                                </p>
                            </div>
                            <button className="btn btn-primary" style={{ flexShrink: '0' }} onClick={() => navigate('setup')}>
                                + New Interview
                            </button>
                        </div>

                        {/* Stats grid */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: '12px', marginBottom: '32px' }} className="max-md:grid-cols-2">
                            {[
                                { val: total, label: 'Total Sessions', icon: '📁', color: 'var(--color-accent-violet)' },
                                { val: completed, label: 'Completed', icon: '✅', color: 'var(--color-accent-green)' },
                                { val: avg !== null ? avg : '—', label: 'Avg Score', icon: '📈', color: 'var(--color-accent-cyan)' },
                                { val: bestGrade || '—', label: 'Best Grade', icon: '🏆', color: 'var(--color-accent-amber)' },
                            ].map((s, i) => (
                                <div key={i} className="glass-card" style={{ padding: '20px', textAlign: 'center', borderTop: `2px solid ${s.color}22` }}>
                                    <div style={{ fontSize: '1.4rem', marginBottom: '8px' }}>{s.icon}</div>
                                    <div style={{ fontSize: '1.8rem', fontWeight: '800', letterSpacing: '-0.04em', color: s.color, lineHeight: '1' }}>{s.val}</div>
                                    <div style={{ fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginTop: '6px' }}>{s.label}</div>
                                </div>
                            ))}
                        </div>

                        {/* History section */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <div>
                                <div style={{ fontSize: '0.68rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '2px' }}>History</div>
                                <div style={{ fontSize: '1.1rem', fontWeight: '700' }}>Recent Sessions</div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {interviews.length === 0 ? (
                                <div className="glass-card" style={{ padding: '64px 24px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '3rem', marginBottom: '12px', opacity: '0.25' }}>🎙️</div>
                                    <div style={{ fontWeight: '600', fontSize: '1rem', marginBottom: '6px' }}>No interviews yet</div>
                                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginBottom: '20px' }}>Start your first mock interview to track your progress</div>
                                    <button className="btn btn-primary" onClick={() => navigate('setup')}>Start your first interview →</button>
                                </div>
                            ) : (
                                interviews.map((iv) => (
                                    <div key={iv.id || iv._id} className="interview-row" onClick={() => viewInterview(iv.id || iv._id, iv.status)}>
                                        <div style={{ flex: '1', minWidth: '0' }}>
                                            <div style={{ fontWeight: '600', fontSize: '0.975rem', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{iv.job_role}</div>
                                            <div style={{ display: 'flex', gap: '10px', fontSize: '0.775rem', color: 'var(--color-text-muted)', flexWrap: 'wrap', alignItems: 'center' }}>
                                                <span style={{ textTransform: 'capitalize' }}>{iv.interview_type}</span>
                                                <span style={{ opacity: '0.4' }}>·</span>
                                                <span>{iv.num_questions} questions</span>
                                                <span style={{ opacity: '0.4' }}>·</span>
                                                <span>{new Date(iv.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: '0' }}>
                                            <span className={`badge badge-${iv.difficulty.toLowerCase()}`}>{iv.difficulty}</span>
                                            <span className={`badge ${iv.status === 'completed' ? 'badge-completed' : 'badge-in-progress'}`}>
                                                {iv.status === 'completed' ? '✓ Done' : '⏳ In Progress'}
                                            </span>
                                            {iv.overall_score && (
                                                <div className={`score-circle ${getScoreClass(iv.overall_score)}`}>{iv.overall_score}</div>
                                            )}
                                            <span style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', opacity: '0.5' }}>›</span>
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
                        <div style={{ textAlign: 'center', marginBottom: '32px', padding: '8px 0' }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-accent-violet)', marginBottom: '8px' }}>Configure</div>
                            <h2 style={{ fontSize: '1.75rem', fontWeight: '800', letterSpacing: '-0.3px', marginBottom: '8px' }}>
                                Set up your <span className="gradient-text">Interview</span>
                            </h2>
                            <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Customize your session to match your target role and prep needs.</p>
                        </div>

                        <form className="glass-card" style={{ padding: '36px' }} onSubmit={handleStartInterview}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div className="form-group">
                                    <label className="form-label">Job Role / Department <span style={{ color: 'var(--color-accent-rose)' }}>*</span></label>
                                    <input list="job-roles" type="text" name="setup-role" placeholder="e.g. Software Engineer, VLSI Engineer, Structural Engineer..." required className="form-input" style={{ fontSize: '0.95rem' }} />
                                    <datalist id="job-roles">
                                        {/* CSE / IT */}
                                        <option value="Software Engineer (CSE)" />
                                        <option value="Frontend Developer (CSE)" />
                                        <option value="Backend Developer (CSE)" />
                                        <option value="Full Stack Developer (CSE)" />
                                        <option value="Data Scientist (CSE)" />
                                        <option value="AI/ML Engineer (CSE)" />
                                        <option value="Cybersecurity Analyst (CSE)" />
                                        <option value="Information Technology (IT)" />
                                        {/* ECE */}
                                        <option value="Embedded Systems Engineer (ECE)" />
                                        <option value="VLSI Design Engineer (ECE)" />
                                        <option value="Telecommunications Engineer (ECE)" />
                                        <option value="Network Engineer (ECE)" />
                                        <option value="Electronics and Communication (ECE)" />
                                        {/* EEE */}
                                        <option value="Power Systems Engineer (EEE)" />
                                        <option value="Control Systems Engineer (EEE)" />
                                        <option value="Electrical Design Engineer (EEE)" />
                                        <option value="Renewable Energy Engineer (EEE)" />
                                        <option value="Electrical and Electronics (EEE)" />
                                        {/* Mechanical */}
                                        <option value="Mechanical Design Engineer (Mech)" />
                                        <option value="Thermal Engineer (Mech)" />
                                        <option value="Manufacturing Engineer (Mech)" />
                                        <option value="Automotive Engineer (Mech)" />
                                        <option value="Robotics Engineer (Mech)" />
                                        <option value="Mechanical Engineering" />
                                        {/* Civil */}
                                        <option value="Structural Engineer (Civil)" />
                                        <option value="Construction Manager (Civil)" />
                                        <option value="Geotechnical Engineer (Civil)" />
                                        <option value="Transportation Engineer (Civil)" />
                                        <option value="Environmental Engineer (Civil)" />
                                        <option value="Civil Engineering" />
                                        {/* General/Other */}
                                        <option value="Product Manager" />
                                        <option value="Business Analyst" />
                                        <option value="Data Analyst" />
                                        <option value="HR Manager" />
                                    </datalist>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }} className="max-sm:grid-cols-1">
                                    <div className="form-group">
                                        <label className="form-label">Experience Level</label>
                                        <select name="setup-experience" className="form-input">
                                            <option value="">Select level</option>
                                            <option>Fresher (0–1 yr)</option>
                                            <option>Junior (1–3 yrs)</option>
                                            <option>Mid-level (3–6 yrs)</option>
                                            <option>Senior (6–10 yrs)</option>
                                            <option>Lead / Staff (10+ yrs)</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Interview Type <span style={{ color: 'var(--color-accent-rose)' }}>*</span></label>
                                        <select name="setup-type" required className="form-input">
                                            <option value="behavioral">🧠 Behavioral</option>
                                            <option value="technical">💻 Technical</option>
                                            <option value="situational">🎯 Situational</option>
                                            <option value="mixed">🔀 Mixed</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Difficulty <span style={{ color: 'var(--color-accent-rose)' }}>*</span></label>
                                        <select name="setup-difficulty" required className="form-input" defaultValue="Medium">
                                            <option value="Easy">🟢 Easy</option>
                                            <option value="Medium">🟡 Medium</option>
                                            <option value="Hard">🟠 Hard</option>
                                            <option value="Expert">🔴 Expert</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Questions <span style={{ color: 'var(--color-accent-rose)' }}>*</span></label>
                                        <select name="setup-num" required className="form-input" defaultValue="5">
                                            <option value="3">3 Questions (~10 min)</option>
                                            <option value="5">5 Questions (~20 min)</option>
                                            <option value="7">7 Questions (~30 min)</option>
                                            <option value="10">10 Questions (~45 min)</option>
                                        </select>
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Focus Topic <span style={{ color: 'var(--color-text-muted)', fontWeight: '400', textTransform: 'none', letterSpacing: '0' }}>— optional</span></label>
                                    <input type="text" name="setup-topic" placeholder="e.g. React, System Design, Leadership, Communication" className="form-input" />
                                </div>
                            </div>

                            {/* Info strip */}
                            <div style={{
                                marginTop: '24px', padding: '14px 16px',
                                background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)',
                                borderRadius: '10px', fontSize: '0.8rem', color: 'var(--color-text-muted)',
                                display: 'flex', alignItems: 'center', gap: '10px',
                            }}>
                                <span style={{ fontSize: '1rem' }}>💡</span>
                                AI-generated questions are tailored to your role, level, and type. Camera and proctoring activate automatically.
                            </div>

                            <div style={{ display: 'flex', gap: '12px', marginTop: '28px' }}>
                                <button type="button" className="btn btn-secondary" style={{ flex: '1' }} onClick={() => navigate('dashboard')}>← Back</button>
                                <button type="submit" className="btn btn-primary" style={{ flex: '2' }}>🎙️ Generate & Start Interview</button>
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
                    <div className="screen-container" style={{ paddingTop: '20px' }}>
                        <div style={{ maxWidth: '860px', margin: '0 auto' }}>

                            {/* Top bar — proctor + progress */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px', flexWrap: 'wrap' }}>
                                <div className={`proctor-status-bar ${proctorWarnings > 0 ? 'has-warnings' : ''}`} style={{ flex: '1', margin: '0' }}>
                                    <span>🛡️</span>
                                    <span style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em', color: proctorWarnings > 0 ? 'var(--color-accent-amber)' : 'var(--color-accent-green)' }}>
                                        Proctoring Active
                                    </span>
                                    <span style={{ marginLeft: 'auto', fontSize: '0.8rem', fontWeight: '600', color: proctorWarnings > 0 ? 'var(--color-accent-amber)' : 'var(--color-text-muted)' }}>
                                        {proctorWarnings}/{MAX_PROCTOR_WARNINGS} warnings
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                                    Q {currentQIndex + 1}/{totalQ}
                                </div>
                            </div>

                            {/* Progress bar */}
                            <div style={{ marginBottom: '24px' }}>
                                <div className="progress-bar-track">
                                    <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                                </div>
                            </div>

                            {/* Two-column layout */}
                            <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '20px', alignItems: 'start' }} className="max-md:grid-cols-1">

                                {/* Left column — camera + controls */}
                                <div>
                                    {/* Camera */}
                                    <div className={`camera-panel ${cameraActive ? 'camera-active' : ''}`} style={{ maxWidth: 'none', marginBottom: '12px', aspectRatio: '4/3' }}>
                                        <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit', display: 'block' }} />
                                        <canvas ref={objectDetectCanvasRef} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 3, borderRadius: 'inherit' }} />
                                        {!cameraActive && (
                                            <div style={{ position: 'absolute', inset: '0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(10,10,15,0.9)', borderRadius: 'inherit' }}>
                                                <div style={{ fontSize: '2rem', opacity: '0.3', marginBottom: '6px' }}>📷</div>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Camera Off</div>
                                            </div>
                                        )}
                                        <canvas ref={snapshotCanvasRef} style={{ display: 'none' }} />
                                        <canvas ref={proctorCanvasRef} style={{ display: 'none' }} />
                                        <div ref={flashRef} className="snapshot-flash" />
                                        <div style={{ position: 'absolute', bottom: '8px', right: '8px', zIndex: 4 }}>
                                            <button onClick={takeSnapshot} title="Snapshot" style={{ width: '32px', height: '32px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', color: '#fff', fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>📸</button>
                                        </div>
                                    </div>

                                    {/* Control buttons */}
                                    <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '12px' }}>
                                        <button className={`mic-btn ${isRecording ? 'recording' : ''}`} onClick={() => isRecording ? stopVoice() : startVoice()} title="Microphone" style={{ width: '44px', height: '44px', fontSize: '1.1rem' }}>🎤</button>
                                        <button className="mic-btn" onClick={toggleSpeaker} title="Speaker" style={{ width: '44px', height: '44px', fontSize: '1.1rem', borderColor: 'var(--color-accent-cyan)' }}>{speakerEnabled ? '🔈' : '🔇'}</button>
                                        <button className={`mic-btn ${cameraActive ? 'camera-on' : ''}`} onClick={toggleCamera} title="Camera" style={{ width: '44px', height: '44px', fontSize: '1.1rem', borderColor: 'var(--color-accent-green)' }}>📹</button>
                                    </div>

                                    {/* Mic status */}
                                    <div style={{ textAlign: 'center', fontSize: '0.75rem', color: isRecording ? 'var(--color-accent-rose)' : 'var(--color-text-muted)', fontWeight: '500' }}>
                                        {isRecording ? '● Listening...' : 'Click mic to speak'}
                                    </div>

                                    {/* Question list navigation */}
                                    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        {currentInterview.questions.map((qq, i) => (
                                            <div key={i} style={{
                                                padding: '6px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '500',
                                                display: 'flex', alignItems: 'center', gap: '6px',
                                                background: i === currentQIndex ? 'rgba(139,92,246,0.15)' : 'transparent',
                                                color: i === currentQIndex ? 'var(--color-accent-violet)' : qq.answered ? 'var(--color-accent-green)' : 'var(--color-text-muted)',
                                                border: i === currentQIndex ? '1px solid rgba(139,92,246,0.2)' : '1px solid transparent',
                                            }}>
                                                <span style={{
                                                    width: '18px', height: '18px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: '700', flexShrink: '0',
                                                    background: qq.answered ? 'var(--color-accent-green-dim)' : i === currentQIndex ? 'var(--color-accent-violet-dim)' : 'var(--color-border-subtle)',
                                                    color: qq.answered ? 'var(--color-accent-green)' : i === currentQIndex ? 'var(--color-accent-violet)' : 'var(--color-text-muted)',
                                                }}>{qq.answered ? '✓' : i + 1}</span>
                                                Q{i + 1}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Right column — question + answer */}
                                <div>
                                    {/* Question card */}
                                    <div className="glass-card glass-card-accent" style={{ padding: '28px 30px', marginBottom: '16px' }}>
                                        <div className="question-number-badge" style={{ marginBottom: '14px' }}>Question {currentQIndex + 1} of {totalQ}</div>
                                        <div style={{ fontSize: '1.15rem', fontWeight: '600', lineHeight: '1.65', color: 'var(--color-text-primary)' }}>{q?.text || 'Loading question...'}</div>
                                    </div>

                                    {/* Answer textarea */}
                                    <div style={{ marginBottom: '16px' }}>
                                        <label style={{ fontSize: '0.72rem', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)', display: 'block', marginBottom: '8px' }}>Your Answer</label>
                                        <textarea
                                            value={answerText}
                                            onChange={(e) => setAnswerText(e.target.value)}
                                            placeholder="Type your answer here, or click the 🎤 mic button to speak..."
                                            disabled={feedbackReceived}
                                            className="form-input"
                                            style={{ minHeight: '130px', resize: 'vertical', lineHeight: '1.65', borderRadius: '12px', padding: '14px 16px', fontFamily: 'inherit' }}
                                        />
                                        <div style={{ textAlign: 'right', fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                                            {answerText.trim().split(/\s+/).filter(Boolean).length} words
                                        </div>
                                    </div>

                                    {/* AI Feedback */}
                                    {feedbackData && (
                                        <div className="feedback-card glass-card" style={{ marginBottom: '16px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px', paddingBottom: '16px', borderBottom: '1px solid var(--color-border-subtle)' }}>
                                                <div>
                                                    <div style={{ fontSize: '0.68rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '4px' }}>AI Score</div>
                                                    <div style={{ fontSize: '2rem', fontWeight: '800', letterSpacing: '-0.04em', color: getScoreColor(feedbackData.score), lineHeight: '1' }}>{feedbackData.score}<span style={{ fontSize: '1rem', fontWeight: '400', color: 'var(--color-text-muted)' }}>/100</span></div>
                                                </div>
                                                <div style={{ flex: '1' }}>
                                                    <div className="progress-bar-track">
                                                        <div className="progress-bar-fill" style={{ width: `${feedbackData.score}%`, background: getScoreColor(feedbackData.score) }} />
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                                <div style={{ padding: '10px 12px', background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)', borderRadius: '8px' }}>
                                                    <div style={{ fontSize: '0.68rem', fontWeight: '700', color: 'var(--color-accent-green)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>✅ Strength</div>
                                                    <div style={{ fontSize: '0.83rem', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>{feedbackData.positive}</div>
                                                </div>
                                                <div style={{ padding: '10px 12px', background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.15)', borderRadius: '8px' }}>
                                                    <div style={{ fontSize: '0.68rem', fontWeight: '700', color: 'var(--color-accent-amber)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>💡 Improve</div>
                                                    <div style={{ fontSize: '0.83rem', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>{feedbackData.improve}</div>
                                                </div>
                                            </div>
                                            <div style={{ padding: '10px 14px', background: 'rgba(139,92,246,0.07)', borderRadius: '8px', fontSize: '0.85rem', color: 'var(--color-text-secondary)', fontStyle: 'italic', lineHeight: '1.5' }}>
                                                &ldquo;{feedbackData.brief}&rdquo;
                                            </div>
                                        </div>
                                    )}

                                    {/* Action buttons */}
                                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                        {!feedbackReceived && (
                                            <>
                                                <button className="btn btn-ghost" onClick={skipQuestion}>Skip →</button>
                                                <button className="btn btn-primary" onClick={submitAnswer}>Submit Answer →</button>
                                            </>
                                        )}
                                        {feedbackReceived && !isLast && (
                                            <button className="btn btn-primary" onClick={nextQuestion}>Next Question →</button>
                                        )}
                                        {feedbackReceived && isLast && (
                                            <button className="btn btn-primary" style={{ background: 'linear-gradient(135deg,#34d399,#22d3ee)' }} onClick={finishInterview}>
                                                🏁 Finish & Get Report
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Warning Modal */}
                        {showWarningModal && (
                            <div className="proctor-modal-overlay">
                                <div className="proctor-warning-card">
                                    <div style={{ fontSize: '3rem', marginBottom: '12px', animation: 'warningPulse 1.5s ease-in-out infinite' }}>⚠️</div>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--color-accent-amber)', marginBottom: '8px' }}>Proctoring Warning</h2>
                                    <p style={{ color: 'var(--color-text-secondary)', lineHeight: '1.6', marginBottom: '14px' }}>{warningReason}</p>
                                    <div style={{ display: 'inline-block', background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', color: 'var(--color-accent-amber)', fontWeight: '700', fontSize: '0.82rem', padding: '5px 14px', borderRadius: '20px', marginBottom: '16px' }}>
                                        Warning {proctorWarnings} of {MAX_PROCTOR_WARNINGS}
                                    </div>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '20px' }}>Further violations will result in automatic termination of the interview.</p>
                                    <button className="btn btn-primary" onClick={() => setShowWarningModal(false)}>I Understand — Continue</button>
                                </div>
                            </div>
                        )}

                        {/* Terminated Modal */}
                        {showTerminatedModal && (
                            <div className="proctor-modal-overlay">
                                <div className="proctor-terminated-card">
                                    <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🚫</div>
                                    <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--color-accent-rose)', marginBottom: '8px' }}>Interview Terminated</h2>
                                    <p style={{ color: 'var(--color-text-secondary)', lineHeight: '1.6', marginBottom: '8px' }}>Your session was ended automatically due to repeated proctoring violations.</p>
                                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontStyle: 'italic', marginBottom: '24px' }}>Reason: {terminatedReason}</p>
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
                    { name: 'Communication', score: report.communication, icon: '💬' },
                    { name: 'Relevance', score: report.relevance, icon: '🎯' },
                    { name: 'Confidence', score: report.confidence, icon: '💪' },
                    { name: 'Structure', score: report.structure, icon: '🏗️' },
                    { name: 'Depth', score: report.depth, icon: '🔬' },
                ];
                const strengths = Array.isArray(report.strengths) ? report.strengths : JSON.parse(report.strengths || '[]');
                const improvements = Array.isArray(report.improvements) ? report.improvements : JSON.parse(report.improvements || '[]');
                const recommendation = report.recommendation || '';

                return (
                    <div className="screen-container">
                        <div className="screen-report">
                            {/* Hero score banner */}
                            <div className="glass-card glass-card-elevated" style={{
                                padding: '40px', marginBottom: '24px',
                                background: 'linear-gradient(135deg,rgba(139,92,246,0.08),rgba(34,211,238,0.04))',
                                border: '1px solid rgba(139,92,246,0.2)',
                                display: 'flex', alignItems: 'center', gap: '36px', flexWrap: 'wrap',
                            }}>
                                <div style={{ textAlign: 'center', minWidth: '120px' }}>
                                    <div style={{
                                        width: '100px', height: '100px', borderRadius: '50%', margin: '0 auto 12px',
                                        background: `conic-gradient(${getScoreColor(overallScore)} ${overallScore * 3.6}deg, rgba(255,255,255,0.05) 0deg)`,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        boxShadow: `0 0 40px ${getScoreColor(overallScore)}33`,
                                        position: 'relative',
                                    }}>
                                        <div style={{
                                            width: '80px', height: '80px', borderRadius: '50%',
                                            background: 'var(--color-bg-secondary)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        }}>
                                            <span style={{ fontSize: '1.6rem', fontWeight: '800', color: getScoreColor(overallScore), letterSpacing: '-0.04em' }}>{overallScore}</span>
                                        </div>
                                    </div>
                                    <div style={{ fontSize: '1.1rem', fontWeight: '700', color: getScoreColor(overallScore) }}>{grade}</div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: '2px' }}>Overall Score</div>
                                </div>
                                <div style={{ flex: '1', minWidth: '200px' }}>
                                    <div style={{ fontSize: '0.72rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '6px' }}>Performance Report</div>
                                    <h2 style={{ fontSize: '1.4rem', fontWeight: '800', marginBottom: '6px', letterSpacing: '-0.3px' }}>
                                        {interview.jobRole || interview.job_role}
                                    </h2>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        <span className={`badge badge-${(interview.difficulty || '').toLowerCase()}`}>{interview.difficulty}</span>
                                        <span className="badge badge-in-progress" style={{ textTransform: 'capitalize' }}>{interview.interviewType || interview.interview_type}</span>
                                    </div>
                                    <div style={{ marginTop: '16px', fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>
                                        {qas.length} questions answered · {new Date(interview.started_at || Date.now()).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                    </div>
                                </div>
                            </div>

                            {/* Skill breakdown */}
                            <div className="glass-card" style={{ padding: '28px', marginBottom: '20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                                    <div style={{ fontSize: '1.1rem' }}>📊</div>
                                    <div style={{ fontWeight: '700', fontSize: '1rem' }}>Skill Breakdown</div>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    {skills.map((s, i) => (
                                        <div key={i}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '600', fontSize: '0.875rem' }}>
                                                    <span>{s.icon}</span>{s.name}
                                                </span>
                                                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: getScoreColor(s.score) }}>{s.score}/100</span>
                                            </div>
                                            <div className="skill-bar-track">
                                                <div className="skill-bar-fill" style={{ width: `${s.score}%`, background: `linear-gradient(90deg,${getScoreColor(s.score)}99,${getScoreColor(s.score)})` }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Strengths / Improvements */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }} className="max-md:grid-cols-1">
                                <div className="glass-card" style={{ padding: '24px', borderTop: '2px solid rgba(52,211,153,0.3)' }}>
                                    <div style={{ fontSize: '0.72rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-accent-green)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        💪 Strengths
                                    </div>
                                    <ul style={{ listStyle: 'none', padding: '0', margin: '0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {strengths.map((s, i) => (
                                            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
                                                <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--color-accent-green-dim)', border: '1px solid rgba(52,211,153,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: 'var(--color-accent-green)', flexShrink: '0', marginTop: '1px', fontWeight: '700' }}>✓</span>
                                                {s}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                                <div className="glass-card" style={{ padding: '24px', borderTop: '2px solid rgba(251,191,36,0.3)' }}>
                                    <div style={{ fontSize: '0.72rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-accent-amber)', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        🔧 Areas to Improve
                                    </div>
                                    <ul style={{ listStyle: 'none', padding: '0', margin: '0', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {improvements.map((s, i) => (
                                            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
                                                <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'var(--color-accent-amber-dim)', border: '1px solid rgba(251,191,36,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', color: 'var(--color-accent-amber)', flexShrink: '0', marginTop: '1px' }}>→</span>
                                                {s}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>

                            {/* Recommendation */}
                            {recommendation && (
                                <div className="glass-card recommendation-card" style={{ padding: '24px', marginBottom: '20px' }}>
                                    <div style={{ fontSize: '0.72rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-accent-cyan)', marginBottom: '10px' }}>🎯 AI Recommendation</div>
                                    <p style={{ color: 'var(--color-text-secondary)', lineHeight: '1.7', fontSize: '0.9rem' }}>{recommendation}</p>
                                </div>
                            )}

                            {/* Q&A Breakdown */}
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                    <span style={{ fontSize: '1.1rem' }}>📝</span>
                                    <span style={{ fontWeight: '700', fontSize: '1rem' }}>Question & Answer Breakdown</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {qas.map((qa, i) => (
                                        <div key={i} className="glass-card" style={{ padding: '20px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '10px' }}>
                                                <div style={{ fontWeight: '600', fontSize: '0.9rem', lineHeight: '1.5', flex: '1' }}>
                                                    <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', fontWeight: '700', marginRight: '6px' }}>Q{i + 1}</span>
                                                    {qa.question_text}
                                                </div>
                                                {qa.score && <div className={`score-circle ${getScoreClass(qa.score)}`} style={{ width: '40px', height: '40px', fontSize: '0.78rem' }}>{qa.score}</div>}
                                            </div>
                                            {qa.answer_text ? (
                                                <div style={{ paddingLeft: '12px', borderLeft: '2px solid var(--color-border-default)' }}>
                                                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', lineHeight: '1.6', marginBottom: '8px' }}>{qa.answer_text}</div>
                                                    {qa.positive && <div style={{ fontSize: '0.78rem', color: 'var(--color-accent-green)' }}>✅ {qa.positive}</div>}
                                                </div>
                                            ) : (
                                                <div style={{ padding: '8px 12px', borderLeft: '2px solid var(--color-border-default)', fontSize: '0.85rem', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>— Skipped —</div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Behavior Analysis */}
                            {behaviorAnalysis && (() => {
                                const ba = behaviorAnalysis;
                                const cColor = ba.confidenceRating === 'High' ? 'var(--color-accent-green)' : ba.confidenceRating === 'Medium' ? 'var(--color-accent-amber)' : 'var(--color-accent-rose)';
                                const pColor = ba.professionalism >= 7 ? 'var(--color-accent-green)' : ba.professionalism >= 5 ? 'var(--color-accent-amber)' : 'var(--color-accent-rose)';
                                const sColor = ba.fillerScore >= 7 ? 'var(--color-accent-green)' : ba.fillerScore >= 4 ? 'var(--color-accent-amber)' : 'var(--color-accent-rose)';
                                return (
                                    <div className="glass-card" style={{ padding: '28px', marginBottom: '20px', border: '1px solid rgba(139,92,246,0.2)', background: 'rgba(139,92,246,0.03)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                                            <span style={{ fontSize: '1.1rem' }}>🧠</span>
                                            <span style={{ fontWeight: '700', fontSize: '1rem' }}>Behavior Analysis</span>
                                        </div>

                                        {/* 3 metric chips */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '12px', marginBottom: '24px' }}>
                                            {[
                                                { label: 'Confidence', value: ba.confidenceRating, color: cColor },
                                                { label: 'Professionalism', value: `${ba.professionalism}/10`, color: pColor },
                                                { label: 'Speech Clarity', value: `${ba.fillerScore}/10`, color: sColor },
                                            ].map((m, i) => (
                                                <div key={i} style={{ textAlign: 'center', padding: '16px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border-subtle)', borderRadius: '12px', borderTop: `2px solid ${m.color}44` }}>
                                                    <div style={{ fontSize: '0.67rem', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '6px' }}>{m.label}</div>
                                                    <div style={{ fontSize: '1.3rem', fontWeight: '800', color: m.color, letterSpacing: '-0.02em' }}>{m.value}</div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Filler words */}
                                        <div style={{ marginBottom: '20px' }}>
                                            <div style={{ fontSize: '0.72rem', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '10px' }}>🗣️ Filler Word Analysis</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Total detected: <strong style={{ color: sColor }}>{ba.totalFillers}</strong></span>
                                                <span style={{ fontSize: '0.72rem', padding: '3px 10px', borderRadius: '20px', fontWeight: '700', background: `${sColor}15`, color: sColor, border: `1px solid ${sColor}30` }}>{ba.fillerLabel}</span>
                                            </div>
                                            {ba.topFillers.length > 0 ? (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' }}>
                                                    {ba.topFillers.map(([word, count]) => (
                                                        <span key={word} style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', fontWeight: '600', background: 'rgba(251,191,36,0.1)', color: 'var(--color-accent-amber)', border: '1px solid rgba(251,191,36,0.2)' }}>
                                                            &ldquo;{word}&rdquo; × {count}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div style={{ marginTop: '8px', fontSize: '0.85rem', color: 'var(--color-accent-green)', fontWeight: '500' }}>✅ No filler words — excellent speech clarity!</div>
                                            )}
                                        </div>

                                        {/* Behaviors + Posture + Suggestions in a 3-col grid */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px' }} className="max-md:grid-cols-1">
                                            {[
                                                { title: '😰 Nervous Behaviors', items: ba.nervousBehaviors, dotColor: 'var(--color-accent-rose)' },
                                                { title: '🧍 Posture Observations', items: ba.postureObs, dotColor: 'var(--color-accent-cyan)' },
                                                { title: '💡 Improvement Tips', items: ba.suggestions, dotColor: 'var(--color-accent-violet)' },
                                            ].map((col, i) => (
                                                <div key={i} style={{ padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--color-border-subtle)' }}>
                                                    <div style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '10px' }}>{col.title}</div>
                                                    <ul style={{ listStyle: 'none', padding: '0', margin: '0', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                                                        {col.items.map((item, j) => (
                                                            <li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.8rem', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
                                                                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: item.includes('✅') ? 'var(--color-accent-green)' : col.dotColor, flexShrink: '0', marginTop: '6px' }} />
                                                                {item}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Action buttons */}
                            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', paddingBottom: '32px' }}>
                                <button className="btn btn-secondary" onClick={() => navigate('dashboard')}>← Back to Dashboard</button>
                                <button className="btn btn-primary" onClick={() => navigate('setup')}>🎙️ Start New Interview</button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* ═══════════════════════════════════════════
               SCREEN 6: RESUME ANALYZER
               ═══════════════════════════════════════════ */}
            {screen === 'resume' && (() => {
                const handleAnalyzeResume = async () => {
                    if (!resumeText || resumeText.trim().length < 50) {
                        if (resumeInputTab === 'upload') {
                            toast('Please upload your resume file first (PDF or TXT).', 'error');
                        } else {
                            toast('Please paste your resume text (at least 50 characters).', 'error');
                        }
                        return;
                    }
                    if (!resumeRole || resumeRole.trim().length < 2) {
                        toast('Please enter a target job role.', 'error');
                        return;
                    }
                    setResumeLoading(true);
                    setResumeResult(null);
                    try {
                        const res = await api('/resume/analyze', {
                            method: 'POST',
                            body: { resumeText, jobRole: resumeRole },
                        });
                        if (res.success && res.analysis) {
                            setResumeResult(res.analysis);
                            toast('Resume analyzed successfully! 🎯', 'success');
                        } else {
                            toast(res.message || 'Analysis failed. Please try again.', 'error');
                        }
                    } catch (err) {
                        toast(err.message || 'Failed to analyze resume.', 'error');
                    } finally {
                        setResumeLoading(false);
                    }
                };

                const scoreColor = (s) => s >= 80 ? '#10b981' : s >= 60 ? '#06b6d4' : s >= 40 ? '#f59e0b' : '#f43f5e';
                const scoreLabel = (s) => s >= 80 ? 'Excellent' : s >= 60 ? 'Good' : s >= 40 ? 'Fair' : 'Needs Work';

                return (
                    <div className="screen-container">
                        <div className="screen-resume">
                            {/* Header */}
                            <div style={{ textAlign: 'center', marginBottom: '32px', padding: '8px 0' }}>
                                <div style={{ fontSize: '0.72rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-accent-violet)', marginBottom: '8px' }}>AI-Powered</div>
                                <h2 style={{ fontSize: '1.75rem', fontWeight: '800', letterSpacing: '-0.3px', marginBottom: '8px' }}>
                                    <span className="gradient-text">Resume</span> Analyzer
                                </h2>
                                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>Get instant ATS feedback, keyword analysis, and actionable improvements for your target role.</p>
                            </div>

                            {/* Input Panel */}
                            <div className="glass-card" style={{ padding: '32px', marginBottom: '28px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '20px', alignItems: 'flex-start' }}>
                                    {/* Left: tab switcher + input */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {/* Tab bar */}
                                        <div style={{ display: 'flex', gap: '4px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '4px', border: '1px solid var(--color-border-subtle)', width: 'fit-content' }}>
                                            {[{ id: 'upload', label: '📎 Upload File' }, { id: 'paste', label: '📋 Paste Text' }].map((tab) => (
                                                <button
                                                    key={tab.id}
                                                    onClick={() => setResumeInputTab(tab.id)}
                                                    style={{
                                                        padding: '6px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                                                        fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: '600',
                                                        transition: 'all 0.2s',
                                                        background: resumeInputTab === tab.id ? 'var(--gradient-brand)' : 'transparent',
                                                        color: resumeInputTab === tab.id ? '#fff' : 'var(--color-text-muted)',
                                                        boxShadow: resumeInputTab === tab.id ? '0 2px 8px rgba(139,92,246,0.3)' : 'none',
                                                    }}
                                                >
                                                    {tab.label}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Upload Tab */}
                                        {resumeInputTab === 'upload' && (() => {
                                            const handleFile = async (file) => {
                                                if (!file) return;
                                                const ext = file.name.split('.').pop().toLowerCase();
                                                if (!['pdf', 'txt'].includes(ext)) {
                                                    toast('Only PDF and TXT files are supported.', 'error');
                                                    return;
                                                }
                                                setResumeUploading(true);
                                                setResumeFileName(file.name);
                                                try {
                                                    const fd = new FormData();
                                                    fd.append('resume', file);
                                                    const res = await fetch('/api/resume/upload', {
                                                        method: 'POST',
                                                        headers: { Authorization: `Bearer ${token}` },
                                                        body: fd,
                                                    });
                                                    const data = await res.json();
                                                    if (data.success && data.text) {
                                                        setResumeText(data.text);
                                                        setResumeInputTab('paste');
                                                        toast(`✅ ${file.name} loaded — ${data.text.length} characters extracted!`, 'success');
                                                    } else {
                                                        toast(data.message || 'Failed to extract text from file.', 'error');
                                                    }
                                                } catch {
                                                    toast('Upload failed. Please paste your resume instead.', 'error');
                                                } finally {
                                                    setResumeUploading(false);
                                                }
                                            };
                                            return (
                                                <div
                                                    className={`resume-drop-zone ${resumeDragOver ? 'drag-over' : ''}`}
                                                    onDragOver={(e) => { e.preventDefault(); setResumeDragOver(true); }}
                                                    onDragLeave={() => setResumeDragOver(false)}
                                                    onDrop={(e) => { e.preventDefault(); setResumeDragOver(false); handleFile(e.dataTransfer.files[0]); }}
                                                    onClick={() => { if (!resumeUploading) document.getElementById('resume-file-input').click(); }}
                                                    style={{ cursor: resumeUploading ? 'default' : 'pointer' }}
                                                >
                                                    <input
                                                        id="resume-file-input"
                                                        type="file"
                                                        accept=".pdf,.txt"
                                                        style={{ display: 'none' }}
                                                        onChange={(e) => handleFile(e.target.files[0])}
                                                    />
                                                    {resumeUploading ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                                                            <span className="spinner-sm" style={{ width: '28px', height: '28px', borderWidth: '3px' }} />
                                                            <div style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)' }}>Extracting text from <strong>{resumeFileName}</strong>...</div>
                                                        </div>
                                                    ) : (
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                                                            <div style={{ fontSize: '2.8rem', lineHeight: '1' }}>📄</div>
                                                            <div style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--color-text-primary)' }}>
                                                                {resumeDragOver ? 'Drop it here!' : 'Drag & drop your resume'}
                                                            </div>
                                                            <div style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)' }}>or click to browse</div>
                                                            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                                                {['PDF', 'TXT'].map((f) => (
                                                                    <span key={f} style={{ padding: '3px 10px', borderRadius: '6px', background: 'rgba(139,92,246,0.1)', color: 'var(--color-accent-violet)', fontSize: '0.72rem', fontWeight: '700', border: '1px solid rgba(139,92,246,0.2)' }}>{f}</span>
                                                                ))}
                                                            </div>
                                                            {resumeFileName && !resumeUploading && (
                                                                <div style={{ fontSize: '0.78rem', color: 'var(--color-accent-green)', marginTop: '4px' }}>✓ Previously loaded: {resumeFileName}</div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}

                                        {/* Paste Tab */}
                                        {resumeInputTab === 'paste' && (
                                            <div className="form-group" style={{ margin: 0 }}>
                                                <textarea
                                                    value={resumeText}
                                                    onChange={(e) => setResumeText(e.target.value)}
                                                    placeholder="Paste your full resume here — include your summary, experience, education, and skills sections..."
                                                    className="form-input resume-textarea"
                                                    rows={12}
                                                    style={{ resize: 'vertical', minHeight: '220px', fontFamily: 'inherit', lineHeight: '1.6' }}
                                                />
                                                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>{resumeText.length} characters</div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Right: role + button + features */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        <div className="form-group" style={{ margin: 0 }}>
                                            <label className="form-label">Target Job Role <span style={{ color: 'var(--color-accent-rose)' }}>*</span></label>
                                            <input
                                                type="text"
                                                value={resumeRole}
                                                onChange={(e) => setResumeRole(e.target.value)}
                                                placeholder="e.g. Software Engineer, Data Scientist"
                                                className="form-input"
                                            />
                                        </div>
                                        <button
                                            onClick={handleAnalyzeResume}
                                            disabled={resumeLoading || resumeUploading}
                                            className="btn btn-primary btn-lg"
                                            style={{ width: '100%', marginTop: '4px', gap: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        >
                                            {resumeLoading ? (
                                                <><span className="spinner-sm" />  Analyzing...</>
                                            ) : (
                                                <>🔍 Analyze Resume</>
                                            )}
                                        </button>
                                        <div style={{ padding: '14px', background: 'rgba(139,92,246,0.06)', borderRadius: '10px', border: '1px solid rgba(139,92,246,0.15)' }}>
                                            <div style={{ fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-accent-violet)', marginBottom: '8px' }}>What you'll get</div>
                                            {['ATS Compatibility Score', 'Strengths & Skill Gaps', 'Keyword Analysis', 'Formatting & Content Scores', 'Actionable Improvement Tips'].map((item, i) => (
                                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: '6px' }}>
                                                    <span style={{ color: 'var(--color-accent-green)', fontSize: '0.75rem' }}>✓</span> {item}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Results */}
                            {resumeResult && (() => {
                                const r = resumeResult;
                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '40px' }}>
                                        {/* Score Row */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                                            {/* ATS Score */}
                                            <div className="glass-card" style={{ padding: '28px', textAlign: 'center', borderTop: `3px solid ${scoreColor(r.atsScore)}` }}>
                                                <div style={{ fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)', marginBottom: '12px' }}>ATS Score</div>
                                                <div style={{ position: 'relative', display: 'inline-block', marginBottom: '12px' }}>
                                                    <svg width="100" height="100" viewBox="0 0 100 100">
                                                        <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
                                                        <circle cx="50" cy="50" r="42" fill="none" stroke={scoreColor(r.atsScore)} strokeWidth="10"
                                                            strokeDasharray={`${(r.atsScore / 100) * 264} 264`}
                                                            strokeLinecap="round"
                                                            transform="rotate(-90 50 50)"
                                                            style={{ transition: 'stroke-dasharray 1s ease' }}
                                                        />
                                                        <text x="50" y="50" dominantBaseline="central" textAnchor="middle" fill={scoreColor(r.atsScore)} fontSize="20" fontWeight="800">{r.atsScore}</text>
                                                        <text x="50" y="65" dominantBaseline="central" textAnchor="middle" fill="#9ca3af" fontSize="8">/ 100</text>
                                                    </svg>
                                                </div>
                                                <div style={{ fontSize: '1rem', fontWeight: '700', color: scoreColor(r.atsScore) }}>{scoreLabel(r.atsScore)}</div>
                                            </div>
                                            {/* Content + Formatting */}
                                            <div className="glass-card" style={{ padding: '28px', textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)', marginBottom: '12px' }}>Content Score</div>
                                                <div style={{ fontSize: '3rem', fontWeight: '900', color: scoreColor(r.contentScore * 10), lineHeight: '1', marginBottom: '6px' }}>{r.contentScore}<span style={{ fontSize: '1.2rem', opacity: '0.5' }}>/10</span></div>
                                                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '12px' }}>Relevance & depth of your content</div>
                                            </div>
                                            <div className="glass-card" style={{ padding: '28px', textAlign: 'center' }}>
                                                <div style={{ fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)', marginBottom: '12px' }}>Formatting Score</div>
                                                <div style={{ fontSize: '3rem', fontWeight: '900', color: scoreColor(r.formattingScore * 10), lineHeight: '1', marginBottom: '6px' }}>{r.formattingScore}<span style={{ fontSize: '1.2rem', opacity: '0.5' }}>/10</span></div>
                                                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: '12px' }}>Structure, clarity & readability</div>
                                            </div>
                                        </div>

                                        {/* Summary + Experience */}
                                        <div className="glass-card" style={{ padding: '24px', display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)', marginBottom: '8px' }}>📝 Overall Summary</div>
                                                <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', lineHeight: '1.7', margin: 0 }}>{r.summary}</p>
                                            </div>
                                            <div style={{ flexShrink: 0, padding: '12px 20px', borderRadius: '12px', background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', textAlign: 'center', minWidth: '120px' }}>
                                                <div style={{ fontSize: '0.65rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-text-muted)', marginBottom: '6px' }}>Level</div>
                                                <div style={{ fontSize: '0.9rem', fontWeight: '700', color: 'var(--color-accent-violet)' }}>{r.experienceLevel || 'Mid Level'}</div>
                                            </div>
                                        </div>

                                        {/* Keywords */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                                            <div className="glass-card" style={{ padding: '22px' }}>
                                                <div style={{ fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-accent-green)', marginBottom: '12px' }}>✅ Keywords Found</div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                    {(r.keywordsFound || []).map((kw, i) => (
                                                        <span key={i} className="keyword-pill keyword-found">{kw}</span>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="glass-card" style={{ padding: '22px' }}>
                                                <div style={{ fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-accent-rose)', marginBottom: '12px' }}>❌ Keywords Missing</div>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                    {(r.keywordsMissing || []).map((kw, i) => (
                                                        <span key={i} className="keyword-pill keyword-missing">{kw}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Strengths / Gaps / Suggestions */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '16px' }}>
                                            {[
                                                { title: '💪 Strengths', items: r.strengths || [], dotColor: 'var(--color-accent-green)' },
                                                { title: '⚠️ Gaps', items: r.gaps || [], dotColor: 'var(--color-accent-amber)' },
                                                { title: '💡 Suggestions', items: r.suggestions || [], dotColor: 'var(--color-accent-violet)' },
                                            ].map((col, i) => (
                                                <div key={i} className="glass-card" style={{ padding: '22px' }}>
                                                    <div style={{ fontSize: '0.7rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em', color: col.dotColor, marginBottom: '12px' }}>{col.title}</div>
                                                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                        {col.items.map((item, j) => (
                                                            <li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.82rem', color: 'var(--color-text-secondary)', lineHeight: '1.5' }}>
                                                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: col.dotColor, flexShrink: 0, marginTop: '6px' }} />
                                                                {item}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Actions */}
                                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                                            <button className="btn btn-secondary" onClick={() => { setResumeResult(null); setResumeText(''); setResumeRole(''); }}>
                                                🔄 Analyze Another Resume
                                            </button>
                                            <button className="btn btn-primary" onClick={() => navigate('setup')}>
                                                🎙️ Practice Interview for This Role
                                            </button>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}