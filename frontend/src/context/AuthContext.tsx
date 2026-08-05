import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL;

interface HR {
  id: string;
  name: string;
  email: string;
  companyName: string;
  companyLogo?: string;
  profileComplete: boolean;
}

interface AuthContextType {
  hr: HR | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, companyName?: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
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
    const { token: t, hr: h } = data.data;
    setToken(t);
    setHr(h);
    localStorage.setItem('hireai_token', t);
    axios.defaults.headers.common['Authorization'] = `Bearer ${t}`;
  };

  const register = async (name: string, email: string, password: string, companyName = '') => {
    const { data } = await axios.post(`${API}/auth/register`, { name, email, password, companyName });
    const { token: t, hr: h } = data.data;
    setToken(t);
    setHr(h);
    localStorage.setItem('hireai_token', t);
    axios.defaults.headers.common['Authorization'] = `Bearer ${t}`;
  };

  const logout = () => {
    setHr(null);
    setToken(null);
    localStorage.removeItem('hireai_token');
    delete axios.defaults.headers.common['Authorization'];
  };

  return (
    <AuthContext.Provider value={{ hr, token, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};
