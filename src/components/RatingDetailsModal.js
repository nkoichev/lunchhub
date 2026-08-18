import React, { useCallback, useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { fetchRatersForDish, rateDish } from '../services/ratingService';
import { alertMessage } from '../utils/confirm';
import { StarRating, Badge } from './ui';
import { colors, spacing, radius, font, shadow } from '../theme/theme';

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('bg-BG', { day: '2-digit', month: 'long', year: 'numeric' });
}

// Shows everyone who rated a dish (name, stars, date). If the current user
// is among them, lets them edit their own rating right here.
export default function RatingDetailsModal({ visible, itemName, user, onClose, onChanged }) {
  const [raters, setRaters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!itemName) return;
    setLoading(true);
    try {
      const data = await fetchRatersForDish(itemName);
      setRaters(data);
    } catch (e) {
      alertMessage('Грешка', e.message);
    } finally {
      setLoading(false);
    }
  }, [itemName]);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);

  const onEditMine = async (stars) => {
    setSaving(true);
    try {
      await rateDish(user, itemName, stars);
      await load();
      onChanged?.();
    } catch (e) {
      alertMessage('Грешка', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, shadow.floating]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{itemName}</Text>
          <Text style={styles.subtitle}>Кой е гласувал за това ястие</Text>

          <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
            {loading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
            ) : raters.length === 0 ? (
              <Text style={styles.empty}>Все още няма оценки.</Text>
            ) : (
              raters.map((r) => {
                const isMine = r.userId === user?.id;
                return (
                  <View key={r.userId} style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.name}>{r.name}</Text>
                        {isMine && (
                          <View style={{ marginLeft: spacing.sm }}>
                            <Badge label="Вие" tone="primary" />
                          </View>
                        )}
                      </View>
                      <Text style={styles.date}>{formatDate(r.createdAt)}</Text>
                    </View>
                    {isMine ? (
                      <StarRating value={r.stars} size={22} onRate={onEditMine} />
                    ) : (
                      <StarRating value={r.stars} size={18} showValue />
                    )}
                  </View>
                );
              })
            )}
          </ScrollView>
          {saving && <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.sm }} />}

          <TouchableOpacity onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelText}>Затвори</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    maxHeight: '80%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: 'center',
    marginBottom: spacing.md,
  },
  title: { fontSize: font.lg, fontWeight: font.bold, color: colors.text },
  subtitle: { fontSize: font.sm, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  name: { fontSize: font.base, fontWeight: font.semibold, color: colors.text },
  date: { fontSize: font.xs, color: colors.textFaint, marginTop: 2 },
  empty: { fontSize: font.base, color: colors.textFaint, textAlign: 'center', paddingVertical: spacing.xl },
  cancel: { alignSelf: 'center', padding: spacing.md, marginTop: spacing.sm },
  cancelText: { color: colors.textMuted, fontSize: font.base, fontWeight: font.semibold },
});
