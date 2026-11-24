import React, { useRef } from 'react';
import { Animated, Pressable } from 'react-native';

// A Pressable that squishes on press and springs back — the small "tactile"
// micro-animation used for +/− buttons, reactions and the like.
export default function PopPressable({ children, style, onPress, disabled, hitSlop, scaleTo = 0.86, ...rest }) {
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v, bouncy) =>
    Animated.spring(scale, {
      toValue: v,
      useNativeDriver: true,
      speed: bouncy ? 14 : 40,
      bounciness: bouncy ? 14 : 0,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      onPressIn={() => to(scaleTo, false)}
      onPressOut={() => to(1, true)}
      {...rest}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

// Imperative "bump" for a value change (e.g. the cart bar when count grows).
export function useBump() {
  const v = useRef(new Animated.Value(1)).current;
  const bump = () => {
    v.stopAnimation();
    v.setValue(1);
    Animated.sequence([
      Animated.timing(v, { toValue: 1.07, duration: 90, useNativeDriver: true }),
      Animated.spring(v, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 12 }),
    ]).start();
  };
  return [v, bump];
}
