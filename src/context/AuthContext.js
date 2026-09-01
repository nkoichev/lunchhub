import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loginWithName } from '../services/authService';
import { registerForPushNotifications } from '../services/pushService';
import { syncDeviceSteps } from '../services/stepSyncService';

const AuthContext = createContext(null);
const STORAGE_KEY = 'lunchhub.user';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const u = JSON.parse(raw);
          setUser(u);
          registerForPushNotifications(u);
          syncDeviceSteps(u);
        }
      } catch (_) {}
      setBooting(false);
    })();
  }, []);

  const login = async (name) => {
    const u = await loginWithName(name);
    setUser(u);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    registerForPushNotifications(u);
    syncDeviceSteps(u);
    return u;
  };

  const logout = async () => {
    setUser(null);
    await AsyncStorage.removeItem(STORAGE_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, booting, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
