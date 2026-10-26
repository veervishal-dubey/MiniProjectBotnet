import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

export interface ResearcherProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  organization: string;
  joinedAt: string;
  authProvider: 'supabase';
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: ResearcherProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isConfigured: boolean;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (
    email: string,
    password: string,
    metadata: { name: string; organization?: string; role?: string }
  ) => Promise<{ success: boolean; error?: string; message?: string; requiresEmailConfirmation?: boolean }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string; message?: string }>;
  updatePassword: (password: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper function to resolve researcher profile and database role safely
async function resolveUserProfile(authUser: User): Promise<ResearcherProfile> {
  const meta = authUser.user_metadata || {};
  let resolvedName = meta.name || authUser.email?.split('@')[0] || 'Researcher';
  let resolvedOrg = meta.organization || 'Independent Security Lab';
  // Trusted database authorization: default to least-privileged role
  let resolvedRole = 'Researcher';

  try {
    // 1. Fetch user profile from database if available
    const { data: profileRow } = await supabase
      .from('profiles')
      .select('full_name')
      .eq('id', authUser.id)
      .maybeSingle();

    if (profileRow?.full_name) {
      resolvedName = profileRow.full_name;
    }

    // 2. Fetch workspace membership role from database if available
    const { data: memberRow } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('user_id', authUser.id)
      .maybeSingle();

    if (memberRow?.role) {
      resolvedRole = memberRow.role;
    }
  } catch (err) {
    console.warn('Database profile resolution error:', err);
  }

  return {
    id: authUser.id,
    name: resolvedName,
    email: authUser.email || '',
    role: resolvedRole,
    organization: resolvedOrg,
    joinedAt: authUser.created_at || new Date().toISOString(),
    authProvider: 'supabase',
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ResearcherProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    async function initSession() {
      if (!isSupabaseConfigured) {
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          console.warn('Supabase getSession error:', error.message);
        } else if (data?.session && isMounted) {
          setSession(data.session);
          setUser(data.session.user);
          const resolved = await resolveUserProfile(data.session.user);
          if (isMounted) {
            setProfile(resolved);
          }
        }
      } catch (err) {
        console.warn('Auth initialization error:', err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initSession();

    // Listen to real Supabase auth state transitions
    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        if (!isMounted) return;

        setSession(currentSession);
        setUser(currentSession?.user ?? null);

        if (currentSession?.user) {
          const resolved = await resolveUserProfile(currentSession.user);
          if (isMounted) {
            setProfile(resolved);
            setIsLoading(false);
          }
        } else {
          if (isMounted) {
            setProfile(null);
            setIsLoading(false);
          }
        }
      }
    );

    return () => {
      isMounted = false;
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setIsLoading(false);
        return { success: false, error: error.message };
      }

      if (data.session && data.user) {
        setSession(data.session);
        setUser(data.user);
        const resolved = await resolveUserProfile(data.user);
        setProfile(resolved);
        setIsLoading(false);
        return { success: true };
      }

      setIsLoading(false);
      return { success: false, error: 'Authentication succeeded but no active session was returned.' };
    } catch (err: unknown) {
      setIsLoading(false);
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      return { success: false, error: msg };
    }
  };

  const signUp = async (
    email: string,
    password: string,
    metadata: { name: string; organization?: string; role?: string }
  ): Promise<{ success: boolean; error?: string; message?: string; requiresEmailConfirmation?: boolean }> => {
    setIsLoading(true);
    try {
      const trimmedName = metadata.name.trim();
      const trimmedOrg = metadata.organization?.trim() || 'Independent Security Lab';

      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            name: trimmedName,
            organization: trimmedOrg,
            // Automatically assign least-privileged role; users cannot self-assign privileged roles
            role: 'Researcher',
          },
        },
      });

      if (error) {
        setIsLoading(false);
        return { success: false, error: error.message };
      }

      if (data.user) {
        // Attempt to create or sync profile record in database
        try {
          await supabase.from('profiles').upsert({
            id: data.user.id,
            full_name: trimmedName,
          });
        } catch {
          // Handled gracefully if table has RLS policy awaiting confirmation
        }

        // Check if email confirmation is required by Supabase project settings
        if (!data.session) {
          setIsLoading(false);
          return {
            success: true,
            requiresEmailConfirmation: true,
            message: `Account registered for ${email}. Please check your inbox and confirm your email before signing in.`,
          };
        }

        setSession(data.session);
        setUser(data.user);
        const resolved = await resolveUserProfile(data.user);
        setProfile(resolved);
        setIsLoading(false);
        return {
          success: true,
          requiresEmailConfirmation: false,
          message: 'Research workspace account created successfully.',
        };
      }

      setIsLoading(false);
      return { success: false, error: 'Failed to create researcher profile.' };
    } catch (err: unknown) {
      setIsLoading(false);
      const msg = err instanceof Error ? err.message : 'Registration failed';
      return { success: false, error: msg };
    }
  };

  const signOut = async () => {
    setIsLoading(true);
    try {
      await supabase.auth.signOut().catch(e => console.warn('Supabase signOut error:', e));
    } finally {
      setUser(null);
      setSession(null);
      setProfile(null);
      setIsLoading(false);
    }
  };

  const resetPassword = async (email: string): Promise<{ success: boolean; error?: string; message?: string }> => {
    try {
      const redirectUrl = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectUrl,
      });

      if (error) {
        return { success: false, error: error.message };
      }

      return {
        success: true,
        message: 'Password recovery email sent. Please check your inbox for the reset link.',
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send recovery email';
      return { success: false, error: msg };
    }
  };

  const updatePassword = async (password: string): Promise<{ success: boolean; error?: string }> => {
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update password';
      return { success: false, error: msg };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        isAuthenticated: session !== null && user !== null,
        isLoading,
        isConfigured: isSupabaseConfigured,
        signIn,
        signUp,
        signOut,
        resetPassword,
        updatePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
