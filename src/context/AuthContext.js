import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loginWithName, upsertUserFromGoogle } from '../services/authService';
import { registerForPushNotifications } from '../services/pushService';
import { signInWithGoogle, signOutGoogle, extractProfileFromSession } from '../services/googleAuthService';
import { supabase } from '../config/supabase';

const AuthContext = createContext(null);
const STORAGE_KEY = 'lunchhub.user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  const persist = async (u) => {
    setUser(u);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    registerForPushNotifications(u);
  };

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const u = JSON.parse(raw);
          setUser(u);
          registerForPushNotifications(u);
        }
      } catch (_) {}
      setBooting(false);
    })();

    // Web-only: finishes the Google OAuth redirect flow (native resolves
    // immediately via the idToken path in googleAuthService instead).
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_IN' || !session?.user) return;
      const profile = extractProfileFromSession(session);
      if (!profile) return;
      upsertUserFromGoogle(profile).then(persist).catch(() => {});
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  const login = async (name) => {
    const u = await loginWithName(name);
    await persist(u);
    return u;
  };

  const loginWithGoogle = async () => {
    const profile = await signInWithGoogle();
    if (!profile) return null; // cancelled, or web redirect in progress
    const u = await upsertUserFromGoogle(profile);
    await persist(u);
    return u;
  };

  const logout = async () => {
    setUser(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
    await signOutGoogle().catch(() => {});
  };

  return (
    <AuthContext.Provider value={{ user, booting, login, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
