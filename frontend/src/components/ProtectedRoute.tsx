import React from 'react';
import { Navigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';

/**
 * ProtectedRoute — Clerk-powered route guard.
 *
 * Uses Clerk's useUser() to check if the user is signed in.
 * - While Clerk is loading: show a spinner
 * - Not signed in: redirect to /login
 * - Signed in: render children
 */
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return (
      <div className="page-loader">
        <div className="spinner" />
      </div>
    );
  }

  if (!isSignedIn) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

export default ProtectedRoute;
