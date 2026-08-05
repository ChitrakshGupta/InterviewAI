import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || '/api';

// ── Auth ─────────────────────────────────────────────────
export const authApi = {
  me: () => axios.get(`${BASE}/auth/me`),
};

// ── HR Profile ───────────────────────────────────────────
export const hrApi = {
  getProfile: () => axios.get(`${BASE}/hr/profile`),
  updateProfile: (form: FormData) =>
    axios.put(`${BASE}/hr/profile`, form, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

// ── Jobs ─────────────────────────────────────────────────
export interface JobPayload {
  title: string;
  department?: string;
  experienceLevel?: string;
  description: string;
  requirements?: string;
  preferredQuestions?: string[];
  language: string;
}

export const jobApi = {
  list: () => axios.get(`${BASE}/jobs`),
  get: (id: string) => axios.get(`${BASE}/jobs/${id}`),
  create: (payload: JobPayload) => axios.post(`${BASE}/jobs`, payload),
  update: (id: string, payload: Partial<JobPayload>) => axios.put(`${BASE}/jobs/${id}`, payload),
  delete: (id: string) => axios.delete(`${BASE}/jobs/${id}`),
};

// ── Candidates ───────────────────────────────────────────
export const candidateApi = {
  list: (params?: { jobId?: string; status?: string }) =>
    axios.get(`${BASE}/candidates`, { params }),
  get: (id: string) => axios.get(`${BASE}/candidates/${id}`),
  schedule: (form: FormData) =>
    axios.post(`${BASE}/candidates/schedule`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  resendLink: (id: string) => axios.post(`${BASE}/candidates/${id}/resend-link`),

  // Public (no auth)
  verifyToken: (token: string, email: string) =>
    axios.post(`${BASE}/candidates/verify/${token}`, { email }),
  getTokenInfo: (token: string) =>
    axios.post(`${BASE}/candidates/verify/${token}`, {}),
  uploadPhoto: (token: string, form: FormData) =>
    axios.post(`${BASE}/candidates/verify/${token}/photo`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
};

// ── Dashboard ────────────────────────────────────────────
export const dashboardApi = {
  stats: () => axios.get(`${BASE}/candidates/dashboard/stats`),
};

// ── Languages ────────────────────────────────────────────
export const languagesApi = {
  list: () => axios.get(`${BASE}/languages`),
};

// ── Interview Session ─────────────────────────────────────
export const interviewApi = {
  start: (token: string) =>
    axios.post(`${BASE}/interview/start/${token}`),

  turn: (token: string, formData: FormData) =>
    axios.post(`${BASE}/interview/turn/${token}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    }),

  turnText: (token: string, text: string) =>
    axios.post(`${BASE}/interview/turn/${token}`, { text }, { timeout: 60000 }),

  end: (token: string, reason = 'COMPLETED') =>
    axios.post(`${BASE}/interview/end/${token}`, { reason }),

  status: (token: string) =>
    axios.get(`${BASE}/interview/status/${token}`),

  faceWarning: (token: string) =>
    axios.post(`${BASE}/interview/face-warning/${token}`),
};
