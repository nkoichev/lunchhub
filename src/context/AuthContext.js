import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loginWithName,
  upsertUserFromGoogle,
  linkGoogleAccount,
  createGoogleUser,
} from '../services/authService';
import { registerForPushNotifications } from '../services/pushService';
import { signInWithGoogle, signOutGoogle, extractProfileFromSession } from '../services/googleAuthService';
import { supabase } from '../config/supabase';

const AuthContext = createContext(null);
const STORAGE_KEY = 'lunchhub.user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  // Set when a Google sign-in can't be auto-matched to a users row (see
  // upsertUserFromGoogle's needsLink case) — Gate shows a picker screen
  // instead of the main app until this resolves via linkPendingTo /
  // createNewFromPending.
  const [pendingGoogleProfile, setPendingGoogleProfile] = useState(null);

  const persist = async (u) => {
    setUser(u);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    registerForPushNotifications(u);
  };

  // Shared by loginWithGoogle and the web OAuth-redirect listener below.
  const resolveGoogleUpsert = async (result) => {
    if (result.needsLink) {
      setPendingGoogleProfile(result.profile);
      return null;
    }
    await persist(result);
    return result;
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
      upsertUserFromGoogle(profile).then(resolveGoogleUpsert).catch(() => {});
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
    const result = await upsertUserFromGoogle(profile);
    return resolveGoogleUpsert(result);
  };

  // Picker: "this is me" — link the pending Google identity onto an
  // existing (unlinked) users row instead of creating a duplicate.
  const linkPendingTo = async (existingUserId) => {
    if (!pendingGoogleProfile) return null;
    const { authUserId, avatarUrl } = pendingGoogleProfile;
    const u = await linkGoogleAccount(existingUserId, { authUserId, avatarUrl });
    setPendingGoogleProfile(null);
    await persist(u);
    return u;
  };

  // Picker: "нов съм" — genuinely new person, create their row with the
  // Google identity already linked.
  const createNewFromPending = async () => {
    if (!pendingGoogleProfile) return null;
    const u = await createGoogleUser(pendingGoogleProfile);
    setPendingGoogleProfile(null);
    await persist(u);
    return u;
  };

  const cancelPendingLink = async () => {
    setPendingGoogleProfile(null);
    await signOutGoogle().catch(() => {});
  };

  const logout = async () => {
    setUser(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
    await signOutGoogle().catch(() => {});
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        booting,
        login,
        loginWithGoogle,
        logout,
        pendingGoogleProfile,
        linkPendingTo,
        createNewFromPending,
        cancelPendingLink,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
