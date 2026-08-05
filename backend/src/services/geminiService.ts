import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

// ── Types ────────────────────────────────────────────────────────────────────
export interface TranscriptTurn {
  role: 'ai' | 'candidate';
  content: string;
}

export interface JobContext {
  title: string;
  description: string;
  requirements?: string;
  preferredQuestions?: string[];
  language: string;
  experienceLevel?: string;
  candidateName?: string;
  resumeOriginalName?: string;
}

export interface EvaluationReport {
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  summary: string;
  recommendation: 'STRONGLY_RECOMMENDED' | 'RECOMMENDED' | 'NEUTRAL' | 'NOT_RECOMMENDED';
}

// ── Question Generator ───────────────────────────────────────────────────────

const OPENING_QUESTIONS: Record<string, string> = {
  'en-IN': "Hello! Welcome to your interview. Let's start by introducing yourself and giving a brief overview of your background relevant to this role.",
  'hi-IN': "नमस्ते! आपके इंटरव्यू में आपका स्वागत है। चलिए अपने परिचय और इस भूमिका से जुड़ी अपनी पृष्ठभूमि के संक्षिप्त विवरण के साथ शुरुआत करते हैं।",
  'ta-IN': "வணக்கம்! உங்கள் நேர்காணலுக்கு உங்களை வரவேற்கிறோம். உங்களைப் பற்றியும் இந்தப் பணிக்குத் தொடர்புடைய உங்கள் பின்னணியைப் பற்றியும் சுருக்கமாகச் சொல்லித் தொடங்குவோம்.",
  'te-IN': "నమస్కారం! మీ ఇంటర్వ్యూకి స్వాగతం. మీ పరిచయం மற்றும் ఈ పాత్రకు సంబంధించిన మీ నేపథ్యం గురించిన క్లుప్తమైన వివరాలతో ప్రారంభిద్దాం.",
};

const getDefaultOpening = (language: string): string =>
  OPENING_QUESTIONS[language] || OPENING_QUESTIONS['en-IN'];

/**
 * Generate the opening question for a new interview session.
 */
export const generateOpeningQuestion = (job: JobContext): string => {
  return getDefaultOpening(job.language);
};

/**
 * Generate the next interview question using Gemini AI, strictly based on Resume and Job Description.
 */
export const generateNextQuestion = async (
  job: JobContext,
  transcript: TranscriptTurn[],
  turnNumber: number,
  totalTurns: number
): Promise<string> => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const isLastTurn = turnNumber >= totalTurns - 1;
    const preferredQStr =
      job.preferredQuestions && job.preferredQuestions.length > 0
        ? `\nPreferred Questions to Cover:\n${job.preferredQuestions.map((q, i) => `${i + 1}. ${q}`).join('\n')}`
        : '';

    // Build a list of already-asked questions to avoid repetition
    const askedQuestions = transcript
      .filter((t) => t.role === 'ai')
      .map((t, i) => `Q${i + 1}: ${t.content}`)
      .join('\n');

    const transcriptStr = transcript
      .map((t) => `${t.role === 'ai' ? 'Interviewer' : (job.candidateName || 'Candidate')}: ${t.content}`)
      .join('\n');

    const prompt = isLastTurn
      ? `You are an AI interviewer conducting the final wrap-up for candidate ${job.candidateName || 'Candidate'} applying for ${job.title}.
Based on the interview, ask ONE brief closing question or give the candidate a chance to share final thoughts.
Keep it warm, professional, and concise (1-2 sentences). Language: ${job.language}.

Transcript:
${transcriptStr}

Generate only the closing statement (no prefix, no explanation):`
      : `STRICT SYSTEM INSTRUCTION — AI Technical Interviewer:

You are evaluating candidate: ${job.candidateName || 'Candidate'}
Position: ${job.title}
${job.resumeOriginalName ? `Resume File: ${job.resumeOriginalName}` : ''}
${job.experienceLevel ? `Experience Level: ${job.experienceLevel}` : ''}

JOB DESCRIPTION:
${job.description}

JOB REQUIREMENTS & SKILLS NEEDED:
${job.requirements || 'Standard requirements for ' + job.title}
${preferredQStr}

QUESTIONS ALREADY ASKED (DO NOT REPEAT ANY OF THESE):
${askedQuestions || 'None yet'}

STRICT RULES:
1. Generate EXACTLY ONE new question not already asked.
2. The question MUST evaluate a specific skill, technology, or experience mentioned in the JOB DESCRIPTION or JOB REQUIREMENTS above.
3. Make the question directly relevant to what the candidate said in their last answer — go deeper or pivot to a new required skill.
4. NEVER ask generic or off-topic questions (no trivia, no general life questions).
5. NEVER repeat or rephrase a question that was already asked.
6. Each question must test something different: alternate between technical depth, project experience, problem-solving, and behavioral scenarios — all grounded in the JD.
7. Turn ${turnNumber} of ${totalTurns}. Keep question concise (1-2 sentences max).
8. Language: ${job.language}. Respond ONLY in that language.

Interview Transcript:
${transcriptStr}

Generate ONLY the next question text (no labels, no quotes, no explanations):`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    return text || getDefaultOpening(job.language);
  } catch (error) {
    console.error('Gemini question generation error:', error);
    return "Thank you for sharing. Based on the requirements for this role, could you describe a specific project where you applied your technical skills to solve a complex problem?";
  }
};

// ── Evaluation Report ────────────────────────────────────────────────────────

/**
 * Generate a structured evaluation report from the full interview transcript.
 */
export const generateEvaluationReport = async (
  job: JobContext,
  transcript: TranscriptTurn[],
  candidateName: string
): Promise<EvaluationReport> => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const transcriptStr = transcript
      .map((t) => `${t.role === 'ai' ? 'AI Interviewer' : candidateName}: ${t.content}`)
      .join('\n\n');

    const prompt = `You are an expert HR evaluator analyzing an interview for the role of "${job.title}".

Candidate Name: ${candidateName}
Job Description: ${job.description}
${job.requirements ? `Requirements: ${job.requirements}` : ''}
${job.experienceLevel ? `Expected level: ${job.experienceLevel}` : ''}

Interview Transcript:
${transcriptStr}

Analyze how well the candidate's answers match the Job Description and Requirements.
Provide a structured evaluation in EXACTLY this JSON format (no markdown, pure JSON):
{
  "overallScore": <number 0-10>,
  "strengths": [<list of 2-4 specific strengths observed against job requirements>],
  "weaknesses": [<list of 1-3 specific gaps observed against job requirements>],
  "summary": "<2-3 sentence professional summary of the candidate's fit for this role>",
  "recommendation": "<one of: STRONGLY_RECOMMENDED | RECOMMENDED | NEUTRAL | NOT_RECOMMENDED>"
}`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');
    const parsed = JSON.parse(cleaned) as EvaluationReport;

    parsed.overallScore = Math.max(0, Math.min(10, Number(parsed.overallScore) || 5));
    const validRecs = ['STRONGLY_RECOMMENDED', 'RECOMMENDED', 'NEUTRAL', 'NOT_RECOMMENDED'];
    if (!validRecs.includes(parsed.recommendation)) parsed.recommendation = 'NEUTRAL';

    return parsed;
  } catch (error) {
    console.error('Gemini evaluation error:', error);
    return {
      overallScore: 5,
      strengths: ['Completed the AI interview process'],
      weaknesses: ['Evaluation could not be fully generated'],
      summary: 'The candidate completed the AI interview. Manual HR review recommended.',
      recommendation: 'NEUTRAL',
    };
  }
};
