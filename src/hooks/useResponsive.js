import { useWindowDimensions } from 'react-native';

// Central place for responsive breakpoints so screens behave well on
// phones (narrow) and in a desktop browser (wide).
export function useResponsive() {
  const { width } = useWindowDimensions();
  const isWide = width >= 760;      // tablet / small desktop
  const isDesktop = width >= 1000;

  // Grid columns for card lists (menu, orders, dishes).
  const columns = width >= 1180 ? 3 : width >= 760 ? 2 : 1;

  // Comfortable centered content widths.
  const maxWidth = 1080;      // wide grids
  const readWidth = 720;      // forms / dense single-column reading

  return { width, isWide, isDesktop, columns, maxWidth, readWidth };
}
