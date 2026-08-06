import { Request, Response } from 'express';
import multer from 'multer';
import Candidate from '../models/Candidate';
import Job from '../models/Job';
import { speechToText } from '../services/sarvamService';
import { textToSpeech } from '../services/sarvamService';
import {
  generateOpeningQuestion,
  generateNextQuestion,
  generateEvaluationReport,
  type JobContext,
} from '../services/geminiService';

// ── Multer config for audio uploads (in-memory) ──────────────────────────────
const audioStorage = multer.memoryStorage();
export const uploadAudio = multer({
  storage: audioStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['audio/webm', 'audio/ogg', 'audio/wav', 'audio/mp4', 'audio/mpeg'];
    cb(null, allowed.includes(file.mimetype) || file.mimetype.startsWith('audio/'));
  },
}).single('audio');

// ── Helper: validate token and return candidate + job ────────────────────────
const getSessionData = async (token: string) => {
  const candidate = await Candidate.findOne({ verificationToken: token }).populate<{
    jobId: {
      _id: string;
      title: string;
      description: string;
      requirements: string;
      preferredQuestions: string[];
      language: string;
      experienceLevel: string;
      interviewSettings: { maxQuestions: number; maxFaceWarnings: number; timeLimitMinutes: number };
    };
  }>('jobId', 'title description requirements preferredQuestions language experienceLevel interviewSettings');

  return candidate;
};

// ── POST /api/interview/start/:token ─────────────────────────────────────────
/**
 * Starts the interview session. Returns the first AI question as text + TTS audio.
 */
export const startInterview = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const candidate = await getSessionData(token);

    if (!candidate) {
      res.status(404).json({ success: false, message: 'Session not found' });
      return;
    }

    if (candidate.status === 'COMPLETED') {
      res.status(400).json({ success: false, message: 'Interview already completed' });
      return;
    }

    if (!['VERIFIED', 'IN_PROGRESS'].includes(candidate.status)) {
      res.status(400).json({ success: false, message: 'Please complete verification first' });
      return;
    }

    if (!candidate.jobId) {
      res.status(404).json({ success: false, message: 'Associated job listing no longer exists' });
      return;
    }

    const job = candidate.jobId as NonNullable<typeof candidate.jobId>;

    // If already in progress (reconnect) — return current state
    if (candidate.status === 'IN_PROGRESS' && candidate.transcript.length > 0) {
      const maxQ = job.interviewSettings?.maxQuestions ?? 8;
      const aiTurns = candidate.transcript.filter((t) => t.role === 'ai');
      const lastAiMsg = aiTurns[aiTurns.length - 1]?.content ?? '';

      // Re-generate TTS for last AI question
      let ttsResult = { audioBase64: '', contentType: 'audio/wav' };
      try {
        ttsResult = await textToSpeech(lastAiMsg, job.language);
      } catch { /* non-fatal */ }

      res.json({
        success: true,
        data: {
          questionText: lastAiMsg,
          audioBase64: ttsResult.audioBase64,
          contentType: ttsResult.contentType,
          turnNumber: candidate.transcript.filter((t) => t.role === 'candidate').length,
          totalTurns: maxQ,
          transcript: candidate.transcript,
          isReconnect: true,
        },
      });
      return;
    }

    // Fresh start
    const jobCtx: JobContext = {
      title: job.title,
      description: job.description,
      requirements: job.requirements,
      preferredQuestions: job.preferredQuestions,
      language: job.language,
      experienceLevel: job.experienceLevel,
      candidateName: candidate.name,
      resumeOriginalName: candidate.resumeOriginalName,
    };

    const openingQ = generateOpeningQuestion(jobCtx);

    // Generate TTS (non-fatal)
    let ttsResult = { audioBase64: '', contentType: 'audio/wav' };
    try {
      ttsResult = await textToSpeech(openingQ, job.language);
    } catch (e) {
      console.error('TTS error on start (non-fatal):', e);
    }

    // Update candidate
    candidate.status = 'IN_PROGRESS';
    candidate.interviewStartedAt = new Date();
    candidate.transcript = [{ role: 'ai', content: openingQ, timestamp: new Date() }];
    await candidate.save();

    const maxQ = job.interviewSettings?.maxQuestions ?? 8;

    res.json({
      success: true,
      data: {
        questionText: openingQ,
        audioBase64: ttsResult.audioBase64,
        contentType: ttsResult.contentType,
        turnNumber: 0,
        totalTurns: maxQ,
        timeLimitMinutes: job.interviewSettings?.timeLimitMinutes ?? 20,
        maxFaceWarnings: job.interviewSettings?.maxFaceWarnings ?? 3,
        isReconnect: false,
      },
    });
  } catch (error) {
    console.error('Start interview error:', error);
    res.status(500).json({ success: false, message: 'Failed to start interview' });
  }
};

// ── POST /api/interview/turn/:token ──────────────────────────────────────────
/**
 * Processes one candidate turn: audio → STT → append → generate next Q → TTS.
 */
export const processTurn = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const candidate = await getSessionData(token);

    if (!candidate) {
      res.status(404).json({ success: false, message: 'Session not found' });
      return;
    }

    if (candidate.status !== 'IN_PROGRESS') {
      res.status(400).json({ success: false, message: 'Interview is not in progress' });
      return;
    }

    if (!candidate.jobId) {
      res.status(404).json({ success: false, message: 'Associated job listing no longer exists' });
      return;
    }

    const job = candidate.jobId as NonNullable<typeof candidate.jobId>;
    const maxQ = job.interviewSettings?.maxQuestions ?? 8;
    const candidateTurns = candidate.transcript.filter((t) => t.role === 'candidate').length;

    if (candidateTurns >= maxQ) {
      res.status(400).json({ success: false, message: 'All questions have been answered', isComplete: true });
      return;
    }

    // STT — either from audio file or text fallback (for testing)
    let candidateText = (req.body?.text || '').trim();

    if (!candidateText && req.file) {
      const sttResult = await speechToText(req.file.buffer, job.language);
      candidateText = sttResult.transcript.trim();
    }

    if (!candidateText) {
      res.status(400).json({ success: false, message: 'No speech detected. Please try again.' });
      return;
    }

    // Append candidate response
    candidate.transcript.push({ role: 'candidate', content: candidateText, timestamp: new Date() });

    const newCandidateTurns = candidateTurns + 1;
    const isLastTurn = newCandidateTurns >= maxQ;

    let nextQuestion = '';
    let ttsResult = { audioBase64: '', contentType: 'audio/wav' };

    if (!isLastTurn) {
      // Generate next AI question
      const jobCtx: JobContext = {
        title: job.title,
        description: job.description,
        requirements: job.requirements,
        preferredQuestions: job.preferredQuestions,
        language: job.language,
        experienceLevel: job.experienceLevel,
        candidateName: candidate.name,
        resumeOriginalName: candidate.resumeOriginalName,
      };

      const simplifiedTranscript = candidate.transcript.map((t) => ({
        role: t.role,
        content: t.content,
      }));

      nextQuestion = await generateNextQuestion(jobCtx, simplifiedTranscript, newCandidateTurns, maxQ);
      candidate.transcript.push({ role: 'ai', content: nextQuestion, timestamp: new Date() });

      // TTS for next question
      try {
        ttsResult = await textToSpeech(nextQuestion, job.language);
      } catch (e) {
        console.error('TTS error (non-fatal):', e);
      }
    } else {
      // Last turn completed — mark COMPLETED directly
      candidate.status = 'COMPLETED';
      candidate.interviewCompletedAt = new Date();
      candidate.interviewEndReason = 'COMPLETED';

      // Trigger async evaluation
      (async () => {
        try {
          const jobCtx: JobContext = {
            title: job.title,
            description: job.description,
            requirements: job.requirements,
            preferredQuestions: job.preferredQuestions,
            language: job.language,
            experienceLevel: job.experienceLevel,
          };
          const simplifiedTranscript = candidate.transcript.map((t) => ({
            role: t.role,
            content: t.content,
          }));
          const report = await generateEvaluationReport(jobCtx, simplifiedTranscript, candidate.name);
          await Candidate.findByIdAndUpdate(candidate._id, {
            evaluationReport: { ...report, generatedAt: new Date() },
          });
        } catch (e) { console.error('Async eval error:', e); }
      })();
    }

    await candidate.save();

    res.json({
      success: true,
      data: {
        candidateText,
        questionText: nextQuestion,
        audioBase64: ttsResult.audioBase64,
        contentType: ttsResult.contentType,
        turnNumber: newCandidateTurns,
        totalTurns: maxQ,
        isComplete: isLastTurn,
      },
    });
  } catch (error) {
    console.error('Process turn error:', error);
    res.status(500).json({ success: false, message: 'Failed to process your response' });
  }
};

// ── POST /api/interview/end/:token ───────────────────────────────────────────
/**
 * Ends the interview, triggers async evaluation, returns completion message.
 */
export const endInterview = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const { reason = 'COMPLETED' } = req.body;

    const candidate = await getSessionData(token);

    if (!candidate) {
      res.status(404).json({ success: false, message: 'Session not found' });
      return;
    }

    if (candidate.status === 'COMPLETED') {
      res.json({ success: true, message: 'Interview already completed' });
      return;
    }

    candidate.status = 'COMPLETED';
    candidate.interviewCompletedAt = new Date();
    candidate.interviewEndReason = reason as 'COMPLETED' | 'FACE_VIOLATION' | 'TIME_EXCEEDED';
    await candidate.save();

    res.json({
      success: true,
      message: reason === 'FACE_VIOLATION'
        ? 'Interview ended due to face detection violation.'
        : 'Interview completed successfully.',
    });

    // Async evaluation — do not await
    (async () => {
      try {
        const job = candidate.jobId as NonNullable<typeof candidate.jobId>;
        const jobCtx: JobContext = {
          title: job.title,
          description: job.description,
          requirements: job.requirements,
          preferredQuestions: job.preferredQuestions,
          language: job.language,
          experienceLevel: job.experienceLevel,
        };

        const simplifiedTranscript = candidate.transcript.map((t) => ({
          role: t.role,
          content: t.content,
        }));

        const report = await generateEvaluationReport(jobCtx, simplifiedTranscript, candidate.name);

        await Candidate.findByIdAndUpdate(candidate._id, {
          evaluationReport: {
            ...report,
            generatedAt: new Date(),
          },
        });

        console.log(`✓ Evaluation generated for candidate: ${candidate.name}`);
      } catch (e) {
        console.error('Async evaluation failed:', e);
      }
    })();
  } catch (error) {
    console.error('End interview error:', error);
    res.status(500).json({ success: false, message: 'Failed to end interview' });
  }
};

// ── GET /api/interview/status/:token ─────────────────────────────────────────
/**
 * Returns current session state — useful for reconnect / page refresh.
 */
export const getInterviewStatus = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const candidate = await getSessionData(token);

    if (!candidate) {
      res.status(404).json({ success: false, message: 'Session not found' });
      return;
    }

    const job = candidate.jobId as NonNullable<typeof candidate.jobId>;
    const maxQ = job.interviewSettings?.maxQuestions ?? 8;
    const candidateTurns = candidate.transcript.filter((t) => t.role === 'candidate').length;

    res.json({
      success: true,
      data: {
        status: candidate.status,
        candidateName: candidate.name,
        jobTitle: job.title,
        language: job.language,
        turnNumber: candidateTurns,
        totalTurns: maxQ,
        faceWarnings: candidate.faceWarnings,
        maxFaceWarnings: job.interviewSettings?.maxFaceWarnings ?? 3,
        timeLimitMinutes: job.interviewSettings?.timeLimitMinutes ?? 20,
        interviewStartedAt: candidate.interviewStartedAt,
        interviewEndReason: candidate.interviewEndReason,
        transcript: candidate.transcript,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get interview status' });
  }
};

// ── POST /api/interview/face-warning/:token ──────────────────────────────────
/**
 * Increments face warning count. If maxFaceWarnings reached, auto-terminates.
 */
export const recordFaceWarning = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    const candidate = await getSessionData(token);

    if (!candidate) {
      res.status(404).json({ success: false, message: 'Session not found' });
      return;
    }

    if (candidate.status !== 'IN_PROGRESS') {
      res.json({ success: true, data: { warnings: candidate.faceWarnings, terminated: false } });
      return;
    }

    const job = candidate.jobId as NonNullable<typeof candidate.jobId>;
    const maxWarnings = job.interviewSettings?.maxFaceWarnings ?? 3;

    candidate.faceWarnings = (candidate.faceWarnings || 0) + 1;
    const terminated = candidate.faceWarnings >= maxWarnings;

    if (terminated) {
      candidate.status = 'COMPLETED';
      candidate.interviewCompletedAt = new Date();
      candidate.interviewEndReason = 'FACE_VIOLATION';
    }

    await candidate.save();

    if (terminated) {
      // Async evaluation for face violation case too
      (async () => {
        try {
          const jobCtx: JobContext = {
            title: job.title,
            description: job.description,
            requirements: job.requirements,
            preferredQuestions: job.preferredQuestions,
            language: job.language,
            experienceLevel: job.experienceLevel,
          };
          const simplifiedTranscript = candidate.transcript.map((t) => ({
            role: t.role,
            content: t.content,
          }));
          if (simplifiedTranscript.length > 1) {
            const report = await generateEvaluationReport(jobCtx, simplifiedTranscript, candidate.name);
            await Candidate.findByIdAndUpdate(candidate._id, {
              evaluationReport: { ...report, generatedAt: new Date() },
            });
          }
        } catch (e) { console.error('Async eval error:', e); }
      })();
    }

    res.json({
      success: true,
      data: {
        warnings: candidate.faceWarnings,
        maxWarnings,
        terminated,
      },
    });
  } catch (error) {
    console.error('Face warning error:', error);
    res.status(500).json({ success: false, message: 'Failed to record warning' });
  }
};
