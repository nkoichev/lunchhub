import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loginWithName,
  upsertUserFromSocial,
  linkSocialAccount,
  createSocialUser,
} from '../services/authService';
import { registerForPushNotifications } from '../services/pushService';
import {
  signInWithGoogle,
  signInWithFacebook,
  signOutSocial,
  extractProfileFromSession,
} from '../services/socialAuthService';
import { supabase } from '../config/supabase';

const AuthContext = createContext(null);
const STORAGE_KEY = 'lunchhub.user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  // Set when a Google/Facebook sign-in can't be auto-matched to a users row
  // (see upsertUserFromSocial's needsLink case) — Gate shows a picker screen
  // instead of the main app until this resolves via linkPendingTo /
  // createNewFromPending.
  const [pendingProfile, setPendingProfile] = useState(null);

  const persist = async (u) => {
    setUser(u);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    registerForPushNotifications(u);
  };

  // Shared by loginWithGoogle/Facebook and the web OAuth-redirect listener.
  const resolveSocialUpsert = async (result) => {
    if (result.needsLink) {
      setPendingProfile(result.profile);
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

    // Web-only: finishes the Google/Facebook OAuth redirect flow (native
    // resolves immediately inside loginWithGoogle/Facebook instead).
    if (Platform.OS !== 'web') return undefined;
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_IN' || !session?.user) return;
      const profile = extractProfileFromSession(session);
      if (!profile) return;
      upsertUserFromSocial(profile).then(resolveSocialUpsert).catch(() => {});
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  const login = async (name) => {
    const u = await loginWithName(name);
    await persist(u);
    return u;
  };

  const loginWithSocial = async (signIn) => {
    const profile = await signIn();
    if (!profile) return null; // cancelled, or web redirect in progress
    const result = await upsertUserFromSocial(profile);
    return resolveSocialUpsert(result);
  };
  const loginWithGoogle = () => loginWithSocial(signInWithGoogle);
  const loginWithFacebook = () => loginWithSocial(signInWithFacebook);

  // Picker: "this is me" — link the pending identity onto an existing
  // (unlinked for that provider) users row instead of creating a duplicate.
  const linkPendingTo = async (existingUserId) => {
    if (!pendingProfile) return null;
    const u = await linkSocialAccount(existingUserId, pendingProfile);
    setPendingProfile(null);
    await persist(u);
    return u;
  };

  // Picker: "нов съм" — genuinely new person, create their row with the
  // identity already linked.
  const createNewFromPending = async () => {
    if (!pendingProfile) return null;
    const u = await createSocialUser(pendingProfile);
    setPendingProfile(null);
    await persist(u);
    return u;
  };

  const cancelPendingLink = async () => {
    setPendingProfile(null);
    await signOutSocial().catch(() => {});
  };

  const logout = async () => {
    setUser(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
    await signOutSocial().catch(() => {});
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        booting,
        login,
        loginWithGoogle,
        loginWithFacebook,
        logout,
        pendingProfile,
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
