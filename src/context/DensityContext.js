import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DensityContext = createContext(null);
const STORAGE_KEY = 'lunchhub.density';

// Comfortable is more spacious than the default; compact is tighter — same
// ordering as Gmail's density picker, which is what this toggle mirrors.
export const DENSITIES = [
  { id: 'comfortable', name: 'Разширено', scale: 1.35 },
  { id: 'default', name: 'По подразбиране', scale: 1 },
  { id: 'compact', name: 'Сбито', scale: 0.55 },
];
export const DEFAULT_DENSITY_ID = 'default';

export function getDensity(id) {
  return DENSITIES.find((d) => d.id === id) ?? DENSITIES.find((d) => d.id === DEFAULT_DENSITY_ID);
}

export function DensityProvider({ children }) {
  const [densityId, setDensityId] = useState(DEFAULT_DENSITY_ID);

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved && DENSITIES.some((d) => d.id === saved)) setDensityId(saved);
      } catch (_) {}
    })();
  }, []);

  const setDensity = async (id) => {
    if (!DENSITIES.some((d) => d.id === id)) return;
    setDensityId(id);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, id);
    } catch (_) {}
  };

  const value = useMemo(() => {
    const { scale } = getDensity(densityId);
    return {
      densityId,
      setDensity,
      scale,
      densities: DENSITIES,
    };
  }, [densityId]);

  return <DensityContext.Provider value={value}>{children}</DensityContext.Provider>;
}

export function useDensity() {
  const ctx = useContext(DensityContext);
  if (!ctx) throw new Error('useDensity must be used within DensityProvider');
  return ctx;
}
