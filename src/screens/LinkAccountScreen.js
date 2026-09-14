import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Button } from '../components/ui';
import Avatar from '../components/Avatar';
import { alertMessage } from '../utils/confirm';
import { listUnlinkedUsers } from '../services/authService';
import { spacing, radius, font } from '../theme/theme';

// Shown right after a Google sign-in that couldn't be auto-matched to an
// existing users row (new Google identity, no name match) — see
// upsertUserFromGoogle's needsLink case. Picking an existing person links
// this Google account to their row (keeping their order history intact)
// instead of creating a duplicate profile; this only ever happens once per
// Google account, since the link is remembered afterwards.
export default function LinkAccountScreen() {
  const { pendingGoogleProfile, linkPendingTo, createNewFromPending, cancelPendingLink } = useAuth();
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [people, setPeople] = useState(null); // null = loading
  const [busyId, setBusyId] = useState(null); // 'new' | user id | null

  useEffect(() => {
    listUnlinkedUsers()
      .then(setPeople)
      .catch(() => setPeople([]));
  }, []);

  const onPick = async (id) => {
    setBusyId(id);
    try {
      await linkPendingTo(id);
    } catch (e) {
      alertMessage('Грешка', e.message);
    } finally {
      setBusyId(null);
    }
  };

  const onNew = async () => {
    setBusyId('new');
    try {
      await createNewFromPending();
    } catch (e) {
      alertMessage('Грешка', e.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerWrap}>
        {pendingGoogleProfile?.avatarUrl ? (
          <Avatar uri={pendingGoogleProfile.avatarUrl} name={pendingGoogleProfile.name} size={64} />
        ) : (
          <Text style={styles.logoEmoji}>👋</Text>
        )}
        <Text style={styles.title}>Здравей, {pendingGoogleProfile?.name}!</Text>
        <Text style={styles.subtitle}>
          Не намерихме автоматично съвпадение. Ти ли си вече в списъка по-долу?
        </Text>
      </View>

      <View style={[styles.card, shadow.card]}>
        {people === null ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.lg }} />
        ) : people.length === 0 ? (
          <Text style={styles.hint}>Няма съществуващи профили за свързване.</Text>
        ) : (
          people.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={styles.personRow}
              activeOpacity={0.7}
              disabled={busyId !== null}
              onPress={() => onPick(p.id)}
            >
              <Avatar uri={p.avatarUrl} name={p.name} size={36} />
              <Text style={styles.personName}>{p.name}</Text>
              {busyId === p.id ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text style={styles.chevron}>›</Text>
              )}
            </TouchableOpacity>
          ))
        )}
      </View>

      <View style={styles.divider}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>или</Text>
        <View style={styles.dividerLine} />
      </View>

      <Button
        title="Нов съм — добави ме"
        onPress={onNew}
        loading={busyId === 'new'}
        disabled={busyId !== null && busyId !== 'new'}
        style={styles.newBtn}
      />

      <TouchableOpacity onPress={cancelPendingLink} style={{ marginTop: spacing.xl }}>
        <Text style={styles.cancelText}>Откажи</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  headerWrap: { alignItems: 'center', marginBottom: spacing.xl },
  logoEmoji: { fontSize: 52 },
  title: {
    fontSize: font.lg,
    fontWeight: font.bold,
    color: colors.text,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: font.base,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    maxWidth: 340,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceAlt,
  },
  personName: { flex: 1, fontSize: font.md, fontWeight: font.semibold, color: colors.text },
  chevron: { fontSize: font.lg, color: colors.textFaint },
  hint: {
    fontSize: font.base,
    color: colors.textFaint,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: { marginHorizontal: spacing.md, fontSize: font.sm, color: colors.textFaint },
  newBtn: { width: '100%', maxWidth: 420, alignSelf: 'center' },
  cancelText: { fontSize: font.sm, color: colors.textFaint, textAlign: 'center' },
});
