import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEMES, DEFAULT_THEME_ID, getTheme, makeShadow } from '../theme/theme';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'lunchhub.theme';

export function ThemeProvider({ children }) {
  const [schemeId, setSchemeId] = useState(DEFAULT_THEME_ID);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved && THEMES.some((t) => t.id === saved)) setSchemeId(saved);
      } catch (_) {}
    })();
  }, []);

  const setScheme = async (id) => {
    if (!THEMES.some((t) => t.id === id)) return;
    setSchemeId(id);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, id);
    } catch (_) {}
  };

  const value = useMemo(() => {
    const theme = getTheme(schemeId);
    return {
      schemeId,
      setScheme,
      colors: theme.colors,
      shadow: makeShadow(theme.colors),
      themes: THEMES,
    };
  }, [schemeId]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
