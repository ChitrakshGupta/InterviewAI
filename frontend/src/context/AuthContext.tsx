/**
 * AuthContext — Clerk-powered replacement for the original JWT-based auth.
 *
 * What changed:
 *  - useSignIn / useSignOut / useUser from @clerk/clerk-react replace manual
 *    JWT logic, bcrypt, email-verification flows etc.
 *  - The "HR" profile (companyName, logo, permissions, …) is still stored in
 *    our MongoDB and fetched via GET /api/hr/profile using the Clerk session
 *    token as a Bearer token.
 *  - The public hook surface (useAuth → { hr, loading, login, register,
 *    logout, hasPermission }) is kept identical so zero other files need
 *    changes except LoginPage / RegisterPage.
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import {
  useUser,
  useAuth as useClerkAuth,
  useSignIn,
  useSignUp,
  useClerk,
} from '@clerk/clerk-react';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL;

// ─── Types ────────────────────────────────────────────────────────────────────

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
  login: (
    email: string,
    password: string,
  ) => Promise<{ mustChangePassword?: boolean; tempToken?: string }>;
  register: (
    name: string,
    email: string,
    password: string,
    companyName?: string,
  ) => Promise<{ requiresVerification: boolean; email: string }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  /** Legacy shim — no-op with Clerk (Clerk manages session internally) */
  setAuthSession: (token: string, hr: HR) => void;
  hasPermission: (flag: string) => boolean;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { isLoaded: userLoaded, isSignedIn, user } = useUser();
  const { getToken } = useClerkAuth();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const { signOut } = useClerk();

  const [hr, setHr] = useState<HR | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  /** Fetches the HR mongo profile and attaches Clerk token to axios */
  const refreshUser = useCallback(async () => {
    if (!isSignedIn || !userLoaded) {
      setHr(null);
      setToken(null);
      delete axios.defaults.headers.common['Authorization'];
      setLoading(false);
      return;
    }

    try {
      const sessionToken = await getToken();
      if (!sessionToken) {
        setHr(null);
        setToken(null);
        setLoading(false);
        return;
      }

      setToken(sessionToken);
      axios.defaults.headers.common['Authorization'] = `Bearer ${sessionToken}`;

      // Fetch the app-specific profile from our backend
      const { data } = await axios.get(`${API}/hr/profile`);
      const profile = data.data?.hr;

      if (profile) {
        setHr({
          id: profile._id,
          name: profile.name ?? user?.fullName ?? '',
          email: profile.email ?? user?.primaryEmailAddress?.emailAddress ?? '',
          companyName: profile.companyName ?? '',
          companyLogo: profile.companyLogo,
          profileComplete: profile.profileComplete ?? false,
          isVerified: true, // Clerk handles email verification
          role: profile.role ?? 'owner',
          permissions: profile.permissions ?? [],
          organizationId: profile.organizationId,
        });
      } else {
        // Profile not yet in DB — build minimal object from Clerk data
        setHr({
          id: user?.id ?? '',
          name: user?.fullName ?? '',
          email: user?.primaryEmailAddress?.emailAddress ?? '',
          companyName: '',
          profileComplete: false,
          isVerified: true,
          role: 'owner',
          permissions: [],
        });
      }
    } catch {
      // If backend fetch fails, fall back to Clerk user data only
      if (user) {
        setHr({
          id: user.id,
          name: user.fullName ?? '',
          email: user.primaryEmailAddress?.emailAddress ?? '',
          companyName: '',
          profileComplete: false,
          isVerified: true,
          role: 'owner',
          permissions: [],
        });
      } else {
        setHr(null);
      }
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, userLoaded, getToken, user]);

  // Re-run whenever Clerk auth state changes
  useEffect(() => {
    if (!userLoaded) return;
    setLoading(true);
    refreshUser();
  }, [userLoaded, isSignedIn, refreshUser]);

  // ─── Auth actions ───────────────────────────────────────────────────────────

  /**
   * Sign in with email + password via Clerk.
   * Returns empty object on success (redirect handled by caller).
   */
  const login = async (
    email: string,
    password: string,
  ): Promise<{ mustChangePassword?: boolean; tempToken?: string }> => {
    if (!signIn) throw new Error('Clerk signIn not ready');

    const result = await signIn.create({
      identifier: email,
      password,
    });

    if (result.status !== 'complete') {
      // Handle MFA or other first-factor flows if needed
      throw new Error('Sign-in incomplete. Please check your email for a verification link.');
    }

    // Token will be picked up by the useEffect above on next render
    return {};
  };

  /**
   * Register a new HR user via Clerk.
   * Clerk automatically sends a verification email.
   * companyName is stored as user metadata and synced via webhook.
   */
  const register = async (
    name: string,
    email: string,
    password: string,
    companyName = '',
  ): Promise<{ requiresVerification: boolean; email: string }> => {
    if (!signUp) throw new Error('Clerk signUp not ready');

    // Split name into first/last
    const parts = name.trim().split(' ');
    const firstName = parts[0] ?? name;
    const lastName = parts.slice(1).join(' ') || undefined;

    await signUp.create({
      emailAddress: email,
      password,
      firstName,
      lastName,
      // Store companyName as unsafe metadata (synced to DB via webhook)
      unsafeMetadata: { companyName },
    });

    // Prepare email verification
    await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });

    return { requiresVerification: true, email };
  };

  /** Sign out via Clerk */
  const logout = () => {
    signOut();
    setHr(null);
    setToken(null);
    delete axios.defaults.headers.common['Authorization'];
  };

  /** Legacy no-op — Clerk manages sessions internally */
  const setAuthSession = (_t: string, _h: HR) => {
    // no-op: Clerk handles session storage
  };

  /** Returns true if owner OR has the specific permission flag */
  const hasPermission = (flag: string): boolean => {
    if (!hr) return false;
    if (hr.role === 'owner') return true;
    return hr.permissions?.includes(flag) ?? false;
  };

  return (
    <AuthContext.Provider
      value={{
        hr,
        token,
        loading,
        login,
        register,
        logout,
        refreshUser,
        setAuthSession,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
