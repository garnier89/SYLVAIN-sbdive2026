import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';
import { voiceAPI } from '@/api/endpoints';

// MVP placeholder: real speech-to-text on mobile requires expo-speech-recognition or native module.
// For now, this triggers a simulated transcript and shows parsed intent. Replace with real STT later.
export default function VoiceAssistantFAB() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const tryParse = async () => {
    setParsing(true);
    setError(null);
    setResult(null);
    try {
      const fake =
        'Reserve un taxi de Gare de Lyon a Place de la Republique pour demain a 9h';
      const res = await voiceAPI.parseBooking(fake);
      setResult(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || t('common.error'));
    } finally {
      setParsing(false);
    }
  };

  return (
    <>
      <Pressable
        testID="voice-fab"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.fab, { opacity: pressed ? 0.85 : 1 }]}
      >
        <Ionicons name="mic" size={26} color={colors.secondary} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.title}>{t('voice.title')}</Text>
            <Text style={styles.sub}>
              {parsing ? t('voice.listening') : t('voice.say_something')}
            </Text>

            <Pressable
              testID="voice-tap"
              onPress={tryParse}
              style={[styles.micCircle, parsing && { backgroundColor: colors.danger }]}
            >
              <Ionicons name="mic" size={42} color={colors.secondary} />
            </Pressable>

            {result ? (
              <View style={styles.resultCard}>
                <Text style={styles.resultLabel}>Intent</Text>
                <Text style={styles.resultValue}>{result.intent ?? '—'}</Text>
                {result.pickup ? (
                  <Text style={styles.resultMeta}>De : {result.pickup}</Text>
                ) : null}
                {result.dropoff ? (
                  <Text style={styles.resultMeta}>A : {result.dropoff}</Text>
                ) : null}
              </View>
            ) : null}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable style={styles.close} onPress={() => setOpen(false)}>
              <Text style={styles.closeText}>{t('common.close')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 88,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.lg,
    zIndex: 100,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    marginBottom: spacing.sm,
  },
  title: { fontSize: fontSizes.xl, fontWeight: '800', color: colors.textPrimary },
  sub: { color: colors.textSecondary, textAlign: 'center' },
  micCircle: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.md,
    marginVertical: spacing.lg,
  },
  resultCard: {
    width: '100%',
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  resultLabel: { color: colors.textMuted, fontSize: fontSizes.xs, fontWeight: '700' },
  resultValue: { color: colors.textPrimary, fontSize: fontSizes.lg, fontWeight: '800' },
  resultMeta: { color: colors.textSecondary, marginTop: 2 },
  error: { color: colors.danger, textAlign: 'center' },
  close: { paddingVertical: spacing.md },
  closeText: { color: colors.textSecondary, fontWeight: '700' },
});
