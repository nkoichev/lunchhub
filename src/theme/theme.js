// Central design system for LunchHub.
// A single source of truth keeps the whole app visually consistent.

export const colors = {
  // Brand
  primary: '#E85D2F',        // warm appetite-red/orange
  primaryDark: '#C4491F',
  primaryLight: '#FCEAE2',
  accent: '#1E9E7A',         // fresh green for confirmations/prices

  // Neutrals
  bg: '#F6F5F3',             // warm off-white app background
  surface: '#FFFFFF',
  surfaceAlt: '#FAF8F6',
  border: '#ECE8E3',

  // Text
  text: '#1E1B18',
  textMuted: '#7A736C',
  textFaint: '#A8A099',
  onPrimary: '#FFFFFF',

  // Feedback
  success: '#1E9E7A',
  danger: '#D64545',
  warning: '#E0A100',
  star: '#F5A623',
  starEmpty: '#DDD6CE',

  // Overlay
  overlay: 'rgba(20,16,14,0.45)',
};

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

export const shadow = {
  card: {
    shadowColor: '#3A2A20',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  floating: {
    shadowColor: '#3A2A20',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 8,
  },
};

export const CURRENCY = '€';
