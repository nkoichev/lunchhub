import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import PopPressable from './PopPressable';
import { REACTION_EMOJIS } from '../services/reactionService';
import { spacing, radius, font } from '../theme/theme';

// Row of emoji reactions under an order card. `reactions` is
// { [emoji]: [{ userId, name }] }; whoever reacted is listed below.
export default function ReactionBar({ reactions = {}, myUserId, onToggle, disabled }) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const who = REACTION_EMOJIS.flatMap((e) => (reactions[e] || []).map((r) => ({ e, name: r.name })));

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {REACTION_EMOJIS.map((emoji) => {
          const list = reactions[emoji] || [];
          const mine = list.some((r) => r.userId === myUserId);
          return (
            <PopPressable
              key={emoji}
              disabled={disabled}
              onPress={() => onToggle(emoji, mine)}
              scaleTo={0.75}
              hitSlop={4}
              style={[styles.chip, mine && styles.chipMine, list.length === 0 && styles.chipEmpty]}
            >
              <Text style={styles.emoji}>{emoji}</Text>
              {list.length > 0 && <Text style={[styles.count, mine && styles.countMine]}>{list.length}</Text>}
            </PopPressable>
          );
        })}
      </View>
      {who.length > 0 && (
        <Text style={styles.who} numberOfLines={2}>
          {who.map((w) => `${w.e} ${w.name.split(' ')[0]}`).join('  ')}
        </Text>
      )}
    </View>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    wrap: { marginTop: spacing.sm },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: radius.pill,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    chipEmpty: { opacity: 0.6 },
    chipMine: { backgroundColor: colors.primaryLight, borderColor: colors.primary, opacity: 1 },
    emoji: { fontSize: 15 },
    count: { fontSize: font.xs, fontWeight: font.bold, color: colors.textMuted, marginLeft: 4 },
    countMine: { color: colors.primaryDark },
    who: { fontSize: font.xs, color: colors.textFaint, marginTop: 4 },
  });
