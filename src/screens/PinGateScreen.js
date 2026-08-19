import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { Button } from '../components/ui';
import { spacing, radius, font } from '../theme/theme';
import { ACCESS_PINS } from '../config/supabase';

// One-time gate before the app is usable at all — a shared code so the
// install link alone isn't enough for a stranger to get in. Verified once
// per device; AuthContext-style, the screen that renders this only mounts
// again if the stored "verified" flag is cleared (e.g. app data wiped).
export default function PinGateScreen({ onVerified }) {
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);

  const onSubmit = async () => {
    setChecking(true);
    setError(false);
    // No server round-trip needed — this is a soft "don't let strangers who
    // stumble on the install link in" gate, not a real auth boundary,
    // matching the rest of the app (open anon-key access to Supabase).
    if (ACCESS_PINS.includes(pin)) {
      await onVerified();
    } else {
      setError(true);
    }
    setChecking(false);
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.logoWrap}>
          <Text style={styles.logoEmoji}>🔒</Text>
        </View>
        <Text style={styles.brand}>LunchHub</Text>
        <Text style={styles.tagline}>Достъпно само за екипа</Text>

        <View style={[styles.formCard, shadow.card]}>
          <Text style={styles.label}>Код за достъп</Text>
          <TextInput
            value={pin}
            onChangeText={(v) => {
              setPin(v);
              setError(false);
            }}
            placeholder="••••••"
            placeholderTextColor={colors.textFaint}
            style={[styles.input, error && styles.inputError]}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            returnKeyType="go"
            onSubmitEditing={onSubmit}
          />
          {error && <Text style={styles.errorText}>Грешен код. Опитайте отново.</Text>}
          <Button
            title="Продължи"
            onPress={onSubmit}
            loading={checking}
            disabled={pin.length === 0}
            style={{ marginTop: spacing.lg }}
          />
          <Text style={styles.hint}>Питайте колега за кода, ако не го знаете.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors) => StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  logoEmoji: { fontSize: 44 },
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
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
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
    letterSpacing: 2,
  },
  inputError: { borderColor: colors.danger },
  errorText: { fontSize: font.sm, color: colors.danger, marginTop: spacing.sm },
  hint: {
    fontSize: font.sm,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});
