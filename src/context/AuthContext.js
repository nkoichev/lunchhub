import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotifications } from '../services/pushService';
import { signInWithGoogle, signInWithFacebook, signOutSocial } from '../services/socialAuthService';
import { supabase } from '../config/supabase';

// Who you are in LunchHub comes only from a real Supabase Auth session (a
// login code sent to your email, or Google): the server maps the session's
// confirmed email to a person via public.allowed_emails (maintained from VEAS
// BG → Personal → LunchHub) and the my_lunch_user() RPC returns that person.
// There is no name-only login and no client-side PIN any more — both let
// anyone act as anyone.
//
// The profile is cached only so the app can open offline; it is used only
// while a session for the same auth user exists.
const AuthContext = createContext(null);
const STORAGE_KEY = 'lunchhub.user';

const NOT_ALLOWED =
  'Този имейл няма достъп до LunchHub. Помолете Николай да го добави.';

// Friendlier text for the errors Supabase Auth returns on the code flow.
export function authErrorMessage(e) {
  const m = String(e?.message || e || '');
  if (/LUNCHHUB_EMAIL_NOT_ALLOWED|Database error saving new user|not allowed/i.test(m)) return NOT_ALLOWED;
  if (/expired|invalid.*(otp|token)|token.*(expired|invalid)/i.test(m)) return 'Кодът е грешен или е изтекъл. Поискайте нов.';
  if (/rate limit|too many|security purposes|after \d+ seconds/i.test(m)) return 'Твърде много опити. Изчакайте малко и опитайте пак.';
  if (/network|fetch/i.test(m)) return 'Няма връзка със сървъра. Проверете интернета.';
  return m || 'Неуспешен вход.';
}

async function fetchMember() {
  const { data, error } = await supabase.rpc('my_lunch_user');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { id: row.id, name: row.name, avatarUrl: row.avatar_url ?? null } : null;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);
  const [authError, setAuthError] = useState(null);
  const loadedFor = useRef(null); // auth user id the current profile belongs to

  const clearLocal = async () => {
    loadedFor.current = null;
    setUser(null);
    await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  };

  // Resolve the LunchHub person for a session (or sign out if there is none).
  const applySession = async (session) => {
    const authId = session?.user?.id;
    if (!authId) {
      await clearLocal();
      return null;
    }
    try {
      const member = await fetchMember();
      if (!member) {
        // Signed in, but the email isn't (or is no longer) on the list.
        setAuthError(NOT_ALLOWED);
        await signOutSocial().catch(() => {});
        await clearLocal();
        return null;
      }
      const u = { ...member, authUserId: authId, email: session.user.email ?? null };
      loadedFor.current = authId;
      setUser(u);
      setAuthError(null);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(u)).catch(() => {});
      registerForPushNotifications(u);
      return u;
    } catch (e) {
      // Offline: fall back to the cached profile of this same auth user.
      const raw = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
      const cached = raw ? JSON.parse(raw) : null;
      if (cached?.authUserId === authId) {
        loadedFor.current = authId;
        setUser(cached);
        return cached;
      }
      setAuthError(authErrorMessage(e));
      return null;
    }
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (alive) await applySession(data?.session ?? null);
      } catch (_) {
        if (alive) await clearLocal();
      }
      if (alive) setBooting(false);
    })();

    // Code sign-in, Google (incl. the web redirect), sign-out, and a session
    // ending elsewhere all come through here.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        clearLocal();
      } else if (event === 'SIGNED_IN' && session?.user?.id !== loadedFor.current) {
        // Deferred: calling Supabase inside this callback can deadlock the client.
        setTimeout(() => applySession(session).then(updateGooglePhoto), 0);
      }
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A Google sign-in keeps the person's photo in sync with their Google one.
  const updateGooglePhoto = async (u) => {
    if (!u) return;
    const { data } = await supabase.auth.getUser().catch(() => ({ data: null }));
    const au = data?.user;
    const identities = au?.identities || [];
    const latest = identities.reduce(
      (a, b) => (new Date(b.last_sign_in_at || 0) > new Date(a?.last_sign_in_at || 0) ? b : a),
      null
    );
    if (latest?.provider !== 'google') return;
    const pic = au.user_metadata?.avatar_url || au.user_metadata?.picture;
    if (!pic || pic === u.avatarUrl) return;
    const { error } = await supabase.from('users').update({ avatar_url: pic }).eq('id', u.id);
    if (!error) {
      const fresh = { ...u, avatarUrl: pic };
      setUser(fresh);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(fresh)).catch(() => {});
    }
  };

  // Step 1 of the code login: only addresses on the list get an email at all.
  const sendEmailCode = async (rawEmail) => {
    const email = String(rawEmail || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Въведете валиден имейл.');
    const { data: allowed, error: chkErr } = await supabase.rpc('email_allowed', { p_email: email });
    if (chkErr) throw new Error(authErrorMessage(chkErr));
    if (!allowed) throw new Error(NOT_ALLOWED);
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) throw new Error(authErrorMessage(error));
    return email;
  };

  // Step 2: the code from the email. onAuthStateChange then loads the person.
  const verifyEmailCode = async (email, code) => {
    setAuthError(null);
    const token = String(code || '').replace(/\D/g, '');
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw new Error(authErrorMessage(error));
    const u = await applySession(data.session);
    if (!u) throw new Error(NOT_ALLOWED);
    return u;
  };

  const loginWith = async (signIn) => {
    setAuthError(null);
    try {
      await signIn(); // on success onAuthStateChange(SIGNED_IN) loads the person
    } catch (e) {
      throw new Error(authErrorMessage(e));
    }
  };
  const loginWithGoogle = () => loginWith(signInWithGoogle);
  const loginWithFacebook = () => loginWith(signInWithFacebook);

  const logout = async () => {
    await clearLocal();
    await signOutSocial().catch(() => {});
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        booting,
        authError,
        sendEmailCode,
        verifyEmailCode,
        loginWithGoogle,
        loginWithFacebook,
        logout,
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
