import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

function initialsOf(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

// Shows the person's Google profile photo when they have one (uri), and
// otherwise a colored circle with their initials — used anywhere a name
// shows up (header, rankings, steps) so Google users are recognizable.
export default function Avatar({ uri, name, size = 28 }) {
  const { colors } = useTheme();
  const [failed, setFailed] = useState(false);
  const dim = { width: size, height: size, borderRadius: size / 2 };

  if (uri && !failed) {
    return <Image source={{ uri }} style={[dim, styles.image]} onError={() => setFailed(true)} />;
  }

  return (
    <View style={[dim, styles.fallback, { backgroundColor: colors.primaryLight }]}>
      <Text style={[styles.initials, { fontSize: size * 0.4, color: colors.primaryDark }]}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { backgroundColor: '#ddd' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontWeight: '700' },
});
