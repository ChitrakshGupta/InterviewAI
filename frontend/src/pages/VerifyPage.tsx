import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FilesetResolver, FaceLandmarker, type FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { candidateApi } from '../api';
import { useTheme } from '../context/ThemeContext';

type Step = 'loading' | 'email' | 'camera' | 'ready' | 'error';
type FaceStatus = 'initializing' | 'no-face' | 'detected' | 'ready';

interface JobInfo {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  companyLogo?: string;
  language?: string;
  linkExpiresAt?: string;
  hoursLeft?: number;
  minutesLeft?: number;
}

// ─── MediaPipe WASM + model hosted on CDN ────────────────────────────────────
const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const FACE_LANDMARKER_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// Stable frames required before enabling capture (avoids flash detections)
const STABLE_FRAMES_NEEDED = 8;

const VerifyPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();

  const [step, setStep] = useState<Step>('loading');
  const [info, setInfo] = useState<JobInfo | null>(null);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // MediaPipe face detection state
  const [faceStatus, setFaceStatus] = useState<FaceStatus>('initializing');
  const [mpLoading, setMpLoading] = useState(true);
  const [stableCount, setStableCount] = useState(0);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const stableCountRef = useRef(0);
  const cameraActiveRef = useRef(false);

  // ── Load token info ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) { setStep('error'); setErrorMsg('Invalid link.'); return; }
    candidateApi.getTokenInfo(token)
      .then((r) => { setInfo(r.data.data); setStep('email'); })
      .catch((err) => {
        const msg = err?.response?.data?.message || 'This link is invalid or has expired.';
        setErrorMsg(msg);
        setStep('error');
      });
  }, [token]);

  // ── Expiry label helper ─────────────────────────────────────────────────────
  const getExpiryLabel = (info: JobInfo | null): string | null => {
    if (!info?.linkExpiresAt) return null;
    const h = info.hoursLeft ?? 0;
    const m = info.minutesLeft ?? 0;
    if (h <= 0 && m <= 0) return 'Expiring soon';
    if (h >= 24) return `Expires in ${Math.floor(h / 24)}d ${h % 24}h`;
    if (h > 0) return `Expires in ${h}h ${m}m`;
    return `Expires in ${m}m`;
  };

  // ── Initialize MediaPipe FaceLandmarker ─────────────────────────────────────
  const initMediaPipe = useCallback(async () => {
    try {
      setMpLoading(true);
      setFaceStatus('initializing');
      const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM);
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: FACE_LANDMARKER_MODEL, delegate: 'GPU' },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFacialTransformationMatrixes: false,
        outputFaceBlendshapes: false,
      });
      landmarkerRef.current = landmarker;
      setMpLoading(false);
      setFaceStatus('no-face');
    } catch (e) {
      console.error('MediaPipe init error:', e);
      setMpLoading(false);
      setFaceStatus('no-face'); // gracefully degrade — still allow capture
    }
  }, []);

  // ── Start camera ─────────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      cameraActiveRef.current = true;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise<void>((res) => {
          videoRef.current!.onloadedmetadata = () => res();
        });
        videoRef.current.play();
      }
    } catch {
      setErrorMsg('Camera access denied. Please allow camera permissions and try again.');
    }
  }, []);

  // ── Stop camera ──────────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    cameraActiveRef.current = false;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // ── Detection loop — draws coloured oval overlay ─────────────────────────────
  const runDetection = useCallback(() => {
    if (!cameraActiveRef.current) return;
    const video = videoRef.current;
    const overlay = overlayCanvasRef.current;
    const lm = landmarkerRef.current;

    if (!video || !overlay || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(runDetection);
      return;
    }

    // Size overlay to match video
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (overlay.width !== vw) overlay.width = vw;
    if (overlay.height !== vh) overlay.height = vh;

    const ctx = overlay.getContext('2d')!;
    ctx.clearRect(0, 0, vw, vh);

    let faceDetected = false;

    if (lm && vw > 0 && vh > 0) {
      let result: FaceLandmarkerResult;
      try {
        result = lm.detectForVideo(video, performance.now());
        faceDetected = result.faceLandmarks.length > 0;
      } catch {
        faceDetected = false;
      }

      if (faceDetected) {
        const lms = result!.faceLandmarks[0];

        // Compute bounding box from all landmarks
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        lms.forEach(({ x, y }) => {
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        });

        const padX = (maxX - minX) * 0.18;
        const padY = (maxY - minY) * 0.22;
        const rx = ((maxX - minX + padX * 2) / 2) * vw;
        const ry = ((maxY - minY + padY * 2) / 2) * vh;
        const cx = ((minX + maxX) / 2) * vw;
        const cy = ((minY + maxY) / 2) * vh;

        // Stable-count logic
        stableCountRef.current = Math.min(stableCountRef.current + 1, STABLE_FRAMES_NEEDED);
        setStableCount(stableCountRef.current);

        const isReady = stableCountRef.current >= STABLE_FRAMES_NEEDED;
        const color = isReady ? '#10b981' : '#f59e0b';
        const glowColor = isReady ? 'rgba(16,185,129,0.35)' : 'rgba(245,158,11,0.25)';

        // Glow
        ctx.save();
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 22;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();

        // Corner arcs
        const drawCornerArc = (startAngle: number, endAngle: number) => {
          ctx.save();
          ctx.shadowColor = glowColor;
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx + 8, ry + 8, 0, startAngle, endAngle);
          ctx.strokeStyle = color;
          ctx.lineWidth = 5;
          ctx.lineCap = 'round';
          ctx.stroke();
          ctx.restore();
        };
        drawCornerArc(-0.3, 0.3);
        drawCornerArc(Math.PI - 0.3, Math.PI + 0.3);

        // Status badge
        const label = isReady ? '✓ Face detected — click to capture' : 'Hold still…';
        const badgeW = ctx.measureText(label).width + 28;
        const badgeH = 26;
        const bx = cx - badgeW / 2;
        const by = cy + ry + 14;
        ctx.fillStyle = isReady ? 'rgba(16,185,129,0.85)' : 'rgba(245,158,11,0.8)';
        ctx.beginPath();
        (ctx as unknown as CanvasRenderingContext2D & { roundRect: (x:number,y:number,w:number,h:number,r:number)=>void }).roundRect(bx, by, badgeW, badgeH, 13);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 12px system-ui';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, bx + 14, by + badgeH / 2);

        setFaceStatus(isReady ? 'ready' : 'detected');
      } else {
        stableCountRef.current = 0;
        setStableCount(0);
        setFaceStatus('no-face');

        // Draw dim oval guide
        ctx.save();
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.ellipse(vw / 2, vh / 2, vw * 0.26, vh * 0.36, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(148,163,184,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // "No face" hint
        const hint = 'Position your face in the oval';
        const hintW = ctx.measureText(hint).width + 24;
        const hx = vw / 2 - hintW / 2;
        const hy = vh / 2 + vh * 0.36 + 12;
        ctx.fillStyle = 'rgba(30,30,50,0.75)';
        ctx.beginPath();
        (ctx as unknown as CanvasRenderingContext2D & { roundRect: (x:number,y:number,w:number,h:number,r:number)=>void }).roundRect(hx, hy, hintW, 24, 12);
        ctx.fill();
        ctx.fillStyle = 'rgba(148,163,184,0.9)';
        ctx.font = '11px system-ui';
        ctx.textBaseline = 'middle';
        ctx.fillText(hint, hx + 12, hy + 12);
      }
    } else if (!lm) {
      // If MediaPipe didn't load — just draw dashed guide oval
      ctx.save();
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.ellipse(vw / 2, vh / 2, vw * 0.26, vh * 0.36, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(99,102,241,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      faceDetected = true; // degrade gracefully
      stableCountRef.current = STABLE_FRAMES_NEEDED;
      setFaceStatus('ready');
    }

    rafRef.current = requestAnimationFrame(runDetection);
  }, []);

  // ── Camera step lifecycle ────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'camera') return;
    stableCountRef.current = 0;
    setStableCount(0);
    setFaceStatus('initializing');

    let cancelled = false;
    (async () => {
      await Promise.all([startCamera(), initMediaPipe()]);
      if (!cancelled) {
        rafRef.current = requestAnimationFrame(runDetection);
      }
    })();

    return () => {
      cancelled = true;
      stopCamera();
      if (landmarkerRef.current) {
        landmarkerRef.current.close();
        landmarkerRef.current = null;
      }
    };
  }, [step]);

  // ── Capture photo (only when face confirmed) ─────────────────────────────────
  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) {
        setPhoto(blob);
        setPhotoPreview(URL.createObjectURL(blob));
        stopCamera();
      }
    }, 'image/jpeg', 0.92);
  }, [stopCamera]);

  const retake = useCallback(() => {
    setPhoto(null);
    setPhotoPreview('');
    stableCountRef.current = 0;
    setStableCount(0);
    setFaceStatus('initializing');
    (async () => {
      await Promise.all([startCamera(), initMediaPipe()]);
      rafRef.current = requestAnimationFrame(runDetection);
    })();
  }, [startCamera, initMediaPipe, runDetection]);

  // ── Email verify ─────────────────────────────────────────────────────────────
  const handleVerifyEmail = async () => {
    setEmailError('');
    if (!email) { setEmailError('Email is required.'); return; }
    if (!email.includes('@')) { setEmailError('Enter a valid email.'); return; }
    setVerifying(true);
    try {
      const { data } = await candidateApi.verifyToken(token!, email);
      setInfo(data.data);
      setStep('camera');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setEmailError(msg || 'Email verification failed.');
    } finally {
      setVerifying(false);
    }
  };

  // ── Upload photo ─────────────────────────────────────────────────────────────
  const handleUploadPhoto = async () => {
    if (!photo) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('photo', photo, 'verification.jpg');
      await candidateApi.uploadPhoto(token!, fd);
      setStep('ready');
    } catch {
      setErrorMsg('Failed to upload photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // ── UI helpers ───────────────────────────────────────────────────────────────
  const stepIndex = { email: 0, camera: 1, ready: 2 } as Record<string, number>;
  const currentStep = stepIndex[step] ?? 0;
  const STEPS = ['Verify Email', 'Take Photo', 'Start Interview'];

  const StepsBar = () => (
    <div className="verify-steps-bar">
      {STEPS.map((label, i) => (
        <React.Fragment key={i}>
          <div className="vstep">
            <div className={`vstep-circle ${i < currentStep ? 'done' : i === currentStep ? 'current' : 'todo'}`}>
              {i < currentStep ? '✓' : i + 1}
            </div>
            <span className="vstep-label">{label}</span>
          </div>
          {i < STEPS.length - 1 && <div className="vstep-sep" />}
        </React.Fragment>
      ))}
    </div>
  );

  const Header = () => (
    <div className="verify-header">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <div className="verify-company">
          <div className="verify-company-logo">
            {info?.companyLogo ? (
              <img src={info.companyLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius)' }} />
            ) : '🏢'}
          </div>
          <span className="verify-company-name">{info?.companyName}</span>
        </div>
        <button className="theme-toggle" onClick={toggle}>{theme === 'dark' ? '☀' : '☾'}</button>
      </div>
      <div className="verify-job-title">{info?.jobTitle}</div>
      {info?.candidateName && (
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
          Hi {info.candidateName}, please complete verification to begin.
        </div>
      )}
    </div>
  );

  // ── Face status bar ──────────────────────────────────────────────────────────
  const FaceStatusBar = () => {
    const configs: Record<FaceStatus, { color: string; bg: string; border: string; icon: string; label: string }> = {
      initializing: { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.2)', icon: '⏳', label: 'Loading face detection…' },
      'no-face':    { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)',  icon: '👤', label: 'No face detected — look at the camera' },
      detected:     { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)',  icon: '🔍', label: `Confirming… (${Math.round((stableCount / STABLE_FRAMES_NEEDED) * 100)}%)` },
      ready:        { color: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.25)',  icon: '✓',  label: 'Live face confirmed — ready to capture!' },
    };
    const c = configs[faceStatus];
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        background: c.bg, border: `1px solid ${c.border}`,
        borderRadius: '2rem', padding: '0.375rem 0.875rem',
        fontSize: '0.75rem', color: c.color, marginBottom: '0.75rem',
        fontWeight: 500, transition: 'all 0.3s ease',
      }}>
        <span>{c.icon}</span>
        <span>{c.label}</span>
        {faceStatus === 'detected' && (
          <div style={{ flex: 1, height: 4, background: 'rgba(245,158,11,0.2)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${(stableCount / STABLE_FRAMES_NEEDED) * 100}%`,
              background: '#f59e0b', borderRadius: 4,
              transition: 'width 0.15s ease',
            }} />
          </div>
        )}
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════════

  if (step === 'loading') {
    return (
      <div className="verify-page">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <div className="spinner" />
          <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading your interview…</span>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    const isExpired = errorMsg.toLowerCase().includes('expired');
    return (
      <div className="verify-page">
        <div style={{ textAlign: 'center', maxWidth: 380 }}>
          <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>{isExpired ? '⏰' : '🔗'}</div>
          <h2 style={{ marginBottom: '0.5rem' }}>{isExpired ? 'Link Expired' : 'Link Invalid'}</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', lineHeight: 1.6 }}>{errorMsg}</p>
          {isExpired && (
            <div style={{
              marginTop: '1.25rem',
              background: 'rgba(245, 158, 11, 0.08)',
              border: '1px solid rgba(245, 158, 11, 0.25)',
              borderRadius: 'var(--radius)',
              padding: '0.75rem 1rem',
              fontSize: '0.8125rem',
              color: '#f59e0b',
            }}>
              💡 Interview links are valid for <strong>2 days</strong> from when they are sent. Please ask your HR to resend the invitation.
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step === 'email') {
    return (
      <div className="verify-page">
        <div className="verify-box">
          <Header />
          <StepsBar />
          <div className="verify-body">
            <h3 style={{ marginBottom: '0.375rem' }}>Verify your email</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
              Enter the email address that the HR team used to invite you.
            </p>

            {getExpiryLabel(info) && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '2rem', padding: '0.25rem 0.75rem',
                fontSize: '0.75rem', color: '#10b981', marginBottom: '1rem',
                fontWeight: 500,
              }}>
                <span>⏱</span> {getExpiryLabel(info)} · Link valid for 2 days
              </div>
            )}

            {emailError && (
              <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                <span>⚠</span> {emailError}
              </div>
            )}

            <div className="form-field">
              <label className="form-label">Your Email</label>
              <input
                type="email"
                className={`form-input${emailError ? ' is-error' : ''}`}
                placeholder="you@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleVerifyEmail()}
                autoFocus
              />
            </div>

            <button className="btn btn-primary btn-full" onClick={handleVerifyEmail} disabled={verifying}>
              {verifying && <span className="btn-spinner" />}
              {verifying ? 'Verifying…' : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'camera') {
    return (
      <div className="verify-page">
        <div className="verify-box">
          <Header />
          <StepsBar />
          <div className="verify-body">
            <h3 style={{ marginBottom: '0.375rem' }}>Take a live selfie</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginBottom: '0.75rem' }}>
              MediaPipe detects your face in real-time. Once confirmed, click to capture.
            </p>

            {!photo && <FaceStatusBar />}

            {errorMsg && (
              <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                <span>⚠</span> {errorMsg}
              </div>
            )}

            {/* Camera / preview container */}
            <div className="camera-wrap" style={{ marginBottom: '0.75rem', position: 'relative' }}>
              {!photo ? (
                <>
                  {/* Live video feed */}
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                  {/* MediaPipe overlay canvas — sits on top of video */}
                  <canvas
                    ref={overlayCanvasRef}
                    style={{
                      position: 'absolute', inset: 0,
                      width: '100%', height: '100%',
                      pointerEvents: 'none',
                    }}
                  />
                  {/* Loading overlay while MP initialises */}
                  {mpLoading && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      background: 'rgba(15,15,20,0.65)',
                      gap: '0.5rem',
                    }}>
                      <div className="spinner" />
                      <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>Loading face detector…</span>
                    </div>
                  )}
                </>
              ) : (
                /* Captured photo preview */
                <img
                  src={photoPreview}
                  alt="captured"
                  className="captured-img"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              )}
            </div>

            {/* Hidden capture canvas */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {!photo ? (
                <button
                  className="btn btn-primary btn-full"
                  onClick={capturePhoto}
                  disabled={faceStatus !== 'ready'}
                  style={{
                    opacity: faceStatus === 'ready' ? 1 : 0.5,
                    transition: 'opacity 0.3s ease',
                  }}
                >
                  {faceStatus === 'ready' ? '📸 Capture Photo' : faceStatus === 'initializing' ? 'Loading…' : 'Waiting for face…'}
                </button>
              ) : (
                <>
                  <button className="btn btn-secondary" onClick={retake}>Retake</button>
                  <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleUploadPhoto} disabled={uploading}>
                    {uploading && <span className="btn-spinner" />}
                    {uploading ? 'Submitting…' : 'Looks good, continue →'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'ready') {
    return (
      <div className="verify-page">
        <div className="verify-box">
          <Header />
          <StepsBar />
          <div className="verify-body" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>✓</div>
            <h3 style={{ marginBottom: '0.5rem' }}>You're verified!</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', marginBottom: '1.5rem' }}>
              Your identity has been verified. Click below to begin your AI interview for{' '}
              <strong>{info?.jobTitle}</strong>.
            </p>

            <div style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', padding: '0.75rem', marginBottom: '1.25rem',
              display: 'flex', gap: '0.5rem', alignItems: 'center', textAlign: 'left'
            }}>
              <span>ℹ</span>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                You'll need to allow <strong>microphone access</strong> during the interview.
                Find a quiet place before starting.
              </span>
            </div>

            <button
              className="btn btn-primary btn-full btn-lg"
              onClick={() => navigate(`/interview/room/${token}`)}
            >
              Start Interview →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default VerifyPage;
