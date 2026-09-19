'use client';

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';

interface AuthContextType {
  user: User | null;
  idToken: string | null;
  loading: boolean;
  isOwner: boolean;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  idToken: null,
  loading: true,
  isOwner: false,
  signIn: async () => {},
  logout: async () => {},
  refreshToken: async () => 'local-owner'
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    const applySession = async (session: Awaited<ReturnType<typeof supabase.auth.getSession>>['data']['session']) => {
      setUser(session?.user ?? null);
      setIdToken(session?.access_token ?? null);
      setIsOwner(Boolean(session?.user && (!process.env.NEXT_PUBLIC_OWNER_UID || session.user.id === process.env.NEXT_PUBLIC_OWNER_UID)));
      setLoading(false);
    };
    supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { void applySession(session); });
    return () => listener.subscription.unsubscribe();
  }, [supabase]);

  const signIn = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: { prompt: 'select_account' } }
    });
    if (error) throw error;
  };
  const logout = async () => { const { error } = await supabase.auth.signOut(); if (error) throw error; };
  const refreshToken = async () => {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) return null;
    setIdToken(data.session?.access_token ?? null);
    return data.session?.access_token ?? null;
  };

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

