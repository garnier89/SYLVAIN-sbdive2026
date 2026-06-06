import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fontSizes, radius, shadow, spacing } from '@/theme';

type Props = {
  label: string;
  iconName: keyof typeof Ionicons.glyphMap;
  color?: string;
  imageUrl?: string | null;
  onPress?: () => void;
  badge?: string;
  testID?: string;
};

export default function ServiceTile({
  label,
  iconName,
  color = colors.primary,
  imageUrl,
  onPress,
  badge,
  testID,
}: Props) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [styles.wrap, { opacity: pressed ? 0.85 : 1 }]}
    >
      <View style={[styles.iconCircle, { backgroundColor: color + '22' }]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="contain" />
        ) : (
          <Ionicons name={iconName} size={24} color={color} />
        )}
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    width: '25%',
    paddingVertical: spacing.sm,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...shadow.sm,
  },
  image: { width: 40, height: 40 },
  label: {
    marginTop: 8,
    fontSize: fontSizes.xs,
    color: colors.textPrimary,
    fontWeight: '600',
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: colors.danger,
    borderRadius: 10,
    paddingHorizontal: 5,
    paddingVertical: 2,
    minWidth: 18,
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
});
