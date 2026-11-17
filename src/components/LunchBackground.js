import React, { useMemo } from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { useTheme } from '../context/ThemeContext';

// Quiet, decorative backdrop for the login screen: a loose grid of faint,
// slightly rotated food emoji. Positions are deterministic (no Math.random)
// so the pattern doesn't jump around on re-render or resize.
const FOODS = ['🍲', '🥗', '🍝', '🥪', '🍕', '🥖', '🍜', '🍛', '🥘', '🍅', '🥕', '🧀', '🍋', '🥦', '🍳', '☕', '🍰', '🍎', '🌮', '🥐'];
const CELL = 120; // px between icons

// Cheap deterministic pseudo-random in [0, 1) from an integer seed.
const rand = (n) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

export default function LunchBackground() {
  const { colors } = useTheme();
  const { width, height } = useWindowDimensions();
  const dark = colors.statusBar === 'light'; // light status-bar text ⇒ dark theme

  const items = useMemo(() => {
    const cols = Math.ceil(width / CELL) + 1;
    const rows = Math.ceil(height / CELL) + 1;
    const out = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        // Offset every other row by half a cell for a less rigid look.
        const x = c * CELL + (r % 2 ? CELL / 2 : 0) + (rand(i) - 0.5) * 40 - CELL / 2;
        const y = r * CELL + (rand(i + 101) - 0.5) * 40 - CELL / 3;
        out.push({
          key: i,
          emoji: FOODS[(r * 7 + c * 3) % FOODS.length],
          left: x,
          top: y,
          size: 26 + Math.round(rand(i + 7) * 14),
          rotate: `${Math.round((rand(i + 13) - 0.5) * 50)}deg`,
        });
      }
    }
    return out;
  }, [width, height]);

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.wrap, { opacity: dark ? 0.07 : 0.09 }]}>
      {items.map((it) => (
        <Text
          key={it.key}
          style={{
            position: 'absolute',
            left: it.left,
            top: it.top,
            fontSize: it.size,
            transform: [{ rotate: it.rotate }],
          }}
        >
          {it.emoji}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
});
