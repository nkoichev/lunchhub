import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import Avatar from './Avatar';
import { Button } from './ui';
import { selectionHaptic, successHaptic } from '../utils/haptics';
import { spacing, radius, font } from '../theme/theme';

const ROW = 58;
const VISIBLE_ROWS = 3;

// Fair-ish odds: the more times you've already paid, the smaller your
// chance — weight 1 / (1 + times paid). Nobody ever drops to zero.
function weightsFor(candidates, payerCounts) {
  const raw = candidates.map((c) => 1 / (1 + (payerCounts[c.userId] ?? 0)));
  const sum = raw.reduce((s, w) => s + w, 0) || 1;
  return raw.map((w) => w / sum);
}

function pickWeighted(weights) {
  let r = Math.random();
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

// "Кой плаща днес?" slot machine: a reel of names spins, slows down with a
// tick on every name, and stops on the (weighted-random) winner.
export default function PayerRouletteModal({ visible, candidates, payerCounts, onClose, onWinner }) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const weights = useMemo(() => weightsFor(candidates, payerCounts || {}), [candidates, payerCounts]);
  const [reel, setReel] = useState([]);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState(null);
  const y = useRef(new Animated.Value(0)).current;
  const lastTick = useRef(-1);

  useEffect(() => {
    if (!visible) return;
    setWinner(null);
    setSpinning(false);
    y.setValue(0);
    setReel(candidates.length ? [...candidates, ...candidates, ...candidates].slice(0, Math.max(3, candidates.length)) : []);
  }, [visible, candidates]);

  useEffect(() => {
    const id = y.addListener(({ value }) => {
      const idx = Math.floor(-value / ROW);
      if (idx !== lastTick.current) {
        lastTick.current = idx;
        selectionHaptic();
      }
    });
    return () => y.removeListener(id);
  }, [y]);

  const spin = () => {
    if (spinning || candidates.length < 2) return;
    const winIdx = pickWeighted(weights);
    // ~8 full laps of shuffled names, then the winner — it lands in the
    // middle row, so one extra name is appended after it.
    const laps = [];
    for (let i = 0; i < 8; i++) laps.push(...[...candidates].sort(() => Math.random() - 0.5));
    const list = [candidates[(winIdx + 1) % candidates.length], ...laps, candidates[winIdx], candidates[(winIdx + 1) % candidates.length]];
    const stopIndex = list.length - 2; // the winner
    setReel(list);
    setWinner(null);
    setSpinning(true);
    y.setValue(0);
    lastTick.current = -1;
    Animated.timing(y, {
      toValue: -(stopIndex - 1) * ROW,
      duration: 4200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // the listener above needs JS-side values for the ticks
    }).start(() => {
      setSpinning(false);
      setWinner(candidates[winIdx]);
      successHaptic();
    });
  };

  const confirm = async () => {
    if (!winner) return;
    await onWinner(winner);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, shadow.floating]}>
          <Text style={styles.title}>🎰 Рулетка: кой черпи?</Text>
          <Text style={styles.subtitle}>
            Който е плащал по-често, има по-малък шанс — честно е.
          </Text>

          <View style={styles.window}>
            <Animated.View style={{ transform: [{ translateY: y }] }}>
              {reel.map((c, i) => (
                <View key={`${c.userId}-${i}`} style={styles.row}>
                  <Avatar uri={c.avatarUrl} name={c.name} size={34} />
                  <Text style={styles.rowName} numberOfLines={1}>
                    {c.name}
                  </Text>
                </View>
              ))}
            </Animated.View>
            <View pointerEvents="none" style={styles.highlight} />
          </View>

          {winner ? (
            <View style={styles.winnerBox}>
              <Text style={styles.winnerEmoji}>🎉</Text>
              <Text style={styles.winnerText}>Днес черпи {winner.name}!</Text>
            </View>
          ) : (
            <View style={styles.odds}>
              {candidates.map((c, i) => (
                <Text key={c.userId} style={styles.oddsText}>
                  {c.name.split(' ')[0]} {Math.round(weights[i] * 100)}%
                  {payerCounts?.[c.userId] ? ` · платил ${payerCounts[c.userId]}×` : ''}
                </Text>
              ))}
            </View>
          )}

          {winner ? (
            <Button title={`💰 Потвърди ${winner.name.split(' ')[0]}`} onPress={confirm} />
          ) : (
            <Button
              title={spinning ? 'Върти се…' : candidates.length < 2 ? 'Трябват поне двама с Revolut таг' : 'Завърти!'}
              onPress={spin}
              disabled={spinning || candidates.length < 2}
            />
          )}
          {winner && (
            <TouchableOpacity onPress={spin} style={styles.secondary}>
              <Text style={styles.secondaryText}>🔁 Завърти пак</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onClose} style={styles.secondary} disabled={spinning}>
            <Text style={styles.secondaryText}>Затвори</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: spacing.xl },
    sheet: {
      backgroundColor: colors.surface,
      borderRadius: radius.xl,
      padding: spacing.xl,
      width: '100%',
      maxWidth: 420,
      alignSelf: 'center',
    },
    title: { fontSize: font.lg, fontWeight: font.bold, color: colors.text, textAlign: 'center' },
    subtitle: { fontSize: font.sm, color: colors.textMuted, textAlign: 'center', marginTop: 4, marginBottom: spacing.lg },
    window: {
      height: ROW * VISIBLE_ROWS,
      overflow: 'hidden',
      borderRadius: radius.lg,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: spacing.lg,
    },
    row: { height: ROW, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, gap: spacing.md },
    rowName: { flex: 1, fontSize: font.md, fontWeight: font.semibold, color: colors.text },
    highlight: {
      position: 'absolute',
      left: 6,
      right: 6,
      top: ROW,
      height: ROW,
      borderRadius: radius.md,
      borderWidth: 2,
      borderColor: colors.primary,
      backgroundColor: 'transparent',
    },
    odds: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.lg },
    oddsText: {
      fontSize: font.xs,
      color: colors.textMuted,
      backgroundColor: colors.surfaceAlt,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radius.pill,
      overflow: 'hidden',
    },
    winnerBox: { alignItems: 'center', marginBottom: spacing.lg },
    winnerEmoji: { fontSize: 40 },
    winnerText: { fontSize: font.lg, fontWeight: font.bold, color: colors.primary, marginTop: 4 },
    secondary: { alignSelf: 'center', padding: spacing.md, marginTop: spacing.xs },
    secondaryText: { color: colors.textMuted, fontSize: font.base, fontWeight: font.semibold },
  });
