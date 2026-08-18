import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui';
import { alertMessage } from '../utils/confirm';
import { colors, spacing, radius, font, shadow } from '../theme/theme';
import { isSupabaseConfigured } from '../config/supabase';

export default function LoginScreen() {
  const { login } = useAuth();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async () => {
    setLoading(true);
    try {
      await login(name);
    } catch (e) {
      alertMessage('Грешка', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <Text style={styles.logoEmoji}>🍲</Text>
        </View>
        <Text style={styles.brand}>LunchHub</Text>
        <Text style={styles.tagline}>Обедни поръчки за екипа</Text>

        <View style={[styles.formCard, shadow.card]}>
          <Text style={styles.label}>Вашето име</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="напр. Иван"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            autoFocus
            returnKeyType="go"
            onSubmitEditing={onSubmit}
            maxLength={40}
          />
          <Button
            title="Влизане"
            onPress={onSubmit}
            loading={loading}
            disabled={name.trim().length < 2}
            style={{ marginTop: spacing.lg }}
          />
          <Text style={styles.hint}>
            Няма пароли — просто въведете името си, за да продължите.
          </Text>
        </View>

        {!isSupabaseConfigured && (
          <View style={styles.warn}>
            <Text style={styles.warnText}>
              ⚠️ Демо режим: базата данни не е настроена. Поръчките няма да се
              запазват, докато не добавите Supabase ключове (вижте README).
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  logoWrap: {
    alignSelf: 'center',
    width: 96,
    height: 96,
    borderRadius: radius.xl,
    backgroundColor: colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  logoEmoji: { fontSize: 52 },
  brand: {
    fontSize: font.xxl,
    fontWeight: font.bold,
    color: colors.text,
    textAlign: 'center',
  },
  tagline: {
    fontSize: font.md,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.xxl,
  },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    fontSize: font.sm,
    fontWeight: font.semibold,
    color: colors.textMuted,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: font.md,
    color: colors.text,
    backgroundColor: colors.surfaceAlt,
  },
  hint: {
    fontSize: font.sm,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  warn: {
    marginTop: spacing.xl,
    backgroundColor: '#FDF3E0',
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#F0D9A8',
  },
  warnText: { fontSize: font.sm, color: '#8A6A1E', lineHeight: 20 },
});
