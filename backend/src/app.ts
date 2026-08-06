import express from 'express';
import cors from 'cors';
import path from 'path';
import authRoutes from './routes/authRoutes';
import hrRoutes from './routes/hrRoutes';
import jobRoutes from './routes/jobRoutes';
import candidateRoutes from './routes/candidateRoutes';
import interviewRoutes from './routes/interviewRoutes';
import { SARVAM_LANGUAGES } from './models/Job';

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:4173',
].filter(Boolean) as string[];

const formattedOrigins = allowedOrigins.map((o) => o.replace(/\/$/, ''));

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      const cleanOrigin = origin.replace(/\/$/, '');

      // Allow explicitly listed origins or any Vercel deployment domain (*.vercel.app)
      if (formattedOrigins.includes(cleanOrigin) || cleanOrigin.endsWith('.vercel.app')) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    optionsSuccessStatus: 200,
  })
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'AI Interview API is running', timestamp: new Date().toISOString() });
});

// Available languages endpoint (public)
app.get('/api/languages', (_req, res) => {
  res.json({ success: true, data: { languages: SARVAM_LANGUAGES } });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/api/interview', interviewRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, message: err.message || 'Internal server error' });
});

export default app;
