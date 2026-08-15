import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ProfilePage from './pages/ProfilePage';
import JobsPage from './pages/JobsPage';
import CreateJobPage from './pages/CreateJobPage';
import SchedulePage from './pages/SchedulePage';
import CandidatesPage from './pages/CandidatesPage';
import TeamPage from './pages/TeamPage';
import InterviewRoomPage from './pages/InterviewRoomPage';

// Pages that are no longer needed (Clerk handles email verification & password setup)
// VerifyEmailPage and SetPasswordPage are removed — Clerk's hosted flows replace them.
// VerifyPage remains as it's the candidate-facing interview verification page (no auth).

import VerifyPage from './pages/VerifyPage';

function App() {
  return (
    <ThemeProvider>
      {/* AuthProvider wraps Clerk hooks into the existing HR context interface */}
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public — HR auth (Clerk powered) */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            {/* Candidate facing - fully public, no HR auth required */}
            <Route path="/interview/verify/:token" element={<VerifyPage />} />
            <Route path="/interview/room/:token" element={<InterviewRoomPage />} />

            {/* HR Portal - protected (requires Clerk session) */}
            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/jobs" element={<ProtectedRoute><JobsPage /></ProtectedRoute>} />
            <Route path="/jobs/new" element={<ProtectedRoute><CreateJobPage /></ProtectedRoute>} />
            <Route path="/schedule" element={<ProtectedRoute><SchedulePage /></ProtectedRoute>} />
            <Route path="/candidates" element={<ProtectedRoute><CandidatesPage /></ProtectedRoute>} />
            <Route path="/team" element={<ProtectedRoute><TeamPage /></ProtectedRoute>} />

            {/* Default */}
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
