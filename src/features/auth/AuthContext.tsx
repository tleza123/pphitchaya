'use client';

import React, { createContext, useContext, useState } from 'react';
import { User } from 'firebase/auth';

interface AuthContextType {
  user: User | null;
  idToken: string | null;
  loading: boolean;
  isOwner: boolean;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<string | null>;
}

const defaultOwnerUser = {
  uid: 'single-owner',
  email: 'owner@local',
  displayName: 'เจ้าของร้าน'
} as unknown as User;

const AuthContext = createContext<AuthContextType>({
  user: defaultOwnerUser,
  idToken: 'local-owner',
  loading: false,
  isOwner: true,
  signIn: async () => {},
  logout: async () => {},
  refreshToken: async () => 'local-owner'
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Single-user mode: immediate ready state without login barrier
  const [user] = useState<User | null>(defaultOwnerUser);
  const [idToken] = useState<string | null>('local-owner');
  const [loading] = useState(false);
  const [isOwner] = useState(true);

  const signIn = async () => {};
  const logout = async () => {};
  const refreshToken = async () => 'local-owner';

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

