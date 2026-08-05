import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FilesetResolver, FaceLandmarker, type FaceLandmarkerResult } from '@mediapipe/tasks-vision';
import { candidateApi } from '../api';

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

const MEDIAPIPE_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm';
const FACE_LANDMARKER_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const STABLE_FRAMES_NEEDED = 8;

const VerifyPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('loading');
  const [info, setInfo] = useState<JobInfo | null>(null);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [faceStatus, setFaceStatus] = useState<FaceStatus>('initializing');
  const [mpLoading, setMpLoading] = useState(true);
  const [stableCount, setStableCount] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const landmarkerRef = useRef<FaceLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  const stableCountRef = useRef(0);
  const cameraActiveRef = useRef(false);

  // ── Load token info ──────────────────────────────────────────────────────────
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

  const getExpiryLabel = (info: JobInfo | null): string | null => {
    if (!info?.linkExpiresAt) return null;
    const h = info.hoursLeft ?? 0;
    const m = info.minutesLeft ?? 0;
    if (h <= 0 && m <= 0) return 'Expiring soon';
    if (h >= 24) return `Expires in ${Math.floor(h / 24)}d ${h % 24}h`;
    if (h > 0) return `Expires in ${h}h ${m}m`;
    return `Expires in ${m}m`;
  };

  // ── MediaPipe ────────────────────────────────────────────────────────────────
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
      setFaceStatus('no-face');
    }
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      cameraActiveRef.current = true;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await new Promise<void>((res) => { videoRef.current!.onloadedmetadata = () => res(); });
        videoRef.current.play();
      }
    } catch {
      setErrorMsg('Camera access denied. Please allow camera permissions and try again.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    cameraActiveRef.current = false;
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const runDetection = useCallback(() => {
    if (!cameraActiveRef.current) return;
    const video = videoRef.current;
    const overlay = overlayCanvasRef.current;
    const lm = landmarkerRef.current;

    if (!video || !overlay || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(runDetection);
      return;
    }

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

        stableCountRef.current = Math.min(stableCountRef.current + 1, STABLE_FRAMES_NEEDED);
        setStableCount(stableCountRef.current);

        const isReady = stableCountRef.current >= STABLE_FRAMES_NEEDED;
        const color = isReady ? '#10b981' : '#f59e0b';
        const glowColor = isReady ? 'rgba(16,185,129,0.4)' : 'rgba(245,158,11,0.3)';

        ctx.save();
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 24;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();

        const drawCornerArc = (startAngle: number, endAngle: number) => {
          ctx.save();
          ctx.shadowColor = glowColor;
          ctx.shadowBlur = 16;
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

        const label = isReady ? '✓ Face confirmed — click Capture' : 'Hold still…';
        const badgeW = ctx.measureText(label).width + 28;
        const badgeH = 28;
        const bx = cx - badgeW / 2;
        const by = cy + ry + 14;
        ctx.fillStyle = isReady ? 'rgba(16,185,129,0.9)' : 'rgba(245,158,11,0.85)';
        ctx.beginPath();
        (ctx as any).roundRect(bx, by, badgeW, badgeH, 14);
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

        ctx.save();
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.ellipse(vw / 2, vh / 2, vw * 0.26, vh * 0.36, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(138, 180, 248, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        const hint = 'Position your face in the oval';
        const hintW = ctx.measureText(hint).width + 24;
        const hx = vw / 2 - hintW / 2;
        const hy = vh / 2 + vh * 0.36 + 12;
        ctx.fillStyle = 'rgba(22, 23, 26, 0.85)';
        ctx.beginPath();
        (ctx as any).roundRect(hx, hy, hintW, 26, 13);
        ctx.fill();
        ctx.fillStyle = 'rgba(232, 234, 237, 0.9)';
        ctx.font = '12px system-ui';
        ctx.textBaseline = 'middle';
        ctx.fillText(hint, hx + 12, hy + 13);
      }
    } else if (!lm) {
      ctx.save();
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.ellipse(vw / 2, vh / 2, vw * 0.26, vh * 0.36, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(138, 180, 248, 0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
      faceDetected = true;
      stableCountRef.current = STABLE_FRAMES_NEEDED;
      setFaceStatus('ready');
    }

    rafRef.current = requestAnimationFrame(runDetection);
  }, []);

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

  const handleVerifyEmail = async () => {
    setEmailError('');
    if (!email) { setEmailError('Email is required.'); return; }
    if (!email.includes('@')) { setEmailError('Enter a valid email address.'); return; }
    setVerifying(true);
    try {
      const { data } = await candidateApi.verifyToken(token!, email);
      setInfo(data.data);
      setStep('camera');
    } catch (err: unknown) {
      const msg = (err as any)?.response?.data?.message;
      setEmailError(msg || 'Email verification failed. Please check and try again.');
    } finally {
      setVerifying(false);
    }
  };

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

  // ── Step bar ─────────────────────────────────────────────────────────────────
  const STEPS = ['Verify Email', 'Take Photo', 'Start Interview'];
  const stepIndex = { email: 0, camera: 1, ready: 2 } as Record<string, number>;
  const currentStepIdx = stepIndex[step] ?? 0;

  // ── RENDER ───────────────────────────────────────────────────────────────────

  if (step === 'loading') {
    return (
      <div style={vPageStyle}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <div style={orbStyle}>🤖</div>
          <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
          <span style={{ color: '#9aa0a6', fontSize: '0.875rem' }}>Loading your interview…</span>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    const isExpired = errorMsg.toLowerCase().includes('expired');
    return (
      <div style={vPageStyle}>
        <div style={{ ...cardStyle, textAlign: 'center', maxWidth: 400 }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{isExpired ? '⏰' : '🔗'}</div>
          <h2 style={{ color: '#e8eaed', marginBottom: '0.5rem', fontSize: '1.375rem' }}>
            {isExpired ? 'Link Expired' : 'Invalid Link'}
          </h2>
          <p style={{ color: '#9aa0a6', fontSize: '0.875rem', lineHeight: 1.65, marginBottom: '1.25rem' }}>{errorMsg}</p>
          {isExpired && (
            <div style={infoBadgeStyle}>
              💡 Interview links are valid for <strong style={{ color: '#8ab4f8' }}>2 days</strong> from when they are sent. Please ask your HR to resend the invitation.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={vPageStyle}>
      {/* Left ambient blob */}
      <div style={blobLeft} />
      <div style={blobRight} />

      <div style={cardStyle}>
        {/* ── Company Header ── */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={logoStyle}>
              {info?.companyLogo
                ? <img src={info.companyLogo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 10 }} />
                : <span style={{ fontSize: '1.5rem' }}>🏢</span>}
            </div>
            <div>
              <div style={{ fontSize: '0.8125rem', color: '#9aa0a6', fontWeight: 500 }}>{info?.companyName}</div>
              <div style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#e8eaed', lineHeight: 1.2 }}>{info?.jobTitle}</div>
            </div>
          </div>
          {getExpiryLabel(info) && (
            <div style={timerBadgeStyle}>
              ⏱ {getExpiryLabel(info)}
            </div>
          )}
        </div>

        {info?.candidateName && (
          <div style={{ padding: '0 1.5rem', marginBottom: '1rem' }}>
            <div style={{
              background: 'rgba(138, 180, 248, 0.08)',
              border: '1px solid rgba(138, 180, 248, 0.18)',
              borderRadius: 10, padding: '0.625rem 1rem',
              fontSize: '0.875rem', color: '#8ab4f8',
              display: 'flex', alignItems: 'center', gap: '0.5rem'
            }}>
              👋 Hi <strong>{info.candidateName}</strong>, complete verification to begin your interview.
            </div>
          </div>
        )}

        {/* ── Step Progress Bar ── */}
        <div style={{ padding: '0 1.5rem 1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {STEPS.map((label, i) => (
              <React.Fragment key={i}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.375rem', flex: 'none' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.8125rem', fontWeight: 700,
                    background: i < currentStepIdx ? '#10b981' : i === currentStepIdx ? '#8ab4f8' : 'rgba(255,255,255,0.08)',
                    color: i <= currentStepIdx ? '#202124' : '#6b7280',
                    border: `2px solid ${i < currentStepIdx ? '#10b981' : i === currentStepIdx ? '#8ab4f8' : 'rgba(255,255,255,0.12)'}`,
                    transition: 'all 0.3s ease',
                    boxShadow: i === currentStepIdx ? '0 0 14px rgba(138,180,248,0.45)' : 'none',
                  }}>
                    {i < currentStepIdx ? '✓' : i + 1}
                  </div>
                  <span style={{ fontSize: '0.625rem', fontWeight: 600, color: i === currentStepIdx ? '#8ab4f8' : '#6b7280', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
                    {label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div style={{
                    flex: 1, height: 2, marginBottom: 18,
                    background: i < currentStepIdx ? '#10b981' : 'rgba(255,255,255,0.08)',
                    transition: 'background 0.3s ease',
                  }} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* ── Step Content ── */}
        <div style={{ padding: '0 1.5rem 1.5rem' }}>

          {/* ─ Email Step ─ */}
          {step === 'email' && (
            <div>
              <h3 style={stepTitleStyle}>Verify your email</h3>
              <p style={stepDescStyle}>Enter the email address the HR team used to invite you for this position.</p>

              {emailError && (
                <div style={errorBadgeStyle}>
                  ⚠️ {emailError}
                </div>
              )}

              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Email Address</label>
                <input
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleVerifyEmail()}
                  autoFocus
                  style={{
                    ...inputStyle,
                    borderColor: emailError ? '#f28b82' : 'rgba(255,255,255,0.12)',
                    outline: emailError ? '2px solid rgba(242,139,130,0.3)' : 'none',
                  }}
                />
              </div>

              <button
                onClick={handleVerifyEmail}
                disabled={verifying}
                style={{ ...primaryBtnStyle, opacity: verifying ? 0.75 : 1 }}
              >
                {verifying && <span style={spinnerStyle} />}
                {verifying ? 'Verifying…' : 'Continue →'}
              </button>

              <div style={{ marginTop: '1.25rem', display: 'flex', gap: '1rem' }}>
                {[
                  { icon: '🔒', text: 'Secure & encrypted' },
                  { icon: '🤖', text: 'AI-powered interview' },
                  { icon: '📋', text: 'Takes 15–30 minutes' },
                ].map((item, i) => (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '0.75rem 0.5rem' }}>
                    <span style={{ fontSize: '1.25rem' }}>{item.icon}</span>
                    <span style={{ fontSize: '0.625rem', color: '#9aa0a6', textAlign: 'center', fontWeight: 500 }}>{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ─ Camera Step ─ */}
          {step === 'camera' && (
            <div>
              <h3 style={stepTitleStyle}>Live face verification</h3>
              <p style={stepDescStyle}>Our AI will confirm your identity before the interview begins.</p>

              {/* Face status pill */}
              {!photo && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.4rem 0.875rem', borderRadius: 20, marginBottom: '0.875rem',
                  fontSize: '0.78125rem', fontWeight: 600,
                  ...(faceStatus === 'ready'
                    ? { background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.35)', color: '#34d399' }
                    : faceStatus === 'detected'
                    ? { background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24' }
                    : { background: 'rgba(138,180,248,0.08)', border: '1px solid rgba(138,180,248,0.2)', color: '#8ab4f8' }),
                  transition: 'all 0.3s ease',
                }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'currentColor', display: 'inline-block', animation: 'pulseDot 1.1s ease-in-out infinite alternate', flexShrink: 0 }} />
                  {faceStatus === 'ready' ? '✓ Face confirmed — ready to capture!'
                    : faceStatus === 'detected' ? `Confirming… (${Math.round((stableCount / STABLE_FRAMES_NEEDED) * 100)}%)`
                    : faceStatus === 'no-face' ? '👤 Position your face in the frame'
                    : '⏳ Loading face detector…'}
                  {faceStatus === 'detected' && (
                    <div style={{ flex: 1, height: 3, background: 'rgba(251,191,36,0.2)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(stableCount / STABLE_FRAMES_NEEDED) * 100}%`, background: '#fbbf24', borderRadius: 3, transition: 'width 0.15s ease' }} />
                    </div>
                  )}
                </div>
              )}

              {errorMsg && <div style={{ ...errorBadgeStyle, marginBottom: '0.875rem' }}>⚠️ {errorMsg}</div>}

              {/* Camera feed */}
              <div style={{
                position: 'relative', width: '100%', aspectRatio: '4/3',
                borderRadius: 14, overflow: 'hidden', marginBottom: '1rem',
                background: '#1a1b1e',
                border: `2px solid ${faceStatus === 'ready' ? 'rgba(16,185,129,0.5)' : faceStatus === 'no-face' && !photo ? 'rgba(138,180,248,0.25)' : 'rgba(255,255,255,0.08)'}`,
                boxShadow: faceStatus === 'ready' ? '0 0 20px rgba(16,185,129,0.2)' : 'none',
                transition: 'border-color 0.3s ease, box-shadow 0.3s ease',
              }}>
                {!photo ? (
                  <>
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
                    {mpLoading && (
                      <div style={{
                        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(22, 23, 26, 0.75)', gap: '0.75rem',
                      }}>
                        <div className="spinner" style={{ width: 28, height: 28, borderWidth: 3 }} />
                        <span style={{ color: '#9aa0a6', fontSize: '0.8125rem' }}>Loading face detector…</span>
                      </div>
                    )}
                  </>
                ) : (
                  <img src={photoPreview} alt="captured" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                )}
              </div>

              <canvas ref={canvasRef} style={{ display: 'none' }} />

              {/* Action buttons */}
              {!photo ? (
                <button
                  onClick={capturePhoto}
                  disabled={faceStatus !== 'ready'}
                  style={{
                    ...primaryBtnStyle,
                    opacity: faceStatus === 'ready' ? 1 : 0.45,
                    cursor: faceStatus === 'ready' ? 'pointer' : 'not-allowed',
                    background: faceStatus === 'ready'
                      ? 'linear-gradient(135deg, #10b981, #059669)'
                      : 'rgba(255,255,255,0.06)',
                    boxShadow: faceStatus === 'ready' ? '0 4px 20px rgba(16,185,129,0.4)' : 'none',
                  }}
                >
                  {faceStatus === 'ready' ? '📸 Capture Photo' : faceStatus === 'initializing' ? 'Loading…' : '👤 Waiting for face…'}
                </button>
              ) : (
                <div style={{ display: 'flex', gap: '0.625rem' }}>
                  <button onClick={retake} style={secondaryBtnStyle}>
                    ↩ Retake
                  </button>
                  <button
                    onClick={handleUploadPhoto}
                    disabled={uploading}
                    style={{ ...primaryBtnStyle, flex: 1, opacity: uploading ? 0.75 : 1 }}
                  >
                    {uploading && <span style={spinnerStyle} />}
                    {uploading ? 'Submitting…' : 'Looks good, continue →'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ─ Ready Step ─ */}
          {step === 'ready' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 80, height: 80, borderRadius: '50%', margin: '0 auto 1.25rem',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '2rem',
                boxShadow: '0 0 0 8px rgba(16,185,129,0.12), 0 0 40px rgba(16,185,129,0.35)',
                animation: 'orbBreathing 3s ease-in-out infinite',
              }}>✓</div>

              <h3 style={{ ...stepTitleStyle, textAlign: 'center', fontSize: '1.375rem' }}>You're verified!</h3>
              <p style={{ ...stepDescStyle, textAlign: 'center', marginBottom: '1.5rem' }}>
                Identity confirmed. Click below to begin your AI interview for{' '}
                <strong style={{ color: '#e8eaed' }}>{info?.jobTitle}</strong> at {info?.companyName}.
              </p>

              {/* Tips grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', marginBottom: '1.5rem' }}>
                {[
                  { icon: '🎤', title: 'Quiet space', desc: 'Find a quiet environment' },
                  { icon: '💡', title: 'Good lighting', desc: 'Face the light source' },
                  { icon: '📷', title: 'Camera on', desc: 'Keep camera enabled' },
                  { icon: '⏱', title: '15–30 min', desc: 'Set aside uninterrupted time' },
                ].map((tip, i) => (
                  <div key={i} style={{
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 12, padding: '0.875rem', textAlign: 'left',
                  }}>
                    <div style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{tip.icon}</div>
                    <div style={{ fontSize: '0.78125rem', fontWeight: 700, color: '#e8eaed', marginBottom: '0.1rem' }}>{tip.title}</div>
                    <div style={{ fontSize: '0.6875rem', color: '#9aa0a6' }}>{tip.desc}</div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => navigate(`/interview/room/${token}`)}
                style={{ ...primaryBtnStyle, fontSize: '1rem', padding: '0.875rem 1.5rem' }}
              >
                🚀 Start Interview
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── Inline styles ─────────────────────────────────────────────────────────────
const vPageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#202124',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1.5rem',
  position: 'relative',
  overflow: 'hidden',
  fontFamily: "'Google Sans', 'Inter', -apple-system, sans-serif",
};

const blobLeft: React.CSSProperties = {
  position: 'absolute', top: '-10%', left: '-5%',
  width: 500, height: 500, borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(138,180,248,0.07) 0%, transparent 70%)',
  pointerEvents: 'none',
};

const blobRight: React.CSSProperties = {
  position: 'absolute', bottom: '-10%', right: '-5%',
  width: 400, height: 400, borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(197,138,249,0.06) 0%, transparent 70%)',
  pointerEvents: 'none',
};

const orbStyle: React.CSSProperties = {
  width: 72, height: 72, borderRadius: '50%',
  background: 'linear-gradient(135deg, #1a73e8, #8ab4f8, #c58af9)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: '1.75rem',
  boxShadow: '0 0 0 6px rgba(138,180,248,0.1), 0 0 40px rgba(138,180,248,0.3)',
  animation: 'orbBreathing 4s ease-in-out infinite',
};

const cardStyle: React.CSSProperties = {
  width: '100%', maxWidth: 460,
  background: '#2c2d30',
  borderRadius: 18,
  boxShadow: '0 24px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)',
  overflow: 'hidden',
  position: 'relative',
  zIndex: 1,
};

const headerStyle: React.CSSProperties = {
  padding: '1.25rem 1.5rem 1rem',
  background: 'rgba(255,255,255,0.02)',
  borderBottom: '1px solid rgba(255,255,255,0.07)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.75rem',
};

const logoStyle: React.CSSProperties = {
  width: 48, height: 48, borderRadius: 12,
  background: 'rgba(138,180,248,0.12)',
  border: '1px solid rgba(138,180,248,0.2)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  flexShrink: 0,
};

const timerBadgeStyle: React.CSSProperties = {
  background: 'rgba(16,185,129,0.1)',
  border: '1px solid rgba(16,185,129,0.3)',
  color: '#34d399',
  padding: '0.3rem 0.75rem',
  borderRadius: 20,
  fontSize: '0.72rem',
  fontWeight: 600,
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const infoBadgeStyle: React.CSSProperties = {
  background: 'rgba(245,158,11,0.08)',
  border: '1px solid rgba(245,158,11,0.25)',
  borderRadius: 10,
  padding: '0.75rem 1rem',
  fontSize: '0.8125rem',
  color: '#fbbf24',
  lineHeight: 1.55,
};

const errorBadgeStyle: React.CSSProperties = {
  background: 'rgba(242,139,130,0.1)',
  border: '1px solid rgba(242,139,130,0.3)',
  borderRadius: 10,
  padding: '0.625rem 0.875rem',
  fontSize: '0.8125rem',
  color: '#f28b82',
  marginBottom: '1rem',
};

const stepTitleStyle: React.CSSProperties = {
  fontSize: '1.125rem',
  fontWeight: 700,
  color: '#e8eaed',
  marginBottom: '0.375rem',
};

const stepDescStyle: React.CSSProperties = {
  fontSize: '0.8125rem',
  color: '#9aa0a6',
  lineHeight: 1.6,
  marginBottom: '1.125rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: '#e8eaed',
  marginBottom: '0.4rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem 1rem',
  background: '#1a1b1e',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 10,
  color: '#e8eaed',
  fontSize: '0.9375rem',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s ease',
  marginBottom: '1rem',
};

const primaryBtnStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem 1.5rem',
  background: 'linear-gradient(135deg, #1a73e8, #8ab4f8)',
  border: 'none',
  borderRadius: 10,
  color: '#ffffff',
  fontSize: '0.9375rem',
  fontWeight: 700,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '0.5rem',
  fontFamily: 'inherit',
  boxShadow: '0 4px 20px rgba(26, 115, 232, 0.35)',
  transition: 'opacity 0.2s ease, transform 0.15s ease',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '0.75rem 1.25rem',
  background: 'rgba(255,255,255,0.07)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  color: '#e8eaed',
  fontSize: '0.875rem',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
  transition: 'background 0.15s ease',
};

const spinnerStyle: React.CSSProperties = {
  width: 16, height: 16,
  border: '2px solid rgba(255,255,255,0.25)',
  borderTopColor: '#fff',
  borderRadius: '50%',
  animation: 'spin 0.7s linear infinite',
  display: 'inline-block',
  flexShrink: 0,
};

export default VerifyPage;
