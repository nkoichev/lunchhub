import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';

// Gentle falling snow over the whole app for the winter theme. Purely
// decorative: pointerEvents="none" so it never blocks a tap, and every
// flake animates on the native driver so it stays cheap.
const FLAKES = 16;

function Flake({ width, height, seed }) {
  const y = useRef(new Animated.Value(0)).current;
  const cfg = useMemo(() => {
    const r = (n) => ((Math.sin(seed * 999 + n) + 1) / 2); // deterministic 0..1
    return {
      x: r(1) * width,
      size: 9 + r(2) * 9,
      duration: 9000 + r(3) * 9000,
      delay: r(4) * 9000,
      drift: (r(5) - 0.5) * 60,
      opacity: 0.35 + r(6) * 0.45,
    };
  }, [width, seed]);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(y, { toValue: 1, duration: cfg.duration, easing: Easing.linear, useNativeDriver: true })
    );
    const t = setTimeout(() => anim.start(), cfg.delay);
    return () => {
      clearTimeout(t);
      anim.stop();
    };
  }, [cfg]);

  return (
    <Animated.Text
      style={{
        position: 'absolute',
        left: cfg.x,
        top: -20,
        fontSize: cfg.size,
        color: '#FFFFFF',
        opacity: cfg.opacity,
        textShadowColor: 'rgba(120,150,190,0.6)',
        textShadowRadius: 2,
        transform: [
          { translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, height + 40] }) },
          { translateX: y.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, cfg.drift, 0] }) },
        ],
      }}
    >
      ❄
    </Animated.Text>
  );
}

export default function Snowfall() {
  const { width, height } = useWindowDimensions();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: FLAKES }, (_, i) => (
        <Flake key={i} seed={i + 1} width={width} height={height} />
      ))}
    </View>
  );
}
