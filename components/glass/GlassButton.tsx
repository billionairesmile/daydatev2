import React, { ReactNode } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  Text,
  View,
  ViewStyle,
  TextStyle,
  StyleProp,
  ActivityIndicator,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, RADIUS, TYPOGRAPHY, SPACING } from '@/constants/design';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

interface GlassButtonProps {
  children: ReactNode;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

const sizeStyles: Record<ButtonSize, { height: number; paddingHorizontal: number; fontSize: number }> = {
  sm: { height: 40, paddingHorizontal: 16, fontSize: 14 },
  md: { height: 48, paddingHorizontal: 20, fontSize: 15 },
  lg: { height: 56, paddingHorizontal: 24, fontSize: 16 },
};

export function GlassButton({
  children,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = false,
  icon,
  iconPosition = 'left',
  style,
  textStyle,
}: GlassButtonProps) {
  const sizeStyle = sizeStyles[size];
  const isDisabled = disabled || loading;

  const renderContent = () => {
    const textElement = typeof children === 'string' ? (
      <Text
        style={[
          styles.text,
          { fontSize: sizeStyle.fontSize },
          variant === 'primary' ? styles.textPrimary : styles.textSecondary,
          isDisabled && styles.textDisabled,
          textStyle,
        ]}
      >
        {children}
      </Text>
    ) : (
      children
    );

    if (loading) {
      return (
        <ActivityIndicator
          color={variant === 'primary' ? COLORS.black : COLORS.white}
          size="small"
        />
      );
    }

    if (icon) {
      return (
        <View style={styles.iconContainer}>
          {iconPosition === 'left' && <View style={styles.iconLeft}>{icon}</View>}
          {textElement}
          {iconPosition === 'right' && <View style={styles.iconRight}>{icon}</View>}
        </View>
      );
    }

    return textElement;
  };

  if (variant === 'primary') {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={isDisabled}
        activeOpacity={0.8}
        style={[
          styles.button,
          {
            height: sizeStyle.height,
            paddingHorizontal: sizeStyle.paddingHorizontal,
          },
          fullWidth && styles.fullWidth,
          isDisabled && styles.disabled,
          style,
        ]}
      >
        <LinearGradient
          colors={isDisabled
            ? [COLORS.glass.white20, COLORS.glass.white10]
            : [COLORS.white, '#F0F0F0']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.primaryGradient}
        >
          {renderContent()}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      style={[
        styles.button,
        styles.glassButton,
        {
          height: sizeStyle.height,
          paddingHorizontal: sizeStyle.paddingHorizontal,
          borderColor: variant === 'outline' ? COLORS.glass.white40 : COLORS.glass.white20,
        },
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      <BlurView intensity={40} tint="dark" style={styles.blur}>
        <View
          style={[
            styles.glassContent,
            {
              backgroundColor:
                variant === 'ghost'
                  ? 'transparent'
                  : COLORS.glass.white20,
            },
          ]}
        >
          {renderContent()}
        </View>
      </BlurView>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: RADIUS.full,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
  glassButton: {
    borderWidth: 1,
  },
  primaryGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: RADIUS.full,
  },
  blur: {
    flex: 1,
    borderRadius: RADIUS.full,
    overflow: 'hidden',
  },
  glassContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: RADIUS.full,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontFamily: 'System',
    fontWeight: '600',
  },
  textPrimary: {
    color: COLORS.black,
  },
  textSecondary: {
    color: COLORS.white,
  },
  textDisabled: {
    color: COLORS.glass.white60,
  },
  iconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconLeft: {
    marginRight: SPACING.sm,
  },
  iconRight: {
    marginLeft: SPACING.sm,
  },
});
