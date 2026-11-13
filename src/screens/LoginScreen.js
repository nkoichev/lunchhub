import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Button } from '../components/ui';
import { spacing, radius, font } from '../theme/theme';
import { isSupabaseConfigured } from '../config/supabase';

// Hidden until the Meta app can go Live: Meta only publishes it after a
// company-backed Business Verification, and while unpublished only people
// added as app Testers can sign in. Everything behind it (SDK, Edge Function,
// Supabase provider) stays set up — flip this to true to bring it back.
const FACEBOOK_LOGIN_ENABLED = false;

export default function LoginScreen() {
  const { sendEmailCode, verifyEmailCode, loginWithGoogle, loginWithFacebook, authError } = useAuth();
  const { colors, shadow } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState(null); // email the code went to → step 2
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [facebookLoading, setFacebookLoading] = useState(false);
  const [error, setError] = useState(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const run = async (setBusy, fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const onSendCode = () =>
    run(setLoading, async () => {
      const to = await sendEmailCode(email);
      setSentTo(to);
      setCode('');
      setResendIn(60);
    });

  const onVerify = () => run(setLoading, () => verifyEmailCode(sentTo, code));
  const onGoogleSubmit = () => run(setGoogleLoading, loginWithGoogle);
  const onFacebookSubmit = () => run(setFacebookLoading, loginWithFacebook);
  const digits = code.replace(/\D/g, '');
  const shownError = error || authError;

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
          {!sentTo ? (
            <>
              <Text style={styles.label}>Служебен имейл</Text>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="ime@firma.bg"
                placeholderTextColor={colors.textFaint}
                style={styles.input}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                returnKeyType="send"
                onSubmitEditing={onSendCode}
                maxLength={120}
              />
              <Button
                title="Изпрати код"
                onPress={onSendCode}
                loading={loading}
                disabled={!email.includes('@')}
                style={{ marginTop: spacing.lg }}
              />
              <Text style={styles.hint}>Ще получите код по имейл. Без пароли.</Text>
            </>
          ) : (
            <>
              <Text style={styles.label}>Код от имейла</Text>
              <Text style={styles.sentTo}>Изпратихме код на {sentTo}</Text>
              <TextInput
                value={code}
                onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 8))}
                placeholder="123456"
                placeholderTextColor={colors.textFaint}
                style={[styles.input, styles.codeInput]}
                autoFocus
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                returnKeyType="go"
                onSubmitEditing={onVerify}
                maxLength={8}
              />
              <Button
                title="Влизане"
                onPress={onVerify}
                loading={loading}
                disabled={digits.length < 6}
                style={{ marginTop: spacing.lg }}
              />
              <View style={styles.row}>
                <Pressable onPress={() => { setSentTo(null); setError(null); }}>
                  <Text style={styles.link}>← Друг имейл</Text>
                </Pressable>
                <Pressable onPress={onSendCode} disabled={resendIn > 0 || loading}>
                  <Text style={[styles.link, resendIn > 0 && styles.linkDisabled]}>
                    {resendIn > 0 ? `Нов код след ${resendIn} с` : 'Изпрати нов код'}
                  </Text>
                </Pressable>
              </View>
              <Text style={styles.hint}>Не го виждате? Проверете и папка „Спам“.</Text>
            </>
          )}

          {shownError ? <Text style={styles.error}>{shownError}</Text> : null}

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>или</Text>
            <View style={styles.dividerLine} />
          </View>

          <Button
            title="Продължи с Google"
            variant="ghost"
            onPress={onGoogleSubmit}
            loading={googleLoading}
          />
          {FACEBOOK_LOGIN_ENABLED && (
            <Button
              title="Продължи с Facebook"
              variant="ghost"
              onPress={onFacebookSubmit}
              loading={facebookLoading}
              style={{ marginTop: spacing.sm }}
            />
          )}
        </View>

        {!isSupabaseConfigured && (
          <View style={styles.warn}>
            <Text style={styles.warnText}>
              ⚠️ Базата данни не е настроена (вижте README).
            </Text>
          </View>
        )}
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
  },
  hint: {
    fontSize: font.sm,
    color: colors.textFaint,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  sentTo: { fontSize: font.sm, color: colors.textMuted, marginBottom: spacing.md },
  codeInput: { fontSize: 24, letterSpacing: 6, textAlign: 'center', fontWeight: font.bold },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.md },
  link: { fontSize: font.sm, color: colors.primary, fontWeight: font.semibold },
  linkDisabled: { color: colors.textFaint },
  error: { fontSize: font.sm, color: colors.danger, textAlign: 'center', marginTop: spacing.md },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: {
    marginHorizontal: spacing.md,
    fontSize: font.sm,
    color: colors.textFaint,
  },
  warn: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    marginTop: spacing.xl,
    backgroundColor: '#FDF3E0',
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#F0D9A8',
  },
  warnText: { fontSize: font.sm, color: '#8A6A1E', lineHeight: 20 },
});
