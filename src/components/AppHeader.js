import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { RESTAURANT } from '../data/menu';
import { confirmDialog } from '../utils/confirm';
import { useResponsive } from '../hooks/useResponsive';
import ThemeModal from './ThemeModal';
import ProfileModal from './ProfileModal';
import DensityModal from './DensityModal';
import { spacing, font } from '../theme/theme';

export default function AppHeader() {
  const { user, logout } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { maxWidth } = useResponsive();
  const [themeModalOpen, setThemeModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [densityModalOpen, setDensityModalOpen] = useState(false);
  const styles = useMemo(() => makeStyles(colors), [colors]);

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
        <TouchableOpacity onPress={() => setDensityModalOpen(true)} style={styles.iconBtn} hitSlop={8}>
          <Text style={styles.iconBtnText}>📏</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setProfileModalOpen(true)} style={styles.iconBtn} hitSlop={8}>
          <Text style={styles.iconBtnText}>💳</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setThemeModalOpen(true)} style={styles.iconBtn} hitSlop={8}>
          <Text style={styles.iconBtnText}>🎨</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={confirmLogout} style={styles.logout} hitSlop={8}>
          <Text style={styles.logoutText}>Изход</Text>
        </TouchableOpacity>
      </View>
      <ThemeModal visible={themeModalOpen} onClose={() => setThemeModalOpen(false)} />
      <ProfileModal visible={profileModalOpen} user={user} onClose={() => setProfileModalOpen(false)} />
      <DensityModal visible={densityModalOpen} onClose={() => setDensityModalOpen(false)} />
    </View>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
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
    iconBtn: {
      width: 34,
      height: 34,
      borderRadius: 999,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm,
    },
    iconBtnText: { fontSize: 16 },
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
