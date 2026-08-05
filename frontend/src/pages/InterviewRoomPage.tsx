import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FilesetResolver, FaceLandmarker, type FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { interviewApi } from '../api';

// ─── Types ────────────────────────────────────────────────────────────────────
type RoomStep = 'loading' | 'precheck' | 'starting' | 'interview' | 'processing' | 'completed' | 'error';
type FaceStatus = 'initializing' | 'no-face' | 'detected' | 'ready';
type RecordingState = 'idle' | 'recording' | 'listening_vad' | 'processing';
type InputMode = 'auto_vad' | 'push_to_talk';

interface SessionData {
  questionText: string;
  audioBase64: string;
  contentType: string;
  turnNumber: number;
  totalTurns: number;
  timeLimitMinutes: number;
  maxFaceWarnings: number;
  candidateName?: string;
  jobTitle?: string;
  language?: string;
}

interface TranscriptEntry {
  role: 'ai' | 'candidate';
  content: string;
  timestamp: Date;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const FACE_LANDMARKER_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const STABLE_FRAMES_NEEDED = 6;
const FACE_ABSENT_THRESHOLD_MS = 3000; // 3s absent face triggers warning

// ─── Component ────────────────────────────────────────────────────────────────
const InterviewRoomPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  // ── State machine ──────────────────────────────────────────────────────────
  const [step, setStep] = useState<RoomStep>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  // ── Session data ───────────────────────────────────────────────────────────
  const [session, setSession] = useState<SessionData | null>(null);
  const [turnNumber, setTurnNumber] = useState(0);
  const [totalTurns, setTotalTurns] = useState(8);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [faceWarnings, setFaceWarnings] = useState(0);
  const [maxFaceWarnings, setMaxFaceWarnings] = useState(3);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(20);
  const [timeLeft, setTimeLeft] = useState(0);
  const [endReason, setEndReason] = useState<'COMPLETED' | 'FACE_VIOLATION' | 'TIME_EXCEEDED'>('COMPLETED');

  // ── Mode switcher & VAD state ──────────────────────────────────────────────
  const [inputMode, setInputMode] = useState<InputMode>('auto_vad');
  const [liveSpeechText, setLiveSpeechText] = useState('');
  const [turnError, setTurnError] = useState('');

  // ── Precheck state ─────────────────────────────────────────────────────────
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [selectedCamera, setSelectedCamera] = useState('');
  const [selectedMic, setSelectedMic] = useState('');
  const [micLevel, setMicLevel] = useState(0);
  const [precheckCameraOk, setPrecheckCameraOk] = useState(false);
  const [precheckMicOk, setPrecheckMicOk] = useState(false);

  // ── Face detection state ───────────────────────────────────────────────────
  const [faceStatus, setFaceStatus] = useState<FaceStatus>('initializing');
  const [mpReady, setMpReady] = useState(false);
  const [stableCount, setStableCount] = useState(0);
  const [showFaceWarningModal, setShowFaceWarningModal] = useState(false);
  const [faceWarningCount, setFaceWarningCount] = useState(0);
  const [terminated, setTerminated] = useState(false);

  // ── Audio / recording state ────────────────────────────────────────────────
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [currentAIText, setCurrentAIText] = useState('');
  const [isPlayingTTS, setIsPlayingTTS] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  // Live visualizer states
  const [aiVisualizerBars, setAiVisualizerBars] = useState<number[]>(Array(12).fill(3));

  // ── Refs ───────────────────────────────────────────────────────────────────
  const videoRef = useRef<HTMLVideoElement>(null);
  const precheckVideoRef = useRef<HTMLVideoElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const precheckStreamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const stableCountRef = useRef(0);
  const lastMpTimeRef = useRef(0);
  const cameraActiveRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micRafRef = useRef<number | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const faceAbsentSinceRef = useRef<number | null>(null);
  const warningCooldownRef = useRef(false);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionStartTimeRef = useRef<number>(0);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  // Real-time VAD via AnalyserNode
  const vadAnalyserRef = useRef<AnalyserNode | null>(null);
  const vadRafRef = useRef<number | null>(null);
  const vadSilenceMsRef = useRef<number>(0);
  const vadLastSpeechRef = useRef<number>(Date.now());
  // AI audio visualizer
  const aiAudioCtxRef = useRef<AudioContext | null>(null);
  const aiAnalyserRef = useRef<AnalyserNode | null>(null);
  const aiVizRafRef = useRef<number | null>(null);

  // Speech Recognition ref for React in-built fallback & live speech text
  const recognitionRef = useRef<any>(null);
  const vadSilenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveTranscriptAccumulatorRef = useRef<string>('');

  // ── Scroll transcript to bottom ─────────────────────────────────────────────
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // ── On mount: validate token & get status ──────────────────────────────────
  useEffect(() => {
    if (!token) { setErrorMsg('Invalid session.'); setStep('error'); return; }
    interviewApi.status(token)
      .then((r) => {
        const d = r.data.data;
        if (d.status === 'COMPLETED') {
          setEndReason(d.interviewEndReason || 'COMPLETED');
          setTranscript(d.transcript?.map((t: { role: 'ai' | 'candidate'; content: string }) => ({
            role: t.role, content: t.content, timestamp: new Date(),
          })) || []);
          setStep('completed');
          return;
        }
        if (!['VERIFIED', 'IN_PROGRESS'].includes(d.status)) {
          setErrorMsg('Please complete identity verification first.');
          setStep('error');
          return;
        }
        setMaxFaceWarnings(d.maxFaceWarnings || 3);
        setTimeLimitMinutes(d.timeLimitMinutes || 20);
        setTotalTurns(d.totalTurns || 8);
        setStep('precheck');
      })
      .catch(() => {
        setErrorMsg('Could not connect to interview server. Please check your internet connection.');
        setStep('error');
      });
  }, [token]);

  // ── Init MediaPipe ─────────────────────────────────────────────────────────
  const initMediaPipe = useCallback(async () => {
    try {
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFacialTransformationMatrixes: false,
        outputFaceBlendshapes: false,
      });
      landmarkerRef.current = landmarker;
      setMpReady(true);
      setFaceStatus('no-face');
    } catch (e) {
      console.error('MediaPipe init failed:', e);
      setMpReady(true); // degrade gracefully
      setFaceStatus('ready');
    }
  }, []);

  // ── Start camera stream ────────────────────────────────────────────────────
  const startStream = useCallback(async (
    videoEl: HTMLVideoElement,
    deviceId?: string
  ): Promise<MediaStream> => {
    const constraints: MediaStreamConstraints = {
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 640 }, height: { ideal: 480 } }
        : { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    videoEl.srcObject = stream;
    await new Promise<void>((r) => { videoEl.onloadedmetadata = () => r(); });
    await videoEl.play();
    return stream;
  }, []);

  // ── Mic analyser (for precheck level meter) ────────────────────────────────
  const startMicAnalyser = useCallback(async (deviceId?: string) => {
    try {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      const micStream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(micStream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      setPrecheckMicOk(true);

      const tick = () => {
        if (!analyserRef.current) return;
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;
        setMicLevel(Math.min(100, (avg / 128) * 100));
        micRafRef.current = requestAnimationFrame(tick);
      };
      micRafRef.current = requestAnimationFrame(tick);
    } catch { setPrecheckMicOk(false); }
  }, []);

  // ── PRECHECK: Init devices ─────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'precheck') return;
    (async () => {
      try {
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        tempStream.getTracks().forEach((t) => t.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter((d) => d.kind === 'videoinput');
        const mics = devices.filter((d) => d.kind === 'audioinput');
        setCameras(cams);
        setMicrophones(mics);

        const defaultCam = cams[0]?.deviceId || '';
        const defaultMic = mics[0]?.deviceId || '';
        setSelectedCamera(defaultCam);
        setSelectedMic(defaultMic);

        if (precheckVideoRef.current) {
          const s = await startStream(precheckVideoRef.current, defaultCam);
          precheckStreamRef.current = s;
          setPrecheckCameraOk(true);
        }

        await startMicAnalyser(defaultMic);
        await initMediaPipe();
      } catch (e) {
        console.error('Precheck init error:', e);
      }
    })();

    return () => {
      if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
      audioContextRef.current?.close();
      precheckStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [step]);

  // ── Precheck Face detection loop ───────────────────────────────────────────
  const precheckDetectionRef = useRef(false);
  useEffect(() => {
    if (step !== 'precheck' || !mpReady) return;
    precheckDetectionRef.current = true;

    const loop = () => {
      if (!precheckDetectionRef.current) return;
      const video = precheckVideoRef.current;
      if (!video || video.readyState < 2) { requestAnimationFrame(loop); return; }
      const lm = landmarkerRef.current;
      if (lm) {
        try {
          const now = Math.max(performance.now(), lastMpTimeRef.current + 1);
          lastMpTimeRef.current = now;
          const result: FaceLandmarkerResult = lm.detectForVideo(video, now);
          const detected = result.faceLandmarks.length > 0;
          if (detected) {
            stableCountRef.current = Math.min(stableCountRef.current + 1, STABLE_FRAMES_NEEDED);
            setStableCount(stableCountRef.current);
            setFaceStatus(stableCountRef.current >= STABLE_FRAMES_NEEDED ? 'ready' : 'detected');
          } else {
            stableCountRef.current = 0;
            setStableCount(0);
            setFaceStatus('no-face');
          }
        } catch { /* ignore */ }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);

    return () => { precheckDetectionRef.current = false; };
  }, [step, mpReady]);

  // ── Device Change ──────────────────────────────────────────────────────────
  const handleCameraChange = useCallback(async (deviceId: string) => {
    setSelectedCamera(deviceId);
    precheckStreamRef.current?.getTracks().forEach((t) => t.stop());
    if (precheckVideoRef.current) {
      try {
        const s = await startStream(precheckVideoRef.current, deviceId);
        precheckStreamRef.current = s;
        setPrecheckCameraOk(true);
      } catch { setPrecheckCameraOk(false); }
    }
  }, [startStream]);

  const handleMicChange = useCallback(async (deviceId: string) => {
    setSelectedMic(deviceId);
    if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
    await startMicAnalyser(deviceId);
  }, [startMicAnalyser]);

  // ── Web Audio Beep Alarm for Face Out of Frame ──────────────────────────────
  const playWarningBeep = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(440, ctx.currentTime + 0.15);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch { /* ignore */ }
  }, []);

  // ── Detection loop for interview (with anti-cheat & HUD drawing) ─────────────
  const runDetection = useCallback(() => {
    if (!cameraActiveRef.current) return;
    const video = videoRef.current;
    const overlay = overlayCanvasRef.current;
    const lm = landmarkerRef.current;

    if (!video || !overlay || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(runDetection);
      return;
    }

    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    if (overlay.width !== vw) overlay.width = vw;
    if (overlay.height !== vh) overlay.height = vh;

    const ctx = overlay.getContext('2d')!;
    ctx.clearRect(0, 0, vw, vh);

    let faceDetected = false;

    if (lm) {
      try {
        const now = Math.max(performance.now(), lastMpTimeRef.current + 1);
        lastMpTimeRef.current = now;
        const result: FaceLandmarkerResult = lm.detectForVideo(video, now);
        faceDetected = result.faceLandmarks.length > 0;

        if (faceDetected) {
          faceAbsentSinceRef.current = null;
          const lms = result.faceLandmarks[0];
          let minX = 1, minY = 1, maxX = 0, maxY = 0;
          lms.forEach(({ x, y }) => {
            if (x < minX) minX = x; if (y < minY) minY = y;
            if (x > maxX) maxX = x; if (y > maxY) maxY = y;
          });
          const padX = (maxX - minX) * 0.18;
          const padY = (maxY - minY) * 0.22;
          const rx = ((maxX - minX + padX * 2) / 2) * vw;
          const ry = ((maxY - minY + padY * 2) / 2) * vh;
          const cx = ((minX + maxX) / 2) * vw;
          const cy = ((minY + maxY) / 2) * vh;

          // Target reticle
          ctx.save();
          ctx.shadowColor = 'rgba(16,185,129,0.5)';
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.restore();

          // HUD badge
          ctx.font = 'bold 11px system-ui';
          const hudText = '✓ FACE CONFIRMED · ACTIVE TRACKING';
          const hudW = ctx.measureText(hudText).width + 20;
          const hx = cx - hudW / 2;
          const hy = cy + ry + 10;
          ctx.fillStyle = 'rgba(16, 185, 129, 0.9)';
          ctx.beginPath();
          (ctx as unknown as CanvasRenderingContext2D & { roundRect: (x:number,y:number,w:number,h:number,r:number)=>void }).roundRect(hx, hy, hudW, 22, 11);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.textBaseline = 'middle';
          ctx.fillText(hudText, hx + 10, hy + 11);

          setFaceStatus('ready');
        } else {
          if (!faceAbsentSinceRef.current) {
            faceAbsentSinceRef.current = Date.now();
          }

          // Red flashing vignette & border
          ctx.save();
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
          ctx.lineWidth = 6;
          ctx.strokeRect(0, 0, vw, vh);

          // Pulsing oval
          ctx.setLineDash([8, 6]);
          ctx.beginPath();
          ctx.ellipse(vw / 2, vh / 2, vw * 0.26, vh * 0.36, 0, 0, Math.PI * 2);
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 3;
          ctx.stroke();

          // Warning Text Banner
          const bannerText = '⚠️ WARNING: CANDIDATE OUT OF FRAME';
          ctx.font = 'bold 13px system-ui';
          const bannerW = ctx.measureText(bannerText).width + 32;
          const bx = vw / 2 - bannerW / 2;
          const by = vh / 2 + vh * 0.36 + 12;

          ctx.fillStyle = 'rgba(239, 68, 68, 0.95)';
          ctx.beginPath();
          (ctx as unknown as CanvasRenderingContext2D & { roundRect: (x:number,y:number,w:number,h:number,r:number)=>void }).roundRect(bx, by, bannerW, 28, 14);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.textBaseline = 'middle';
          ctx.fillText(bannerText, bx + 16, by + 14);
          ctx.restore();

          setFaceStatus('no-face');

          const absentMs = Date.now() - (faceAbsentSinceRef.current || Date.now());
          if (absentMs >= FACE_ABSENT_THRESHOLD_MS && !warningCooldownRef.current) {
            warningCooldownRef.current = true;
            faceAbsentSinceRef.current = null;
            playWarningBeep();

            interviewApi.faceWarning(token!).then((r) => {
              const d = r.data.data;
              setFaceWarnings(d.warnings);
              setFaceWarningCount(d.warnings);
              setShowFaceWarningModal(true);

              if (d.terminated) {
                setTerminated(true);
                setEndReason('FACE_VIOLATION');
                cameraActiveRef.current = false;
                setTimeout(() => setStep('completed'), 2000);
              }

              setTimeout(() => { warningCooldownRef.current = false; }, 5000);
            }).catch(() => {
              warningCooldownRef.current = false;
            });
          }
        }
      } catch { /* ignore */ }
    } else {
      faceDetected = true;
      setFaceStatus('ready');
    }

    rafRef.current = requestAnimationFrame(runDetection);
  }, [token, playWarningBeep]);

  // ── Start interview camera ─────────────────────────────────────────────────
  const startInterviewCamera = useCallback(async () => {
    try {
      precheckStreamRef.current?.getTracks().forEach((t) => t.stop());
      const s = await startStream(videoRef.current!, selectedCamera);
      streamRef.current = s;
      cameraActiveRef.current = true;
      rafRef.current = requestAnimationFrame(runDetection);
    } catch (e) {
      console.error('Failed to start interview camera:', e);
    }
  }, [selectedCamera, startStream, runDetection]);

  // ── Stop interview camera ──────────────────────────────────────────────────
  const stopInterviewCamera = useCallback(() => {
    cameraActiveRef.current = false;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // ── Timer countdown ────────────────────────────────────────────────────────
  const startTimer = useCallback((minutes: number) => {
    sessionStartTimeRef.current = Date.now();
    const totalSeconds = minutes * 60;
    setTimeLeft(totalSeconds);

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - sessionStartTimeRef.current) / 1000);
      const remaining = totalSeconds - elapsed;
      if (remaining <= 0) {
        clearInterval(timerIntervalRef.current!);
        setTimeLeft(0);
        setEndReason('TIME_EXCEEDED');
        interviewApi.end(token!, 'TIME_EXCEEDED').catch(() => {});
        setStep('completed');
      } else {
        setTimeLeft(remaining);
      }
    }, 1000);
  }, [token]);

  // ── AI Audio Visualizer ─────────────────────────────────────────────────────
  const startAiVisualizer = useCallback((audio: HTMLAudioElement) => {
    try {
      if (aiVizRafRef.current) cancelAnimationFrame(aiVizRafRef.current);
      if (!aiAudioCtxRef.current || aiAudioCtxRef.current.state === 'closed') {
        aiAudioCtxRef.current = new AudioContext();
      }
      const ctx = aiAudioCtxRef.current;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      aiAnalyserRef.current = analyser;
      const src = ctx.createMediaElementSource(audio);
      src.connect(analyser);
      analyser.connect(ctx.destination);

      const bufLen = analyser.frequencyBinCount;
      const dataArr = new Uint8Array(bufLen);
      const BAR_COUNT = 12;

      const loop = () => {
        analyser.getByteFrequencyData(dataArr);
        const bars: number[] = [];
        const step = Math.floor(bufLen / BAR_COUNT);
        for (let i = 0; i < BAR_COUNT; i++) {
          const val = dataArr[i * step] / 255;
          bars.push(Math.max(3, Math.round(val * 30)));
        }
        setAiVisualizerBars(bars);
        aiVizRafRef.current = requestAnimationFrame(loop);
      };
      aiVizRafRef.current = requestAnimationFrame(loop);
    } catch { /* AudioContext may fail in some env */ }
  }, []);

  const stopAiVisualizer = useCallback(() => {
    if (aiVizRafRef.current) { cancelAnimationFrame(aiVizRafRef.current); aiVizRafRef.current = null; }
    setAiVisualizerBars(Array(12).fill(3));
  }, []);

  // ── Native Web Speech Synthesis Fallback ────────────────────────────────────
  const speakNativeTTS = useCallback((text: string, langCode: string = 'en-IN'): Promise<void> => {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window) || !text) {
        setIsPlayingTTS(false);
        resolve();
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = langCode;
      utterance.rate = 0.95;

      const voices = window.speechSynthesis.getVoices();
      const match = voices.find((v) => v.lang.startsWith(langCode.slice(0, 2))) || voices[0];
      if (match) utterance.voice = match;

      setIsPlayingTTS(true);
      utterance.onend = () => { setIsPlayingTTS(false); stopAiVisualizer(); resolve(); };
      utterance.onerror = () => { setIsPlayingTTS(false); stopAiVisualizer(); resolve(); };
      window.speechSynthesis.speak(utterance);
    });
  }, [stopAiVisualizer]);

  // ── Play TTS audio (Sarvam with Native Fallback) ────────────────────────────
  const playTTS = useCallback((textToSpeak: string, base64?: string, contentType?: string, lang: string = 'en-IN'): Promise<void> => {
    return new Promise((resolve) => {
      if (base64) {
        try {
          if (currentAudioRef.current) {
            currentAudioRef.current.pause();
            currentAudioRef.current = null;
          }
          const byteChars = atob(base64);
          const byteArr = new Uint8Array(byteChars.length);
          for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
          const blob = new Blob([byteArr], { type: contentType || 'audio/wav' });
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          currentAudioRef.current = audio;
          setIsPlayingTTS(true);
          audio.onplay = () => { startAiVisualizer(audio); };
          audio.onended = () => { setIsPlayingTTS(false); stopAiVisualizer(); URL.revokeObjectURL(url); resolve(); };
          audio.onerror = () => {
            stopAiVisualizer();
            speakNativeTTS(textToSpeak, lang).then(resolve);
          };
          audio.play().catch(() => {
            stopAiVisualizer();
            speakNativeTTS(textToSpeak, lang).then(resolve);
          });
          return;
        } catch { /* fallback below */ }
      }
      speakNativeTTS(textToSpeak, lang).then(resolve);
    });
  }, [speakNativeTTS, startAiVisualizer, stopAiVisualizer]);

  // ── Enter interview from precheck ──────────────────────────────────────────
  const handleStartInterview = useCallback(async () => {
    setStep('starting');
    try {
      if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
      audioContextRef.current?.close();

      const { data } = await interviewApi.start(token!);
      const d = data.data;

      setSession(d);
      setTurnNumber(d.turnNumber);
      setTotalTurns(d.totalTurns);
      setMaxFaceWarnings(d.maxFaceWarnings || 3);
      setTimeLimitMinutes(d.timeLimitMinutes || 20);
      setCurrentAIText(d.questionText);
      if (d.transcript && d.transcript.length > 0) {
        setTranscript(d.transcript.map((t: { role: 'ai' | 'candidate'; content: string }) => ({
          role: t.role, content: t.content, timestamp: new Date(),
        })));
      } else {
        setTranscript([{ role: 'ai', content: d.questionText, timestamp: new Date() }]);
      }

      setStep('interview');
      await startInterviewCamera();
      startTimer(d.timeLimitMinutes || 20);

      // Play TTS
      await playTTS(d.questionText, d.audioBase64, d.contentType, d.language || 'en-IN');
    } catch (err) {
      console.error('Start interview error:', err);
      setErrorMsg('Failed to start interview. Please refresh and try again.');
      setStep('error');
    }
  }, [token, startInterviewCamera, startTimer, playTTS]);

  // ── Submit Turn Handler (Handles both Audio Blob & Live Text Fallback) ──────
  const submitTurnResponse = useCallback(async (audioBlob?: Blob, fallbackText?: string) => {
    setRecordingState('processing');
    setStep('processing');
    setLiveSpeechText('');

    try {
      let data: any = null;

      // Primary: Send Audio Blob to Sarvam STT
      if (audioBlob && audioBlob.size >= 1000) {
        try {
          const formData = new FormData();
          formData.append('audio', audioBlob, 'answer.webm');
          const res = await interviewApi.turn(token!, formData);
          data = res.data.data;
        } catch (sttErr) {
          console.warn('Sarvam STT failed, falling back to React In-built STT:', sttErr);
        }
      }

      // Secondary: Fallback to React In-built STT text
      if (!data && (fallbackText || liveTranscriptAccumulatorRef.current)) {
        const text = (fallbackText || liveTranscriptAccumulatorRef.current).trim();
        if (text) {
          const res = await interviewApi.turnText(token!, text);
          data = res.data.data;
        }
      }

      if (!data) {
        setStep('interview');
        setRecordingState('idle');
        setTurnError('No speech detected. Please try speaking clearly again.');
        setTimeout(() => setTurnError(''), 4000);
        return;
      }

      const d = data;
      setTranscript((prev) => [
        ...prev,
        { role: 'candidate', content: d.candidateText, timestamp: new Date() },
      ]);
      setTurnNumber(d.turnNumber);

      if (d.isComplete) {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        await interviewApi.end(token!, 'COMPLETED');
        setEndReason('COMPLETED');
        setStep('completed');
        stopInterviewCamera();
      } else {
        setCurrentAIText(d.questionText);
        setTranscript((prev) => [
          ...prev,
          { role: 'ai', content: d.questionText, timestamp: new Date() },
        ]);
        setStep('interview');
        setRecordingState('idle');

        // Play TTS for next question
        await playTTS(d.questionText, d.audioBase64, d.contentType, session?.language || 'en-IN');
      }
    } catch (e) {
      console.error('Turn submission error:', e);
      setStep('interview');
      setRecordingState('idle');
      setTurnError('Failed to process response. Please try speaking again.');
      setTimeout(() => setTurnError(''), 4000);
    }
  }, [token, session, playTTS, stopInterviewCamera]);

  // ── Real VAD via AnalyserNode RMS ───────────────────────────────────────────
  const SILENCE_THRESHOLD = 0.018;   // RMS below this = silence
  const SILENCE_DURATION_MS = 2200;  // sustained silence to auto-submit

  const startRealVAD = useCallback((micStream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      const src = ctx.createMediaStreamSource(micStream);
      src.connect(analyser);
      vadAnalyserRef.current = analyser;
      vadLastSpeechRef.current = Date.now();

      const bufLen = analyser.frequencyBinCount;
      const dataArr = new Float32Array(bufLen);

      const loop = () => {
        analyser.getFloatTimeDomainData(dataArr);
        let sum = 0;
        for (let i = 0; i < bufLen; i++) sum += dataArr[i] * dataArr[i];
        const rms = Math.sqrt(sum / bufLen);

        // Update mic level meter 0-100
        setMicLevel(Math.min(100, Math.round(rms * 800)));

        if (rms > SILENCE_THRESHOLD) {
          vadLastSpeechRef.current = Date.now();
          vadSilenceMsRef.current = 0;
        } else {
          vadSilenceMsRef.current = Date.now() - vadLastSpeechRef.current;
        }

        vadRafRef.current = requestAnimationFrame(loop);
      };
      vadRafRef.current = requestAnimationFrame(loop);

      // Silence duration watcher — checks every 300ms
      const watcherId = setInterval(() => {
        if (vadSilenceMsRef.current >= SILENCE_DURATION_MS) {
          clearInterval(watcherId);
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
          }
        }
      }, 300);

      return () => {
        clearInterval(watcherId);
        if (vadRafRef.current) cancelAnimationFrame(vadRafRef.current);
        ctx.close();
        setMicLevel(0);
      };
    } catch {
      return () => {};
    }
  }, []);

  // ── React In-Built Speech Recognition (Live Transcript Text) ────────────────
  const startLiveSpeechRecognition = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* ignore */ }
      }

      const recognition = new SpeechRecognition();
      recognition.lang = session?.language || 'en-IN';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognitionRef.current = recognition;

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript + ' ';
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }

        const fullText = (liveTranscriptAccumulatorRef.current + ' ' + finalTranscript + interimTranscript).trim();
        setLiveSpeechText(fullText);
      };

      recognition.onerror = () => { /* ignore */ };
      recognition.start();
    } catch { /* ignore */ }
  }, [session]);

  // ── Push-to-Talk & Auto VAD recording trigger ──────────────────────────────
  const handleStartRecording = useCallback(async () => {
    if (recordingState !== 'idle' || isPlayingTTS) return;
    try {
      liveTranscriptAccumulatorRef.current = '';
      setLiveSpeechText('');

      const micConstraints: MediaStreamConstraints = {
        audio: selectedMic ? { deviceId: { exact: selectedMic } } : true,
      };
      const micStream = await navigator.mediaDevices.getUserMedia(micConstraints);

      // Start live transcript recognition
      startLiveSpeechRecognition();

      // Start real AnalyserNode VAD (only in auto_vad mode)
      let stopVAD: (() => void) | null = null;
      if (inputMode === 'auto_vad') {
        stopVAD = startRealVAD(micStream);
      }

      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const recorder = new MediaRecorder(micStream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stopVAD?.();
        setMicLevel(0);
        micStream.getTracks().forEach((t) => t.stop());
        if (recognitionRef.current) {
          try { recognitionRef.current.stop(); } catch { /* ignore */ }
        }
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        submitTurnResponse(audioBlob, liveSpeechText);
      };

      recorder.start(250);
      setRecordingState(inputMode === 'auto_vad' ? 'listening_vad' : 'recording');
    } catch (e) {
      console.error('Recording error:', e);
      setRecordingState('idle');
    }
  }, [recordingState, isPlayingTTS, selectedMic, inputMode, liveSpeechText, startLiveSpeechRecognition, startRealVAD, submitTurnResponse]);

  const handleStopRecording = useCallback(() => {
    if (vadSilenceTimeoutRef.current) clearTimeout(vadSilenceTimeoutRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // ── Auto VAD: auto-listen when AI finishes speaking ─────────────────────────
  useEffect(() => {
    if (step === 'interview' && inputMode === 'auto_vad' && !isPlayingTTS && recordingState === 'idle') {
      const timer = setTimeout(() => {
        handleStartRecording();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [step, inputMode, isPlayingTTS, recordingState, handleStartRecording]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stopInterviewCamera();
      if (micRafRef.current) cancelAnimationFrame(micRafRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (vadSilenceTimeoutRef.current) clearTimeout(vadSilenceTimeoutRef.current);
      audioContextRef.current?.close();
      currentAudioRef.current?.pause();
      if (recognitionRef.current) { try { recognitionRef.current.stop(); } catch { /* ignore */ } }
      landmarkerRef.current?.close();
    };
  }, [stopInterviewCamera]);

  // ── Format timer ───────────────────────────────────────────────────────────
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const progressPct = totalTurns > 0 ? (turnNumber / totalTurns) * 100 : 0;
  const timerWarning = timeLeft > 0 && timeLeft <= 120;

  // ══════════════════════════════════════════════════════════════════════════════
  // RENDER (FORCED STUDIO DARK THEME)
  // ══════════════════════════════════════════════════════════════════════════════

  if (step === 'loading') {
    return (
      <div className="interview-room-page studio-dark">
        <div className="interview-center-card">
          <div className="spinner" />
          <span style={{ color: '#94a3b8', fontSize: '0.875rem', marginTop: '1rem' }}>
            Loading your studio session…
          </span>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="interview-room-page studio-dark">
        <div className="interview-center-card" style={{ textAlign: 'center', maxWidth: 420 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>⚠️</div>
          <h2 style={{ marginBottom: '0.5rem', color: '#fff' }}>Connection Error</h2>
          <p style={{ color: '#94a3b8', fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
            {errorMsg}
          </p>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>← Go Back</button>
        </div>
      </div>
    );
  }

  if (step === 'starting') {
    return (
      <div className="interview-room-page studio-dark">
        <div className="interview-center-card">
          <div style={{
            width: 64, height: 64, borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.75rem', marginBottom: '1.25rem',
            boxShadow: '0 0 30px rgba(99, 102, 241, 0.5)',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}>🤖</div>
          <p style={{ color: '#f8fafc', fontSize: '1rem', fontWeight: 600 }}>Initializing AI Interviewer…</p>
          <div className="spinner" style={{ marginTop: '1.25rem' }} />
        </div>
      </div>
    );
  }

  // ── PRECHECK ───────────────────────────────────────────────────────────────
  if (step === 'precheck') {
    const allReady = precheckCameraOk && precheckMicOk;

    return (
      <div style={{
        minHeight: '100vh', background: '#202124',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Google Sans', 'Inter', -apple-system, sans-serif",
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Ambient blobs */}
        <div style={{ position: 'absolute', top: '-15%', left: '-10%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(138,180,248,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-15%', right: '-10%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(197,138,249,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

        {/* Top bar */}
        <div style={{
          height: 56, padding: '0 1.5rem', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0, background: 'rgba(32,33,36,0.9)', backdropFilter: 'blur(8px)',
          position: 'relative', zIndex: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg, #1a73e8, #8ab4f8)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
            }}>🤖</div>
            <span style={{ color: '#e8eaed', fontWeight: 600, fontSize: '0.9375rem' }}>AI Interview Studio</span>
          </div>
          <div style={{
            fontSize: '0.75rem', color: '#9aa0a6', fontWeight: 500,
            background: 'rgba(255,255,255,0.06)', padding: '0.25rem 0.875rem',
            borderRadius: 20, border: '1px solid rgba(255,255,255,0.08)',
          }}>
            Pre-Interview Setup
          </div>
        </div>

        {/* Main Content */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '2rem 1.5rem', position: 'relative', zIndex: 1,
        }}>
          <div style={{
            display: 'flex', gap: '1.75rem', width: '100%', maxWidth: 900,
            alignItems: 'flex-start',
          }}>

            {/* ── Left: Camera Preview Card ── */}
            <div style={{
              flex: '0 0 420px', display: 'flex', flexDirection: 'column', gap: '0.875rem',
            }}>
              {/* Camera video tile */}
              <div style={{
                position: 'relative', width: '100%', aspectRatio: '16/9',
                background: '#1a1b1e', borderRadius: 16, overflow: 'hidden',
                border: `2px solid ${faceStatus === 'ready' ? 'rgba(16,185,129,0.5)' : 'rgba(255,255,255,0.08)'}`,
                boxShadow: faceStatus === 'ready'
                  ? '0 0 0 4px rgba(16,185,129,0.1), 0 12px 40px rgba(0,0,0,0.5)'
                  : '0 12px 40px rgba(0,0,0,0.4)',
                transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
              }}>
                <video
                  ref={precheckVideoRef}
                  autoPlay
                  playsInline
                  muted
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />

                {/* Face status overlay pill */}
                <div style={{
                  position: 'absolute', top: '0.75rem', left: '0.75rem',
                  display: 'flex', alignItems: 'center', gap: '0.375rem',
                  padding: '0.3rem 0.75rem', borderRadius: 20,
                  backdropFilter: 'blur(8px)',
                  fontSize: '0.72rem', fontWeight: 600,
                  ...(faceStatus === 'ready'
                    ? { background: 'rgba(16,185,129,0.85)', color: '#ffffff' }
                    : faceStatus === 'detected'
                    ? { background: 'rgba(251,191,36,0.85)', color: '#1a1b1e' }
                    : { background: 'rgba(30,32,36,0.85)', color: '#9aa0a6' }),
                  transition: 'all 0.3s ease',
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'currentColor', display: 'inline-block',
                    animation: faceStatus === 'ready' ? 'pulseDot 1.2s ease-in-out infinite alternate' : 'none',
                  }} />
                  {faceStatus === 'ready' ? '✓ Face detected'
                    : faceStatus === 'detected' ? 'Confirming…'
                    : faceStatus === 'no-face' ? 'No face — look at camera'
                    : '⏳ Loading detector…'}
                </div>

                {/* "LIVE" badge */}
                {precheckCameraOk && (
                  <div style={{
                    position: 'absolute', top: '0.75rem', right: '0.75rem',
                    background: 'rgba(234,67,53,0.9)', color: '#fff',
                    fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.08em',
                    padding: '0.2rem 0.5rem', borderRadius: 4,
                    display: 'flex', alignItems: 'center', gap: '0.25rem',
                  }}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff', display: 'inline-block', animation: 'pulseDot 1s ease-in-out infinite alternate' }} />
                    LIVE
                  </div>
                )}

                {/* Candidate name tag */}
                {session?.candidateName && (
                  <div style={{
                    position: 'absolute', bottom: '0.75rem', left: '0.75rem',
                    background: 'rgba(22,23,26,0.85)', backdropFilter: 'blur(8px)',
                    padding: '0.3rem 0.75rem', borderRadius: 8,
                    fontSize: '0.78125rem', fontWeight: 600, color: '#e8eaed',
                  }}>
                    👤 {session.candidateName}
                  </div>
                )}
              </div>

              {/* Device selectors */}
              <div style={{
                background: '#2c2d30', borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden',
              }}>
                {/* Camera row */}
                <div style={{
                  padding: '0.875rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex', alignItems: 'center', gap: '0.875rem',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                    background: precheckCameraOk ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.06)',
                    border: `1px solid ${precheckCameraOk ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.1)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
                  }}>📹</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.6875rem', color: '#9aa0a6', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Camera</div>
                    <select
                      value={selectedCamera}
                      onChange={(e) => handleCameraChange(e.target.value)}
                      style={{
                        width: '100%', background: '#1a1b1e', border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8, color: '#e8eaed', fontSize: '0.8125rem', padding: '0.35rem 0.625rem',
                        fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
                      }}
                    >
                      {cameras.map((c) => (
                        <option key={c.deviceId} value={c.deviceId}>{c.label || `Camera ${c.deviceId.slice(0, 8)}`}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                    background: precheckCameraOk ? '#10b981' : '#6b7280',
                    boxShadow: precheckCameraOk ? '0 0 8px rgba(16,185,129,0.6)' : 'none',
                    transition: 'all 0.3s ease',
                  }} />
                </div>

                {/* Microphone row */}
                <div style={{ padding: '0.875rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.875rem' }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                      background: precheckMicOk ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${precheckMicOk ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.1)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem',
                    }}>🎤</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.6875rem', color: '#9aa0a6', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>Microphone</div>
                      <select
                        value={selectedMic}
                        onChange={(e) => handleMicChange(e.target.value)}
                        style={{
                          width: '100%', background: '#1a1b1e', border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 8, color: '#e8eaed', fontSize: '0.8125rem', padding: '0.35rem 0.625rem',
                          fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
                        }}
                      >
                        {microphones.map((m) => (
                          <option key={m.deviceId} value={m.deviceId}>{m.label || `Mic ${m.deviceId.slice(0, 8)}`}</option>
                        ))}
                      </select>
                    </div>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                      background: precheckMicOk ? '#10b981' : '#6b7280',
                      boxShadow: precheckMicOk ? '0 0 8px rgba(16,185,129,0.6)' : 'none',
                      transition: 'all 0.3s ease',
                    }} />
                  </div>

                  {/* Live mic level bar */}
                  <div style={{ paddingLeft: '2.875rem' }}>
                    <div style={{ fontSize: '0.6875rem', color: '#6b7280', marginBottom: '0.3rem' }}>
                      {precheckMicOk ? 'Mic level detected' : 'Speak to test microphone…'}
                    </div>
                    <div style={{
                      height: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%', borderRadius: 4, transition: 'width 0.1s ease',
                        background: micLevel > 60 ? '#10b981' : micLevel > 25 ? '#fbbf24' : '#6b7280',
                        width: `${micLevel}%`,
                      }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Right: Info + Launch Panel ── */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Job info */}
              <div>
                <div style={{ fontSize: '0.75rem', color: '#9aa0a6', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.375rem' }}>
                  Interview for
                </div>
                <h2 style={{ color: '#e8eaed', fontSize: '1.625rem', fontWeight: 800, lineHeight: 1.2, marginBottom: '0.25rem' }}>
                  {session?.jobTitle || 'AI Candidate Interview'}
                </h2>
                {session?.candidateName && (
                  <p style={{ color: '#9aa0a6', fontSize: '0.875rem' }}>
                    Candidate: <strong style={{ color: '#e8eaed' }}>{session.candidateName}</strong>
                  </p>
                )}
              </div>

              {/* Checklist card */}
              <div style={{
                background: '#2c2d30', borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.07)', padding: '1rem 1.125rem',
                display: 'flex', flexDirection: 'column', gap: '0.625rem',
              }}>
                <div style={{ fontSize: '0.75rem', color: '#9aa0a6', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.125rem' }}>
                  System Check
                </div>
                {[
                  { ok: precheckCameraOk, label: 'Camera stream active', icon: '📹' },
                  { ok: precheckMicOk, label: 'Microphone detected', icon: '🎤' },
                  { ok: faceStatus === 'ready', label: 'Face in frame', icon: '👤' },
                ].map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.625rem 0.875rem', borderRadius: 10,
                    background: item.ok ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${item.ok ? 'rgba(16,185,129,0.25)' : 'rgba(255,255,255,0.06)'}`,
                    transition: 'all 0.3s ease',
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                      background: item.ok ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.875rem',
                    }}>{item.icon}</div>
                    <span style={{ flex: 1, fontSize: '0.875rem', color: item.ok ? '#e8eaed' : '#6b7280', fontWeight: 500 }}>
                      {item.label}
                    </span>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: item.ok ? '#10b981' : 'rgba(255,255,255,0.07)',
                      fontSize: '0.625rem', color: item.ok ? '#fff' : '#6b7280', fontWeight: 800,
                      boxShadow: item.ok ? '0 0 8px rgba(16,185,129,0.5)' : 'none',
                      transition: 'all 0.3s ease',
                    }}>
                      {item.ok ? '✓' : '○'}
                    </div>
                  </div>
                ))}
              </div>

              {/* Mode selector */}
              <div style={{
                background: '#2c2d30', borderRadius: 14,
                border: '1px solid rgba(255,255,255,0.07)', padding: '1rem 1.125rem',
              }}>
                <div style={{ fontSize: '0.75rem', color: '#9aa0a6', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                  Response Mode
                </div>
                <div style={{ display: 'flex', gap: '0.625rem' }}>
                  {[
                    { mode: 'auto_vad' as InputMode, icon: '⚡', title: 'Auto Speech', desc: 'Hands-free, auto-detects when you stop speaking' },
                    { mode: 'push_to_talk' as InputMode, icon: '🖐', title: 'Push to Talk', desc: 'Hold a button to record your answer' },
                  ].map(({ mode, icon, title, desc }) => (
                    <button
                      key={mode}
                      onClick={() => setInputMode(mode)}
                      style={{
                        flex: 1, padding: '0.875rem', borderRadius: 12, cursor: 'pointer',
                        background: inputMode === mode ? 'rgba(138,180,248,0.12)' : 'rgba(255,255,255,0.03)',
                        border: `2px solid ${inputMode === mode ? '#8ab4f8' : 'rgba(255,255,255,0.07)'}`,
                        textAlign: 'left', fontFamily: 'inherit',
                        boxShadow: inputMode === mode ? '0 0 16px rgba(138,180,248,0.2)' : 'none',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      <div style={{ fontSize: '1.25rem', marginBottom: '0.3rem' }}>{icon}</div>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: inputMode === mode ? '#8ab4f8' : '#e8eaed', marginBottom: '0.2rem' }}>{title}</div>
                      <div style={{ fontSize: '0.6875rem', color: '#9aa0a6', lineHeight: 1.4 }}>{desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tips */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem',
              }}>
                {[
                  { icon: '💡', text: 'Good lighting helps face detection' },
                  { icon: '🔇', text: 'Find a quiet environment' },
                  { icon: '📏', text: 'Sit 1–2 feet from camera' },
                  { icon: '⏱', text: `${session?.timeLimitMinutes || 20} min time limit` },
                ].map((tip, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.5rem 0.75rem', borderRadius: 10,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                    fontSize: '0.75rem', color: '#9aa0a6',
                  }}>
                    <span style={{ fontSize: '0.875rem' }}>{tip.icon}</span>
                    {tip.text}
                  </div>
                ))}
              </div>

              {/* Launch button */}
              <button
                onClick={handleStartInterview}
                disabled={!allReady}
                style={{
                  padding: '1rem 1.5rem', borderRadius: 14, border: 'none',
                  fontFamily: 'inherit', fontWeight: 800, fontSize: '1rem',
                  cursor: allReady ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.625rem',
                  transition: 'all 0.2s ease',
                  ...(allReady
                    ? {
                        background: 'linear-gradient(135deg, #1a73e8, #8ab4f8)',
                        color: '#ffffff',
                        boxShadow: '0 6px 24px rgba(26,115,232,0.45)',
                      }
                    : {
                        background: 'rgba(255,255,255,0.05)',
                        color: '#6b7280',
                        boxShadow: 'none',
                      }),
                }}
              >
                {!precheckCameraOk && !precheckMicOk
                  ? '⚠️ Complete hardware setup first'
                  : !precheckCameraOk
                  ? '📹 Waiting for camera…'
                  : !precheckMicOk
                  ? '🎤 Waiting for microphone…'
                  : faceStatus !== 'ready'
                  ? '👤 Position your face in the frame…'
                  : '🚀 Join Interview Now'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── INTERVIEW ──────────────────────────────────────────────────────────────
  if (step === 'interview' || step === 'processing') {
    const isProcessing = step === 'processing';
    const isListening = recordingState === 'listening_vad' || recordingState === 'recording';

    return (
      <div className="interview-room-page gmeet-theme interview-active">
        {/* Face Warning Modal */}
        {showFaceWarningModal && !terminated && (
          <div className="face-warning-modal-overlay" onClick={() => setShowFaceWarningModal(false)}>
            <div className="face-warning-modal" onClick={(e) => e.stopPropagation()}>
              <div className="face-warning-icon">⚠️</div>
              <h3>Candidate Out of Frame</h3>
              <p>Please align your face clearly in the camera view to avoid session termination.</p>
              <div className="face-warning-count">Warning {faceWarningCount} of {maxFaceWarnings}</div>
              <div className="face-warning-dots">
                {Array.from({ length: maxFaceWarnings }).map((_, i) => (
                  <div key={i} className={`face-warning-dot ${i < faceWarningCount ? 'active' : ''}`} />
                ))}
              </div>
              <button className="btn btn-primary" onClick={() => setShowFaceWarningModal(false)}>
                I am back in frame
              </button>
            </div>
          </div>
        )}

        {/* ─── Google Meet Top Bar ─── */}
        <div className="gmeet-topbar">
          <div className="gmeet-title">
            <span style={{ color: '#8ab4f8' }}>🔒</span>
            <span>Interview: {session?.jobTitle || 'AI Candidate Interview'}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            {/* Progress */}
            <div style={{
              background: '#3c4043', padding: '0.3rem 0.75rem', borderRadius: 20,
              fontSize: '0.78125rem', fontWeight: 600, color: '#8ab4f8'
            }}>
              Q {turnNumber} / {totalTurns}
            </div>

            {/* Timer */}
            <div style={{
              background: timerWarning ? 'rgba(234,67,53,0.2)' : '#3c4043',
              border: timerWarning ? '1px solid rgba(234,67,53,0.5)' : '1px solid transparent',
              padding: '0.3rem 0.75rem', borderRadius: 20,
              fontSize: '0.78125rem', fontWeight: 600,
              color: timerWarning ? '#f28b82' : '#e8eaed',
              transition: 'all 0.3s ease',
            }}>
              ⏱ {formatTime(timeLeft)}
            </div>

            {/* Face warnings */}
            {faceWarnings > 0 && (
              <div style={{
                background: 'rgba(242,139,130,0.15)', border: '1px solid rgba(242,139,130,0.4)',
                padding: '0.3rem 0.65rem', borderRadius: 20,
                fontSize: '0.72rem', fontWeight: 600, color: '#f28b82',
              }}>
                👁 {faceWarnings}/{maxFaceWarnings}
              </div>
            )}
          </div>
        </div>

        {/* ─── Main Grid Container ─── */}
        <div className="gmeet-grid-container">

          {/* ─── 2-Tile Video Grid ─── */}
          <div className="gmeet-video-grid">

            {/* ── Tile 1: AI Interviewer ── */}
            <div className={`gmeet-tile ${isPlayingTTS ? 'speaking' : ''}`}>
              {/* Status pill */}
              {isPlayingTTS && (
                <div className="gmeet-status-pill speaking">
                  <span className="pill-dot" />
                  Speaking
                </div>
              )}
              {isProcessing && (
                <div className="gmeet-status-pill processing">
                  <span className="pill-dot" />
                  Processing…
                </div>
              )}

              {/* AI orb + pulse rings */}
              <div className="gmeet-ai-avatar-wrap">
                <div className="gmeet-ai-ambient" />
                {isPlayingTTS && (
                  <>
                    <div className="gmeet-ai-ring" />
                    <div className="gmeet-ai-ring ring-2" />
                    <div className="gmeet-ai-ring ring-3" />
                  </>
                )}
                <div className={`gmeet-ai-orb ${isPlayingTTS ? 'speaking' : ''}`}>🤖</div>
              </div>

              {/* AI frequency visualizer bars */}
              {isPlayingTTS && (
                <div className="gmeet-ai-visualizer">
                  {aiVisualizerBars.map((h, i) => (
                    <div key={i} className="vbar" style={{ height: `${h}px` }} />
                  ))}
                </div>
              )}

              {/* Current question overlay */}
              {currentAIText && (
                <div className="gmeet-question-overlay">
                  <div className="gmeet-question-label">Current Question</div>
                  <div className="gmeet-question-text">{currentAIText}</div>
                </div>
              )}

              {/* Name tag */}
              <div className="gmeet-tile-name">
                <span>🤖 AI Interviewer (Host)</span>
                {isPlayingTTS && (
                  <div className="gmeet-wave-bars">
                    <div className="gmeet-wave-bar" />
                    <div className="gmeet-wave-bar" />
                    <div className="gmeet-wave-bar" />
                    <div className="gmeet-wave-bar" />
                  </div>
                )}
              </div>
            </div>

            {/* ── Tile 2: Candidate Video ── */}
            <div className={`gmeet-tile ${
              faceStatus === 'no-face' ? 'face-warning' :
              isListening ? 'speaking' : ''
            }`}>
              {/* Status pill */}
              {isListening && (
                <div className="gmeet-status-pill listening">
                  <span className="pill-dot" />
                  {recordingState === 'listening_vad' ? 'Listening…' : 'Recording'}
                </div>
              )}
              {faceStatus === 'no-face' && (
                <div className="gmeet-status-pill" style={{
                  background: 'rgba(242,139,130,0.18)',
                  border: '1px solid rgba(242,139,130,0.45)',
                  color: '#f28b82',
                }}>
                  <span className="pill-dot" />
                  Face Lost
                </div>
              )}

              {/* Camera + overlay canvas */}
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
              <canvas
                ref={overlayCanvasRef}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
              />

              {/* Mic volume meter */}
              {isListening && micLevel > 0 && (
                <div className="gmeet-mic-meter">
                  <div className="gmeet-mic-meter-fill" style={{ width: `${micLevel}%` }} />
                </div>
              )}

              {/* Live speech text */}
              {isListening && liveSpeechText && (
                <div className="gmeet-live-text">
                  "{liveSpeechText}"
                </div>
              )}

              {/* Turn error toast */}
              {turnError && (
                <div className="gmeet-error-toast">⚠️ {turnError}</div>
              )}

              {/* Name tag */}
              <div className="gmeet-tile-name">
                <span>👤 Candidate View</span>
                <span style={{
                  fontSize: '0.65rem',
                  color: faceStatus === 'ready' ? '#34d399' : '#f28b82',
                  fontWeight: 600,
                }}>
                  {faceStatus === 'ready' ? '● Tracked' : '● Lost'}
                </span>
              </div>
            </div>
          </div>

          {/* ─── Side Transcript Drawer ─── */}
          {showTranscript && (
            <div className="gmeet-side-panel">
              <div className="gmeet-panel-header">
                <span>In-call Messages</span>
                <button
                  onClick={() => setShowTranscript(false)}
                  style={{
                    background: 'none', border: 'none', color: '#9aa0a6',
                    cursor: 'pointer', fontSize: '1.1rem', padding: '0 0.25rem',
                    lineHeight: 1,
                  }}
                >✕</button>
              </div>

              <div className="gmeet-chat-scroll">
                {transcript.map((entry, i) => (
                  <div key={i} className={`gmeet-chat-msg ${entry.role}`}>
                    <div className="gmeet-chat-role">
                      {entry.role === 'ai' ? 'AI Interviewer' : 'You'}
                    </div>
                    <div className="gmeet-chat-bubble">{entry.content}</div>
                  </div>
                ))}

                {isProcessing && (
                  <div className="gmeet-chat-msg ai">
                    <div className="gmeet-chat-role">AI Interviewer</div>
                    <div className="gmeet-typing">
                      <span /><span /><span />
                    </div>
                  </div>
                )}
                <div ref={transcriptEndRef} />
              </div>
            </div>
          )}
        </div>

        {/* ─── Google Meet Bottom Control Bar ─── */}
        <div className="gmeet-control-bar">
          {/* Left: session label */}
          <div style={{
            fontSize: '0.8125rem', fontWeight: 500, color: '#9aa0a6',
            display: 'flex', alignItems: 'center', gap: '0.5rem'
          }}>
            AI Interview Session
          </div>

          {/* Center: action buttons */}
          <div className="gmeet-controls-center">
            {/* Mode switcher */}
            <div className="studio-mode-switcher">
              <button
                className={`mode-btn ${inputMode === 'auto_vad' ? 'active' : ''}`}
                onClick={() => setInputMode('auto_vad')}
                title="Hands-free auto detection"
              >
                ⚡ Auto
              </button>
              <button
                className={`mode-btn ${inputMode === 'push_to_talk' ? 'active' : ''}`}
                onClick={() => setInputMode('push_to_talk')}
                title="Hold button to speak"
              >
                🖐 PTT
              </button>
            </div>

            {/* Mic / PTT button */}
            {inputMode === 'push_to_talk' ? (
              <button
                className={`gmeet-btn-round ${recordingState === 'recording' ? 'recording' : ''}`}
                onMouseDown={handleStartRecording}
                onMouseUp={handleStopRecording}
                onMouseLeave={handleStopRecording}
                onTouchStart={(e) => { e.preventDefault(); handleStartRecording(); }}
                onTouchEnd={(e) => { e.preventDefault(); handleStopRecording(); }}
                disabled={isProcessing || isPlayingTTS}
                title={recordingState === 'recording' ? 'Release to send' : 'Hold to speak'}
              >
                {recordingState === 'recording' ? '🔴' : '🎙'}
              </button>
            ) : (
              <button
                className={`gmeet-btn-round ${isListening ? 'recording' : ''}`}
                disabled
                title={isListening ? 'Listening…' : 'Auto-mode active'}
                style={{ cursor: 'default' }}
              >
                {isListening ? '🎤' : '🎙'}
              </button>
            )}

            {/* Transcript toggle */}
            <button
              className="gmeet-btn-round"
              onClick={() => setShowTranscript(!showTranscript)}
              title="In-call messages"
              style={{
                background: showTranscript ? '#8ab4f8' : '#3c4043',
                color: showTranscript ? '#202124' : '#e8eaed',
              }}
            >
              💬
            </button>
          </div>

          {/* Right: End call */}
          <button
            className="gmeet-btn-endcall"
            onClick={() => {
              if (window.confirm('Are you sure you want to end the interview?')) {
                interviewApi.end(token!, 'COMPLETED').catch(() => {});
                stopInterviewCamera();
                setStep('completed');
              }
            }}
          >
            📞 Leave
          </button>
        </div>
      </div>
    );
  }

  // ── COMPLETED ──────────────────────────────────────────────────────────────
  if (step === 'completed') {
    const isFaceViolation = endReason === 'FACE_VIOLATION';
    const isTimeExceeded = endReason === 'TIME_EXCEEDED';

    return (
      <div className="interview-room-page studio-dark">
        <div className="interview-completed-card studio-card-glass">
          <div className="interview-completed-icon">
            {isFaceViolation ? '⚠️' : isTimeExceeded ? '⏰' : '🎉'}
          </div>

          <h2 style={{ marginBottom: '0.5rem', color: '#fff' }}>
            {isFaceViolation ? 'Interview Terminated' : isTimeExceeded ? 'Time Limit Exceeded' : 'Interview Completed!'}
          </h2>

          <p style={{ color: '#94a3b8', fontSize: '0.875rem', lineHeight: 1.65, marginBottom: '1.5rem', maxWidth: 420 }}>
            {isFaceViolation
              ? 'The interview session was concluded because your face was absent from the frame multiple times.'
              : isTimeExceeded
              ? 'The allocated interview time limit has concluded. Your answers have been recorded.'
              : 'Thank you for completing your interview! Your responses have been saved and an AI evaluation report is being generated.'}
          </p>

          {transcript.length > 0 && (
            <div className="completed-transcript">
              <div className="completed-transcript-header">Saved Session Transcript</div>
              <div className="completed-transcript-body">
                {transcript.map((entry, i) => (
                  <div key={i} className={`completed-transcript-entry ${entry.role}`}>
                    <span className="completed-entry-role">
                      {entry.role === 'ai' ? '🤖 AI' : '👤 You'}
                    </span>
                    <p className="completed-entry-text" style={{ color: '#e2e8f0' }}>{entry.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            className="btn btn-secondary btn-full"
            onClick={() => window.close()}
            style={{ marginTop: '1rem' }}
          >
            Close Window
          </button>
        </div>
      </div>
    );
  }

  return null;
};

export default InterviewRoomPage;
