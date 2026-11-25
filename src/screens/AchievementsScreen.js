import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useResponsive } from '../hooks/useResponsive';
import { loadFunData, computeUserStats } from '../services/funStatsService';
import Avatar from '../components/Avatar';
import LogoSpinner from '../components/LogoSpinner';
import PopPressable from '../components/PopPressable';
import { tapHaptic } from '../utils/haptics';
import { spacing, radius, font } from '../theme/theme';

export default function AchievementsScreen({ navigation }) {
  const { user } = useAuth();
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { readWidth, isWide } = useResponsive();
  const [data, setData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [openBadge, setOpenBadge] = useState(null);

  const load = useCallback(async (force = false) => {
    try {
      setData(await loadFunData({ force }));
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const mine = useMemo(() => (data && user ? computeUserStats(user.id, data) : null), [data, user]);
  const team = useMemo(() => {
    if (!data) return [];
    const ids = new Set(data.orders.map((o) => o.userId));
    return [...ids]
      .map((id) => {
        const u = data.users.find((x) => x.id === id);
        const st = computeUserStats(id, data);
        return { id, name: u?.name ?? '—', avatarUrl: u?.avatar_url, st };
      })
      .sort((a, b) => b.st.earnedCount - a.st.earnedCount || b.st.orderDays - a.st.orderDays);
  }, [data]);

  if (!mine) {
    return (
      <View style={styles.center}>
        <LogoSpinner />
      </View>
    );
  }

  const openWrapped = (period) => {
    tapHaptic();
    navigation.navigate('Wrapped', { period });
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load(true);
          }}
          tintColor={colors.primary}
        />
      }
    >
      <View style={{ width: '100%', maxWidth: isWide ? 960 : readWidth, alignSelf: 'center' }}>
        <View style={[styles.hero, shadow.card]}>
          <Avatar uri={user.avatarUrl} name={user.name} size={56} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <Text style={styles.heroName}>{user.name}</Text>
            <Text style={styles.heroSub}>
              🏅 {mine.earnedCount}/{mine.badges.length} значки · 🍽️ {mine.orderDays} обяда
            </Text>
          </View>
        </View>

        <View style={styles.streakRow}>
          <View style={[styles.streakCard, shadow.card]}>
            <Text style={styles.streakEmoji}>🔥</Text>
            <Text style={styles.streakValue}>{mine.orderStreak}</Text>
            <Text style={styles.streakLabel}>работни дни поред с поръчка</Text>
            <Text style={styles.streakBest}>рекорд: {mine.bestOrderStreak}</Text>
          </View>
          <View style={[styles.streakCard, shadow.card]}>
            <Text style={styles.streakEmoji}>👟</Text>
            <Text style={styles.streakValue}>{mine.stepStreak}</Text>
            <Text style={styles.streakLabel}>дни поред над 10 000 стъпки</Text>
            <Text style={styles.streakBest}>рекорд: {mine.bestStepStreak}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>🎁 LunchHub Wrapped</Text>
        <View style={styles.wrappedRow}>
          {[
            ['thisMonth', 'Този месец'],
            ['lastMonth', 'Миналия месец'],
            ['thisYear', 'Тази година'],
          ].map(([id, label]) => (
            <View key={id} style={{ flex: 1 }}>
              <PopPressable style={[styles.wrappedBtn, shadow.card]} onPress={() => openWrapped(id)}>
                <Text style={styles.wrappedBtnText}>{label}</Text>
              </PopPressable>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>🏅 Значки</Text>
        {isWide ? (
          <View style={styles.gridWide}>
            {mine.badges.map((b) => (
              <View key={b.id} style={styles.badgeWideCell}>
                <View style={[styles.badgeWide, shadow.card, b.earned && styles.badgeEarned]}>
                  <Text style={[styles.badgeWideEmoji, !b.earned && { opacity: 0.3 }]}>{b.emoji}</Text>
                  <View style={{ flex: 1, marginLeft: spacing.md }}>
                    <Text style={styles.badgeWideTitle}>{b.title}</Text>
                    <Text style={styles.badgeWideDesc}>{b.desc}</Text>
                    {b.earned ? (
                      <Text style={styles.earned}>✓ Отключена</Text>
                    ) : (
                      <View style={styles.progressRow}>
                        <View style={[styles.track, { flex: 1, marginTop: 0 }]}>
                          <View style={[styles.fill, { width: `${Math.round((b.value / b.target) * 100)}%` }]} />
                        </View>
                        <Text style={[styles.progressText, { marginTop: 0, marginLeft: spacing.sm }]}>
                          {b.value}/{b.target}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.grid}>
            {mine.badges.map((b) => {
              const open = openBadge === b.id;
              return (
                <View key={b.id} style={styles.badgeCell}>
                  <PopPressable
                    scaleTo={0.93}
                    onPress={() => {
                      tapHaptic();
                      setOpenBadge(open ? null : b.id);
                    }}
                    style={[styles.badge, shadow.card, b.earned && styles.badgeEarned]}
                  >
                    <Text style={[styles.badgeEmoji, !b.earned && { opacity: 0.3 }]}>{b.emoji}</Text>
                    <Text style={styles.badgeTitle} numberOfLines={2}>
                      {b.title}
                    </Text>
                    {(open || !b.earned) && <Text style={styles.badgeDesc}>{b.desc}</Text>}
                    {!b.earned && (
                      <>
                        <View style={styles.track}>
                          <View style={[styles.fill, { width: `${Math.round((b.value / b.target) * 100)}%` }]} />
                        </View>
                        <Text style={styles.progressText}>
                          {b.value}/{b.target}
                        </Text>
                      </>
                    )}
                    {b.earned && <Text style={styles.earned}>✓ Отключена</Text>}
                  </PopPressable>
                </View>
              );
            })}
          </View>
        )}

        <Text style={styles.sectionTitle}>👥 Отборът</Text>
        {team.map((t, i) => {
          const earned = t.st.badges.filter((b) => b.earned);
          return (
            <View key={t.id} style={[styles.teamRow, shadow.card, t.id === user.id && styles.teamRowMe]}>
              <View style={styles.teamHead}>
                <Text style={styles.rank}>{i + 1}</Text>
                <Avatar uri={t.avatarUrl} name={t.name} size={30} />
                <View style={{ flex: 1, marginLeft: spacing.sm }}>
                  <Text style={styles.teamName}>{t.name}</Text>
                  {!isWide && (
                    <Text style={styles.teamBadges} numberOfLines={1}>
                      {earned.map((b) => b.emoji).join(' ') || 'още без значки'}
                    </Text>
                  )}
                </View>
                <Text style={styles.teamCount}>{t.st.earnedCount} 🏅</Text>
              </View>
              {isWide &&
                (earned.length ? (
                  <View style={styles.chips}>
                    {earned.map((b) => (
                      <View key={b.id} style={styles.chip}>
                        <Text style={styles.chipEmoji}>{b.emoji}</Text>
                        <View>
                          <Text style={styles.chipTitle}>{b.title}</Text>
                          <Text style={styles.chipDesc}>{b.desc}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={[styles.teamBadges, { marginLeft: 58, marginTop: spacing.xs }]}>още без значки</Text>
                ))}
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    content: { padding: spacing.lg, paddingBottom: spacing.xxl },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    heroName: { fontSize: font.lg, fontWeight: font.bold, color: colors.text },
    heroSub: { fontSize: font.sm, color: colors.textMuted, marginTop: 2 },
    streakRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    streakCard: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      padding: spacing.lg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    streakEmoji: { fontSize: 28 },
    streakValue: { fontSize: font.xxl, fontWeight: font.bold, color: colors.primary },
    streakLabel: { fontSize: font.xs, color: colors.textMuted, textAlign: 'center' },
    streakBest: { fontSize: font.xs, color: colors.textFaint, marginTop: 4 },
    sectionTitle: {
      fontSize: font.md,
      fontWeight: font.bold,
      color: colors.text,
      marginTop: spacing.xl,
      marginBottom: spacing.md,
    },
    wrappedRow: { flexDirection: 'row', gap: spacing.sm },
    wrappedBtn: {
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.md,
      borderRadius: radius.md,
      backgroundColor: colors.primary,
    },
    wrappedBtnText: { color: colors.onPrimary, fontWeight: font.bold, fontSize: font.sm, textAlign: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    badgeCell: { width: '31.5%', marginBottom: spacing.sm },
    badge: {
      flex: 1,
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    gridWide: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -spacing.xs },
    badgeWideCell: { width: '33.333%', padding: spacing.xs },
    badgeWide: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    badgeWideEmoji: { fontSize: 36 },
    badgeWideTitle: { fontSize: font.sm, fontWeight: font.bold, color: colors.text },
    badgeWideDesc: { fontSize: font.xs, color: colors.textMuted, marginTop: 2 },
    progressRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm },
    badgeEarned: { borderColor: colors.star, borderWidth: 1.5 },
    badgeEmoji: { fontSize: 34 },
    badgeTitle: { fontSize: font.sm, fontWeight: font.bold, color: colors.text, textAlign: 'center', marginTop: 4 },
    badgeDesc: { fontSize: font.xs, color: colors.textMuted, textAlign: 'center', marginTop: 2 },
    track: {
      width: '100%',
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.surfaceAlt,
      overflow: 'hidden',
      marginTop: spacing.sm,
    },
    fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
    progressText: { fontSize: font.xs, color: colors.textFaint, marginTop: 2 },
    earned: { fontSize: font.xs, color: colors.success, fontWeight: font.semibold, marginTop: 4 },
    teamRow: {
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.sm,
      borderWidth: 1,
      borderColor: colors.border,
    },
    teamHead: { flexDirection: 'row', alignItems: 'center' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm, marginLeft: 58 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surfaceAlt,
      borderRadius: radius.sm,
      paddingVertical: 4,
      paddingHorizontal: spacing.sm,
    },
    chipEmoji: { fontSize: 18, marginRight: 6 },
    chipTitle: { fontSize: font.xs, fontWeight: font.bold, color: colors.text },
    chipDesc: { fontSize: 11, color: colors.textMuted },
    teamRowMe: { borderColor: colors.primary, borderWidth: 1.5 },
    rank: { width: 22, fontSize: font.md, fontWeight: font.bold, color: colors.primary, textAlign: 'center', marginRight: 6 },
    teamName: { fontSize: font.base, fontWeight: font.semibold, color: colors.text },
    teamBadges: { fontSize: font.sm, marginTop: 1, color: colors.textMuted },
    teamCount: { fontSize: font.sm, fontWeight: font.bold, color: colors.textMuted },
  });
