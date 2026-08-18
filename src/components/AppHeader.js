import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { RESTAURANT } from '../data/menu';
import { confirmDialog } from '../utils/confirm';
import { useResponsive } from '../hooks/useResponsive';
import { colors, spacing, font } from '../theme/theme';

export default function AppHeader() {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const { maxWidth } = useResponsive();

  const confirmLogout = () => {
    confirmDialog({
      title: 'Изход',
      message: 'Сигурни ли сте, че искате да излезете?',
      confirmText: 'Изход',
      destructive: true,
      onConfirm: logout,
    });
  };

  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <View style={[styles.inner, { maxWidth, alignSelf: 'center', width: '100%' }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>Здравей, {user?.name} 👋</Text>
          <Text style={styles.subtitle}>{RESTAURANT.name}</Text>
        </View>
        <TouchableOpacity onPress={confirmLogout} style={styles.logout} hitSlop={8}>
          <Text style={styles.logoutText}>Изход</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  greeting: { fontSize: font.lg, fontWeight: font.bold, color: colors.text },
  subtitle: { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },
  logout: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  logoutText: { color: colors.textMuted, fontSize: font.sm, fontWeight: font.semibold },
});
