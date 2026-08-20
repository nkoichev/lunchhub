import React, { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { supabase } from '../config/supabase';
import { updateRevolutTag, updateBlinkPhone } from '../services/paymentService';
import { alertMessage } from '../utils/confirm';
import { Button } from './ui';
import { spacing, radius, font } from '../theme/theme';

export default function ProfileModal({ visible, user, onClose }) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [tag, setTag] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !user) return;
    setLoading(true);
    supabase
      .from('users')
      .select('revolut_tag, blink_phone')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        setTag(data?.revolut_tag ?? '');
        setPhone(data?.blink_phone ?? '');
      })
      .finally(() => setLoading(false));
  }, [visible, user]);

  const onSave = async () => {
    setSaving(true);
    try {
      const [cleanTag, cleanPhone] = await Promise.all([
        updateRevolutTag(user.id, tag),
        updateBlinkPhone(user.id, phone),
      ]);
      setTag(cleanTag);
      setPhone(cleanPhone);
      onClose();
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
          <Text style={styles.title}>Данни за плащане</Text>
          <Text style={styles.subtitle}>
            Използват се, за да могат колегите да ви плащат при разделяне на сметката.
          </Text>

          <Text style={styles.label}>Revolut таг</Text>
          <View style={styles.inputRow}>
            <Text style={styles.prefix}>@</Text>
            <TextInput
              value={tag}
              onChangeText={setTag}
              placeholder="напр. ivan95"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
          </View>

          <Text style={[styles.label, { marginTop: spacing.lg }]}>Телефон за Blink</Text>
          <View style={styles.inputRow}>
            <Text style={styles.prefix}>📱</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="напр. 0888123456"
              placeholderTextColor={colors.textFaint}
              style={styles.input}
              keyboardType="phone-pad"
              editable={!loading}
            />
          </View>

          <Button
            title="Запази"
            onPress={onSave}
            loading={saving}
            disabled={loading}
            style={{ marginTop: spacing.lg }}
          />
          <TouchableOpacity onPress={onClose} style={styles.cancel}>
            <Text style={styles.cancelText}>Затвори</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (colors) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.xl,
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
    subtitle: { fontSize: font.sm, color: colors.textMuted, marginTop: 2, marginBottom: spacing.lg, lineHeight: 19 },
    label: {
      fontSize: font.sm,
      fontWeight: font.semibold,
      color: colors.textMuted,
      marginBottom: spacing.sm,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: radius.md,
      backgroundColor: colors.surfaceAlt,
      paddingLeft: spacing.lg,
    },
    prefix: { fontSize: font.md, color: colors.textFaint, marginRight: 2 },
    input: {
      flex: 1,
      paddingHorizontal: spacing.sm,
      paddingVertical: 13,
      fontSize: font.md,
      color: colors.text,
    },
    cancel: { alignSelf: 'center', padding: spacing.md, marginTop: spacing.xs },
    cancelText: { color: colors.textMuted, fontSize: font.base, fontWeight: font.semibold },
  });
