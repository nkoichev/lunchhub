import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView } from 'react-native';
import { spacing, radius, font } from '../../theme/theme';

const CHART_HEIGHT = 130;
const BAR_WIDTH = 9;
const BAR_GAP = 2;

// Distinct hues pulled from the app's own palettes so a colleague keeps a
// recognisable colour and the set stays readable in every theme.
export const PERSON_COLORS = [
  '#E85D2F', '#1E9E7A', '#2B7FD6', '#9C3D6E',
  '#E0A100', '#6C4FA0', '#17A2B8', '#3C8A52',
];

function shortDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('bg-BG', { day: '2-digit', month: '2-digit' });
}

function fullDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('bg-BG', { day: '2-digit', month: 'long', weekday: 'short' });
}

// Grouped daily bars — one bar per person per day — for head-to-head step
// comparison. Scrolls horizontally (starts at the latest day) and taps a
// day to reveal everyone's exact count that day, ranked.
export default function StepsCompareChart({ series, dates, colors }) {
  const styles = makeStyles(colors);
  const scrollRef = useRef(null);
  const [selected, setSelected] = useState(null);

  let max = 1;
  dates.forEach((date) => {
    series.forEach((s) => {
      max = Math.max(max, s.byDate[date] || 0);
    });
  });

  useEffect(() => {
    // Jump to the most recent day once laid out.
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 60);
    return () => clearTimeout(t);
  }, [dates.length, series.length]);

  if (!series.length || !dates.length) {
    return <Text style={styles.empty}>Няма данни за визуализация</Text>;
  }

  const groupWidth = series.length * (BAR_WIDTH + BAR_GAP) + spacing.md;
  const activeDate = selected && dates.includes(selected) ? selected : dates[dates.length - 1];
  const activeRows = series
    .map((s) => ({ name: s.name, color: s.color, steps: s.byDate[activeDate] || 0 }))
    .sort((a, b) => b.steps - a.steps);

  return (
    <View>
      <View style={styles.legend}>
        {series.map((s) => (
          <View key={s.userId} style={styles.legendItem}>
            <View style={[styles.legendSwatch, { backgroundColor: s.color }]} />
            <Text style={styles.legendText} numberOfLines={1}>{s.name}</Text>
          </View>
        ))}
      </View>

      <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chartRow}>
          {dates.map((date) => (
            <TouchableOpacity
              key={date}
              activeOpacity={0.7}
              onPress={() => setSelected((s) => (s === date ? null : date))}
              style={[
                styles.group,
                { width: groupWidth },
                date === activeDate && styles.groupActive,
              ]}
            >
              <View style={styles.bars}>
                {series.map((s) => (
                  <Bar
                    key={s.userId}
                    value={s.byDate[date] || 0}
                    max={max}
                    color={s.color}
                  />
                ))}
              </View>
              <Text
                style={[styles.groupLabel, date === activeDate && styles.groupLabelActive]}
                numberOfLines={1}
              >
                {shortDate(date)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={styles.readout}>
        <Text style={styles.readoutDate}>{fullDate(activeDate)}</Text>
        {activeRows.map((r) => (
          <View key={r.name} style={styles.readoutRow}>
            <View style={styles.readoutNameWrap}>
              <View style={[styles.legendSwatch, { backgroundColor: r.color }]} />
              <Text style={styles.readoutName} numberOfLines={1}>{r.name}</Text>
            </View>
            <Text style={styles.readoutValue}>
              {r.steps ? r.steps.toLocaleString('bg-BG') : '—'}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Bar({ value, max, color }) {
  const heightAnim = useRef(new Animated.Value(0)).current;
  const pct = max > 0 ? value / max : 0;

  useEffect(() => {
    Animated.timing(heightAnim, {
      toValue: pct,
      duration: 450,
      useNativeDriver: false,
    }).start();
  }, [pct]);

  const height = heightAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={{ width: BAR_WIDTH, marginRight: BAR_GAP, height: '100%', justifyContent: 'flex-end' }}>
      <Animated.View style={{ height, backgroundColor: color, borderTopLeftRadius: 3, borderTopRightRadius: 3, minHeight: value > 0 ? 3 : 0 }} />
    </View>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', maxWidth: 130 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3, marginRight: 5 },
  legendText: { fontSize: font.xs, color: colors.textMuted, fontWeight: font.semibold },

  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: CHART_HEIGHT + 18,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  group: { height: '100%', alignItems: 'center', justifyContent: 'flex-end', borderRadius: radius.sm, paddingTop: spacing.xs },
  groupActive: { backgroundColor: colors.primaryLight },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: CHART_HEIGHT },
  groupLabel: { fontSize: 9, color: colors.textFaint, marginTop: 4 },
  groupLabelActive: { color: colors.primary, fontWeight: font.bold },

  readout: { marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border },
  readoutDate: {
    fontSize: font.sm,
    fontWeight: font.bold,
    color: colors.text,
    marginBottom: spacing.xs,
    textTransform: 'capitalize',
  },
  readoutRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  readoutNameWrap: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: spacing.sm },
  readoutName: { fontSize: font.base, color: colors.textMuted, flex: 1 },
  readoutValue: { fontSize: font.base, fontWeight: font.semibold, color: colors.text },

  empty: { fontSize: font.base, color: colors.textFaint, paddingVertical: spacing.md },
});
