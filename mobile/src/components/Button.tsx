import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { colors, radius, spacing, fontSizes } from '@/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type Size = 'sm' | 'md' | 'lg';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  testID?: string;
};

export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading,
  disabled,
  fullWidth,
  style,
  textStyle,
  leftIcon,
  rightIcon,
  testID,
}: Props) {
  const stylesByVariant: Record<Variant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.primary, fg: colors.secondary },
    secondary: { bg: colors.secondary, fg: colors.textInverse },
    ghost: { bg: 'transparent', fg: colors.primary },
    danger: { bg: colors.danger, fg: colors.textInverse },
    outline: { bg: 'transparent', fg: colors.textPrimary, border: colors.border },
  };
  const v = stylesByVariant[variant];
  const sizeMap: Record<Size, { py: number; px: number; fs: number }> = {
    sm: { py: 8, px: 12, fs: fontSizes.sm },
    md: { py: 12, px: 18, fs: fontSizes.md },
    lg: { py: 16, px: 22, fs: fontSizes.lg },
  };
  const sz = sizeMap[size];

  return (
    <Pressable
      testID={testID}
      onPress={!loading && !disabled ? onPress : undefined}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: v.bg,
          borderColor: v.border ?? 'transparent',
          borderWidth: v.border ? 1 : 0,
          paddingVertical: sz.py,
          paddingHorizontal: sz.px,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? 'stretch' : 'auto',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <>
          {leftIcon}
          <Text
            style={[
              styles.label,
              { color: v.fg, fontSize: sz.fs, marginLeft: leftIcon ? 8 : 0, marginRight: rightIcon ? 8 : 0 },
              textStyle,
            ]}
          >
            {label}
          </Text>
          {rightIcon}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    gap: spacing.xs,
  },
  label: { fontWeight: '700' },
});
