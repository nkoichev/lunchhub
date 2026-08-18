import React, { useMemo } from 'react';
import {
  Text,
  View,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { spacing, radius, font } from '../theme/theme';

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  small,
}) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const isPrimary = variant === 'primary';
  const isGhost = variant === 'ghost';
  const isDanger = variant === 'danger';

  const bg = disabled
    ? colors.border
    : isPrimary
    ? colors.primary
    : isDanger
    ? colors.danger
    : 'transparent';

  const textColor = isGhost
    ? colors.primary
    : disabled
    ? colors.textFaint
    : colors.onPrimary;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled || loading}
      style={[
        styles.btn,
        small && styles.btnSmall,
        { backgroundColor: bg },
        isGhost && styles.btnGhost,
        !isGhost && !disabled && shadow.card,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isGhost ? colors.primary : colors.onPrimary} />
      ) : (
        <Text
          style={[
            styles.btnText,
            small && { fontSize: font.sm },
            { color: textColor },
          ]}
        >
          {title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export function Card({ children, style }) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return <View style={[styles.card, shadow.card, style]}>{children}</View>;
}

export function SectionHeader({ children, right }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function Badge({ label, tone = 'neutral' }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const map = {
    neutral: { bg: colors.surfaceAlt, fg: colors.textMuted },
    primary: { bg: colors.primaryLight, fg: colors.primaryDark },
    success: { bg: '#E4F4EE', fg: colors.success },
  };
  const c = map[tone] ?? map.neutral;
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.fg }]}>{label}</Text>
    </View>
  );
}

// Star rating — interactive when onRate is provided, otherwise display-only.
export function StarRating({ value = 0, onRate, size = 22, showValue }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const rounded = Math.round(value);
  return (
    <View style={styles.stars}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = onRate ? n <= value : n <= rounded;
        const star = (
          <Text
            style={[
              styles.star,
              { fontSize: size, color: filled ? colors.star : colors.starEmpty },
            ]}
          >
            ★
          </Text>
        );
        return onRate ? (
          <TouchableOpacity key={n} onPress={() => onRate(n)} hitSlop={6}>
            {star}
          </TouchableOpacity>
        ) : (
          <View key={n}>{star}</View>
        );
      })}
      {showValue && value > 0 ? (
        <Text style={styles.starValue}>{Number(value).toFixed(1)}</Text>
      ) : null}
    </View>
  );
}

export function EmptyState({ emoji = '🍽️', title, subtitle }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyEmoji}>{emoji}</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptySubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  btn: {
    borderRadius: radius.md,
    paddingVertical: 15,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSmall: { paddingVertical: 9, paddingHorizontal: spacing.md },
  btnGhost: { borderWidth: 1.5, borderColor: colors.primary },
  btnText: { color: colors.onPrimary, fontSize: font.md, fontWeight: font.semibold },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },
  sectionTitle: {
    fontSize: font.lg,
    fontWeight: font.bold,
    color: colors.text,
  },

  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  badgeText: { fontSize: font.xs, fontWeight: font.semibold },

  stars: { flexDirection: 'row', alignItems: 'center' },
  star: { marginRight: 2 },
  starValue: {
    marginLeft: 6,
    fontSize: font.sm,
    color: colors.textMuted,
    fontWeight: font.semibold,
  },

  empty: { alignItems: 'center', paddingVertical: spacing.xxl * 1.5 },
  emptyEmoji: { fontSize: 52, marginBottom: spacing.md },
  emptyTitle: {
    fontSize: font.md,
    fontWeight: font.bold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: font.base,
    color: colors.textMuted,
    textAlign: 'center',
    paddingHorizontal: spacing.xl,
  },
});
