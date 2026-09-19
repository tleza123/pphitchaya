'use client';

import React, { createContext, useContext } from 'react';

interface AuthContextType {
  user: { id: string; email?: string } | null;
  idToken: string | null;
  loading: boolean;
  isOwner: boolean;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: { id: 'single-owner', email: 'owner@local' },
  idToken: 'local-owner',
  loading: false,
  isOwner: true,
  signIn: async () => {},
  logout: async () => {},
  refreshToken: async () => 'local-owner'
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const user = { id: 'single-owner', email: 'owner@local' };
  const idToken = 'local-owner';
  const loading = false;
  const isOwner = true;
  const signIn = async () => {};
  const logout = async () => {};
  const refreshToken = async () => idToken;

  return (
    <AuthContext.Provider
      value={{
        user,
        idToken,
        loading,
        isOwner,
        signIn,
        logout,
        refreshToken
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

