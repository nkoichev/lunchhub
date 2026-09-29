import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform } from 'react-native';

const logo = require('../../assets/icon.png');

// Full-page loading indicator: the app icon spinning, instead of the stock
// ActivityIndicator. A rotated PNG rather than a GIF so it stays smooth at
// any size and needs no extra GIF support on Android.
export default function LogoSpinner({ size = 64, style }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 1600,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: Platform.OS !== 'web',
      })
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <Animated.Image
      source={logo}
      accessibilityRole="progressbar"
      accessibilityLabel="Зареждане"
      style={[{ width: size, height: size, transform: [{ rotate }] }, style]}
    />
  );
}
