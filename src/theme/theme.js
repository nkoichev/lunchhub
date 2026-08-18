// Central design system for LunchHub.
// A single source of truth keeps the whole app visually consistent.

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
};

export const font = {
  // Font sizes
  xs: 12,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  xxl: 30,
  // Weights
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};

export const CURRENCY = '€';

// ---------- Color schemes ----------
// Every palette shares the same keys so any screen can be themed just by
// swapping which one is active — no per-screen color logic.
const PALETTES = {
  warm: {
    name: 'Топла',
    colors: {
      primary: '#E85D2F',
      primaryDark: '#C4491F',
      primaryLight: '#FCEAE2',
      accent: '#1E9E7A',
      bg: '#F6F5F3',
      surface: '#FFFFFF',
      surfaceAlt: '#FAF8F6',
      border: '#ECE8E3',
      text: '#1E1B18',
      textMuted: '#7A736C',
      textFaint: '#A8A099',
      onPrimary: '#FFFFFF',
      success: '#1E9E7A',
      danger: '#D64545',
      warning: '#E0A100',
      star: '#F5A623',
      starEmpty: '#DDD6CE',
      overlay: 'rgba(20,16,14,0.45)',
      shadowColor: '#3A2A20',
      statusBar: 'dark',
    },
  },
  dark: {
    name: 'Тъмна',
    colors: {
      primary: '#FF7A45',
      primaryDark: '#E85D2F',
      primaryLight: '#3A2419',
      accent: '#34C795',
      bg: '#15171A',
      surface: '#1E2125',
      surfaceAlt: '#24272C',
      border: '#2E3237',
      text: '#F1EFEC',
      textMuted: '#A6A6AA',
      textFaint: '#75767B',
      onPrimary: '#FFFFFF',
      success: '#34C795',
      danger: '#FF6B6B',
      warning: '#F0B429',
      star: '#FFC24B',
      starEmpty: '#3A3D42',
      overlay: 'rgba(0,0,0,0.6)',
      shadowColor: '#000000',
      statusBar: 'light',
    },
  },
  ocean: {
    name: 'Океан',
    colors: {
      primary: '#2B7FD6',
      primaryDark: '#1F5FA8',
      primaryLight: '#DCEBFB',
      accent: '#17A2B8',
      bg: '#F4F7FA',
      surface: '#FFFFFF',
      surfaceAlt: '#F0F5FA',
      border: '#DCE6EF',
      text: '#142433',
      textMuted: '#5C7284',
      textFaint: '#93A4B2',
      onPrimary: '#FFFFFF',
      success: '#1E9E7A',
      danger: '#D64545',
      warning: '#E0A100',
      star: '#F5A623',
      starEmpty: '#D9E2E9',
      overlay: 'rgba(10,20,35,0.45)',
      shadowColor: '#142433',
      statusBar: 'dark',
    },
  },
  forest: {
    name: 'Гора',
    colors: {
      primary: '#3C8A52',
      primaryDark: '#2C6B3E',
      primaryLight: '#E1F0E3',
      accent: '#C9822B',
      bg: '#F5F7F3',
      surface: '#FFFFFF',
      surfaceAlt: '#F1F5EE',
      border: '#E0E8DC',
      text: '#1B2318',
      textMuted: '#6F7A67',
      textFaint: '#A1AA98',
      onPrimary: '#FFFFFF',
      success: '#3C8A52',
      danger: '#D64545',
      warning: '#E0A100',
      star: '#F5A623',
      starEmpty: '#DCE3D6',
      overlay: 'rgba(16,26,16,0.45)',
      shadowColor: '#1B2318',
      statusBar: 'dark',
    },
  },
  berry: {
    name: 'Боровинка',
    colors: {
      primary: '#9C3D6E',
      primaryDark: '#7A2E56',
      primaryLight: '#F6E2EC',
      accent: '#6C4FA0',
      bg: '#FAF5F7',
      surface: '#FFFFFF',
      surfaceAlt: '#F6EEF2',
      border: '#EEDDE4',
      text: '#241620',
      textMuted: '#7C6A75',
      textFaint: '#B29AA8',
      onPrimary: '#FFFFFF',
      success: '#1E9E7A',
      danger: '#D64545',
      warning: '#E0A100',
      star: '#F5A623',
      starEmpty: '#E6D6DE',
      overlay: 'rgba(30,10,25,0.45)',
      shadowColor: '#241620',
      statusBar: 'dark',
    },
  },
};

export const THEMES = Object.entries(PALETTES).map(([id, t]) => ({
  id,
  name: t.name,
  colors: t.colors,
}));

export const DEFAULT_THEME_ID = 'warm';

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}

// Shadows depend on the palette's shadow tint (a near-black in light themes,
// pure black in dark ones), so they're derived per-theme rather than fixed.
export function makeShadow(colors) {
  return {
    card: {
      shadowColor: colors.shadowColor,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 3,
    },
    floating: {
      shadowColor: colors.shadowColor,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.16,
      shadowRadius: 20,
      elevation: 8,
    },
  };
}
