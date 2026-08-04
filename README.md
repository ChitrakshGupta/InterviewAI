# AI Interview Platform

Production-ready AI-powered interview platform with HR portal, candidate scheduling, and voice AI interview room.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express, TypeScript, Mongoose |
| Database | MongoDB |
| Frontend | React 18, Vite, TypeScript |
| Styling | Vanilla CSS — minimal dark/light design |
| Email | Nodemailer (SMTP / console fallback) |
| AI Voice (Phase 3) | Sarvam AI (STT + TTS) + Gemini |

---

## Project Structure

```
ai-interview/
├── backend/
│   ├── src/
│   │   ├── config/db.ts           # MongoDB connection
│   │   ├── models/                # HR, Job, Candidate schemas
│   │   ├── controllers/           # Auth, HR, Job, Candidate controllers
│   │   ├── routes/                # Express routers
│   │   ├── middleware/            # JWT auth, Multer uploads
│   │   ├── services/emailService.ts
│   │   ├── app.ts                 # Express app
│   │   └── index.ts               # Entry point
│   ├── uploads/                   # Resume & verification photos
│   └── .env                       # Config (copy & fill)
├── frontend/
│   ├── src/
│   │   ├── context/               # Auth + Theme contexts
│   │   ├── api/index.ts           # All API calls
│   │   ├── components/            # AppShell, ProtectedRoute
│   │   └── pages/                 # All pages
│   └── .env
└── package.json
```

---

## Quick Start

### 1. Prerequisites
- Node.js 18+
- MongoDB running locally (`mongod`) or MongoDB Atlas URI

### 2. Backend Setup

```bash
cd backend
cp .env .env.local  # Edit with your values
npm install
npm run dev
```

Backend runs on `http://localhost:5000`

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`

---

## Environment Variables

### backend/.env

```env
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/ai-interview
JWT_SECRET=change_this_secret
FRONTEND_URL=http://localhost:5173

# Email (leave as-is to use console logging)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password

# Phase 3
SARVAM_API_KEY=your_sarvam_key
GEMINI_API_KEY=your_gemini_key
```

### frontend/.env

```env
VITE_API_URL=http://localhost:5000/api
VITE_BACKEND_URL=http://localhost:5000
```

---

## Phases

### ✅ Phase 1 — HR Portal
- Register / Login
- Company profile with logo
- Create job positions (title, description, preferred questions, Sarvam AI language)
- Schedule candidates (upload resume, send email with unique verification link)
- Candidates list with status tracking

### ✅ Phase 2 — Candidate Verification
- Unique link via email (`/interview/verify/:token`)
- Email identity verification
- Webcam photo capture
- Redirect to interview room

### 🔜 Phase 3 — AI Voice Interview Room
- Sarvam AI Speech-to-Text (STT)
- Sarvam AI Text-to-Speech (TTS)
- Gemini AI for question generation
- Live transcript and evaluation report

---

## Supported Interview Languages (Sarvam AI)

| Language | Code |
|----------|------|
| English (India) | `en-IN` |
| Hindi | `hi-IN` |
| Bengali | `bn-IN` |
| Gujarati | `gu-IN` |
| Kannada | `kn-IN` |
| Malayalam | `ml-IN` |
| Marathi | `mr-IN` |
| Odia | `od-IN` |
| Punjabi | `pa-IN` |
| Tamil | `ta-IN` |
| Telugu | `te-IN` |
# InterviewAI
