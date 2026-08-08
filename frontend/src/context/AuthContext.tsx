import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL;

export interface HR {
  id: string;
  name: string;
  email: string;
  companyName: string;
  companyLogo?: string;
  profileComplete: boolean;
  isVerified?: boolean;
  role?: 'owner' | 'member';
  permissions?: string[];
  organizationId?: string;
}

interface AuthContextType {
  hr: HR | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ mustChangePassword?: boolean; tempToken?: string }>;
  register: (name: string, email: string, password: string, companyName?: string) => Promise<{ requiresVerification: boolean; email: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  setAuthSession: (token: string, hr: HR) => void;
  hasPermission: (flag: string) => boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hr, setHr] = useState<HR | null>(null);
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('hireai_token'));
  const [loading, setLoading] = useState(true);

  // Set axios default header
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  }, [token]);

  const setAuthSession = useCallback((t: string, h: HR) => {
    setToken(t);
    setHr(h);
    localStorage.setItem('hireai_token', t);
    axios.defaults.headers.common['Authorization'] = `Bearer ${t}`;
  }, []);

  const refreshUser = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    try {
      const { data } = await axios.get(`${API}/auth/me`);
      setHr(data.data.hr);
    } catch {
      setToken(null);
      setHr(null);
      localStorage.removeItem('hireai_token');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { refreshUser(); }, [refreshUser]);

  const login = async (email: string, password: string) => {
    const { data } = await axios.post(`${API}/auth/login`, { email, password });
    if (data.mustChangePassword) {
      // Don't set JWT — return temp token for use on /set-password page
      return { mustChangePassword: true, tempToken: data.tempToken };
    }
    const { token: t, hr: h } = data.data;
    setAuthSession(t, h);
    return {};
  };

  const register = async (name: string, email: string, password: string, companyName = '') => {
    const { data } = await axios.post(`${API}/auth/register`, { name, email, password, companyName });
    return data.data;
  };

  const logout = () => {
    setHr(null);
    setToken(null);
    localStorage.removeItem('hireai_token');
    delete axios.defaults.headers.common['Authorization'];
  };

  /** Returns true if logged-in user is owner OR has the specific permission flag */
  const hasPermission = (flag: string): boolean => {
    if (!hr) return false;
    if (hr.role === 'owner') return true;
    return hr.permissions?.includes(flag) ?? false;
  };

  return (
    <AuthContext.Provider value={{ hr, token, loading, login, register, logout, refreshUser, setAuthSession, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
};
