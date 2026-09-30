# CLAUDE.md — AI Interview Platform (HireAI)

Guidance for working in this repo, plus the roadmap and implementation plan for
extending it. Read this before making architectural changes.

---

## 1. What this project is

**HireAI** is an AI-powered interview platform. HR teams post jobs and schedule
interviews; candidates receive a secure link, verify their identity via camera,
and complete a voice-based interview conducted by an AI. HR then reviews the
transcript and an AI-generated evaluation.

### Stack

| Layer     | Tech                                                                 |
|-----------|----------------------------------------------------------------------|
| Frontend  | React 18, Vite, TypeScript, React Router v6, Clerk, MediaPipe (face) |
| Backend   | Node, Express, TypeScript, Mongoose (MongoDB Atlas), ioredis (Upstash) |
| Auth      | Clerk (frontend SDK + backend verification + Svix webhooks)          |
| AI — LLM  | Google Gemini `gemini-2.0-flash` (questions + evaluation)            |
| AI — Voice| Sarvam `saarika:v2.5` (STT), `bulbul:v1` (TTS), 11 Indian languages  |
| Files     | Cloudinary (logos, resumes, verification photos)                     |
| Email     | Resend / Nodemailer                                                  |

### Repo layout

```
frontend/  React app (pages/, components/, context/, api/)  — see index.css design system
backend/   Express API
  src/
    controllers/  auth, candidate, hr, iam, interview, job
    models/        HR, Job, Candidate
    services/      geminiService, sarvamService, cloudinaryService, emailService, tokenService
    routes/        one per resource + webhookRoutes
    config/        db (mongo), redis
    middleware/    authMiddleware (Clerk), uploadMiddleware (multer)
```

### Core interview loop (`backend/src/controllers/interviewController.ts`)

`POST /start/:token` → TTS opening question → `POST /turn/:token` (audio → STT →
Gemini next question → TTS) repeated until `job.interviewSettings.maxQuestions` →
mark `COMPLETED` → generate evaluation report. Proctoring = a face-warning
counter (`recordFaceWarning`) driven by in-browser MediaPipe.

### Data model essentials

- **HR** — has `role` (owner/member), `permissions[]`, and `parentHrId`/
  `organizationId` (a multi-tenant foundation, only partly used).
- **Job** — `interviewSettings { maxQuestions, maxFaceWarnings, timeLimitMinutes }`,
  `preferredQuestions[]`, `language`.
- **Candidate** — status lifecycle `SCHEDULED → LINK_SENT → VERIFIED →
  IN_PROGRESS → COMPLETED/EXPIRED`, `transcript[]`, `evaluationReport`,
  `faceWarnings`, `verificationPhotoUrl`.

### Conventions

- API responses: `{ success: boolean, message?, data? }`.
- Controllers are thin; put reusable logic in `services/`.
- Env-driven config; never hardcode keys. Backend reads `process.env.*`,
  frontend reads `import.meta.env.VITE_*`.
- Frontend styling uses the CSS-variable design system in `frontend/src/index.css`
  (dark/light via `data-theme`). Reuse tokens; don't add a CSS framework.
- Verify changes: `cd backend && npm run build`, `cd frontend && npm run build`.

---

## 2. Known issues / tech debt (address opportunistically)

1. **The AI never reads the résumé.** `JobContext` only carries
   `resumeOriginalName` (the filename). `geminiService.ts` prints the filename
   into the prompt but the résumé *content* (`candidate.resumeUrl`) is never
   parsed or sent. Fixed by Phase 1 below.
2. **Evaluation is fire-and-forget** — `(async () => {…})()` inside the request
   handler. Not durable; lost on restart. Fixed by Phase 2 below.
3. **No rate limiting on public AI endpoints** (`/api/interview/turn/:token`
   calls STT + Gemini + TTS with only a token) — cost/abuse vector.
4. **Serial turn latency** — STT → Gemini → TTS run sequentially in one request.
5. **Redis underused** — only verification tokens/cooldowns; no cache, no queue.
6. **CORS trusts any `*.vercel.app`** (`app.ts`). Tighten before public launch.
7. **Two token schemes** — raw `verificationToken` on Candidate vs. hashed
   tokens in `tokenService.ts`. Reconcile.
8. **No tests** and no request validation layer.

---

## 3. Roadmap (further steps)

Ordered by impact on demonstrating **backend depth + AI**.

### Tier 1 — highest impact (the recommended first slice)

- **T1. Résumé parsing + RAG-grounded questions & scoring.** Parse PDF → chunk →
  embed (Gemini `text-embedding-004`) → store in MongoDB Atlas Vector Search →
  retrieve relevant JD/résumé chunks per turn → feed grounded context to Gemini.
  *Skills: document processing, embeddings, vector search, RAG.*
- **T2. Durable job queue (BullMQ + existing Redis).** Move evaluation, TTS
  pre-gen, résumé parsing, and email into queues with retries/backoff, a
  dead-letter queue, idempotency, and a separate worker process.
  *Skills: distributed systems, background workers, reliability.*
- **T3. Rubric-based structured evaluation + candidate ranking.** Per-job
  competencies with weights; Gemini returns structured JSON via `responseSchema`
  with per-competency scores, evidence citations, and confidence; aggregate →
  rank/shortlist per job. *Skills: structured LLM output, eval design, aggregation.*

### Tier 2 — strong backend signals

- **T4. Streaming interview room (WebSocket/SSE)** — stream Gemini tokens,
  pipeline STT/next-question/TTS, live transcript. *Real-time systems.*
- **T5. Analytics service** — Mongo aggregation for hiring funnel, time-to-complete,
  score distributions, per-job/recruiter/language; daily rollups cached in Redis;
  PDF scorecard export. *Data modeling, aggregation, caching.*
- **T6. Deep proctoring + integrity score** — persist tab-blur/multi-face/no-face/
  silence events server-side; compute an integrity score; optional speaker-embedding
  voice-match check. *Event ingestion, scoring, security.*
- **T7. Production hardening** — `zod` validation, `express-rate-limit` (Redis
  store), `pino` logging + request IDs, idempotency keys, OpenAPI spec.

### Tier 3 — platform maturity

- **T8. TTS caching** (hash text+lang → Redis/Cloudinary).
- **T9. Full RBAC + audit log** on the multi-tenant model.
- **T10. Outbound integrations** — Slack + ATS webhook (Greenhouse/Lever) on completion.
- **T11. Adaptive difficulty** from running performance.
- **T12. Tests + CI** — Vitest + supertest, testcontainers for Mongo/Redis.

---

## 4. Implementation plan — Tier 1 slice

Goal: one connected arc — **parse résumé → queue embedding job → RAG-grounded
interview → queued structured evaluation → ranked scorecard** — that fixes
issues #1 and #2 while showcasing document processing, embeddings, vector search,
RAG, durable queues, structured LLM output, and aggregation.

Build in phases; each phase compiles and is independently useful.

### Phase 0 — Foundations (deps + config)

- Add deps (backend): `bullmq`, `pdf-parse` (and `mammoth` if DOCX résumés are
  allowed). Embeddings reuse `@google/generative-ai` (already installed).
- New env vars (document in `.env.example`): none required beyond existing
  `REDIS_URL` and `GEMINI_API_KEY`; add `EMBEDDING_MODEL=text-embedding-004`,
  `INTERVIEW_QUEUE_CONCURRENCY=4`.
- Create MongoDB Atlas **Vector Search index** named `resume_vectors` on the new
  `ResumeChunk` collection, field `embedding`, 768 dims, cosine. (Atlas UI or
  `createSearchIndex`.) Document the exact index JSON in this file when created.
- **Verify:** `cd backend && npm run build`.

### Phase 1 — Résumé ingestion + embeddings (fixes #1 groundwork)

Files:
- `backend/src/models/ResumeChunk.ts` — `{ candidateId, jobId, source:'resume'|'jd',
  chunkIndex, text, embedding:number[] }` + the Atlas vector index.
- `backend/src/services/embeddingService.ts` — `embedText(text)` and
  `embedBatch(texts[])` via Gemini `text-embedding-004`; batch + retry.
- `backend/src/services/resumeService.ts` — `fetchResumeText(url)` (download from
  Cloudinary → `pdf-parse`), `chunkText(text, ~800 tokens, overlap)`,
  `ingestCandidateResume(candidateId)` → writes `ResumeChunk`s.
- Trigger ingestion when a candidate is scheduled (enqueue in Phase 2; until then
  call directly in `candidateController` create path).
- **Verify:** ingest a sample candidate; confirm chunks + vectors exist; run a
  manual `$vectorSearch` and eyeball relevance.

### Phase 2 — Durable queue (T2, fixes #2)

Files:
- `backend/src/queue/connection.ts` — shared BullMQ `Redis` connection (reuse
  `config/redis.ts` URL; BullMQ needs `maxRetriesPerRequest: null`).
- `backend/src/queue/queues.ts` — queues: `resume-ingest`, `evaluation`,
  `tts-pregen`, `email`. Default job opts: 3 attempts, exponential backoff,
  `removeOnComplete`, DLQ via failed-job retention.
- `backend/src/queue/worker.ts` — worker process (`Worker` per queue) run as a
  separate entrypoint. Add `npm run worker` script (`ts-node-dev … worker.ts`) and
  a `dist/queue/worker.js` start command.
- Refactor `interviewController.ts`: replace both `(async () => {…})()`
  evaluation blocks with `evaluationQueue.add(...)` (idempotent via
  `jobId: candidate._id` so a candidate is evaluated once).
- Move résumé ingestion (Phase 1) and outbound email onto their queues.
- **Verify:** kill the worker mid-job → job retries on restart; completing an
  interview enqueues exactly one evaluation.

### Phase 3 — RAG-grounded questions (T1, fixes #1)

- Extend `JobContext` in `geminiService.ts` with `retrievedContext: string`
  (replaces the useless `resumeOriginalName` line in the prompt).
- `backend/src/services/retrievalService.ts` — `retrieveContext(candidateId,
  jobId, query)`: embed the query (candidate's last answer, or JD summary on the
  opening) → Atlas `$vectorSearch` over `ResumeChunk` → return top-k stitched text
  with source labels.
- In `processTurn`, call `retrieveContext(...)` before `generateNextQuestion` and
  pass the result; update the Gemini prompt to ground questions in retrieved
  résumé + JD evidence.
- **Verify:** questions reference specifics from the résumé; add a `?debug=1`
  path (dev-only) that returns the retrieved chunks alongside the question.

### Phase 4 — Structured rubric evaluation + ranking (T3)

- `backend/src/models/Job.ts` — add `rubric: [{ competency, weight, description }]`
  with a sensible default.
- `geminiService.ts` — `generateEvaluationReport` uses Gemini **structured output**
  (`responseSchema`) returning per-competency `{ score, evidence[], confidence }`
  plus overall summary/recommendation; drop the regex markdown-stripping.
- `backend/src/models/Candidate.ts` — extend `evaluationReport` with
  `competencyScores[]` and a computed weighted `overallScore`.
- New endpoint `GET /api/candidates/ranking?jobId=` — aggregation that sorts
  candidates by weighted score with tie-breakers; supports auto-shortlist flag.
- Frontend: competency scorecard on the candidate view + a ranking table on the
  job view (reuse existing `.card`/`.table-wrap`/`.badge` styles).
- **Verify:** evaluation returns valid structured JSON every run (no parse
  fallback); ranking endpoint orders candidates correctly.

### Phase 5 — Hardening for the new surface (subset of T7)

- `express-rate-limit` with a Redis store on public interview endpoints.
- `zod` schemas for interview/candidate request bodies.
- Structured logging around queue jobs (job id, duration, outcome).
- **Verify:** both builds pass; rate limit returns 429 past the threshold.

### Out of scope for this slice
Streaming (T4), analytics dashboards (T5), deep proctoring (T6), integrations
(T10), adaptive difficulty (T11). Track under Tier 2/3 above.

---

## 5. Progress log

_Update this as phases land._

- [ ] Phase 0 — Foundations
- [ ] Phase 1 — Résumé ingestion + embeddings
- [ ] Phase 2 — Durable queue
- [ ] Phase 3 — RAG-grounded questions
- [ ] Phase 4 — Structured rubric evaluation + ranking
- [ ] Phase 5 — Hardening
