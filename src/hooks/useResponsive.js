import { Platform, useWindowDimensions } from 'react-native';

// Central place for responsive breakpoints so screens behave well on
// phones (narrow) and in a desktop browser (wide).
//
// Multi-column/grid layouts only ever make sense on the web build — a
// native phone is a phone regardless of its reported width, and some
// Android devices (large-screen phones, display-size zoom settings) report
// widths that cross these breakpoints, which would otherwise wrongly turn
// on desktop-oriented grids in the native app. Gating on Platform.OS here
// (once, centrally) keeps every screen that uses this hook single-column
// on native without each of them needing its own Platform check.
export function useResponsive() {
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isWide = isWeb && width >= 760;      // tablet / small desktop
  const isDesktop = isWeb && width >= 1000;

  // Grid columns for card lists (menu, orders, dishes).
  const columns = !isWeb ? 1 : width >= 1180 ? 3 : width >= 760 ? 2 : 1;

  // Comfortable centered content widths.
  const maxWidth = 1080;      // wide grids
  const readWidth = 720;      // forms / dense single-column reading

  return { width, isWide, isDesktop, columns, maxWidth, readWidth };
}
