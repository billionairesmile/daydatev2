import React, { useState, forwardRef } from 'react';
import {
  StyleSheet,
  View,
  TextInput,
  Text,
  TextInputProps,
  ViewStyle,
  TextStyle,
  StyleProp,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { COLORS, RADIUS, TYPOGRAPHY, SPACING, IS_TABLET, scale, scaleFont } from '@/constants/design';

interface GlassInputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: StyleProp<TextStyle>;
}

export const GlassInput = forwardRef<TextInput, GlassInputProps>(
  (
    {
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      containerStyle,
      inputStyle,
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);

    return (
      <View style={[styles.container, containerStyle]}>
        {label && <Text style={styles.label}>{label}</Text>}

        <View
          style={[
            styles.inputWrapper,
            isFocused && styles.inputWrapperFocused,
            error && styles.inputWrapperError,
          ]}
        >
          <BlurView experimentalBlurMethod="dimezisBlurView" intensity={40} tint="dark" style={styles.blur}>
            <View style={styles.inputContainer}>
              {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}

              <TextInput
                ref={ref}
                style={[
                  styles.input,
                  leftIcon ? styles.inputWithLeftIcon : undefined,
                  rightIcon ? styles.inputWithRightIcon : undefined,
                  inputStyle,
                ]}
                placeholderTextColor={COLORS.glass.white40}
                selectionColor={COLORS.primary}
                onFocus={(e) => {
                  setIsFocused(true);
                  props.onFocus?.(e);
                }}
                onBlur={(e) => {
                  setIsFocused(false);
                  props.onBlur?.(e);
                }}
                {...props}
              />

              {rightIcon && <View style={styles.rightIcon}>{rightIcon}</View>}
            </View>
          </BlurView>
        </View>

        {(error || helperText) && (
          <Text style={[styles.helperText, error && styles.errorText]}>
            {error || helperText}
          </Text>
        )}
      </View>
    );
  }
);

GlassInput.displayName = 'GlassInput';

const styles = StyleSheet.create({
  container: {
    marginBottom: scale(SPACING.md),
  },
  label: {
    fontSize: scaleFont(TYPOGRAPHY.fontSize.sm),
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.white,
    marginBottom: scale(SPACING.sm),
  },
  inputWrapper: {
    borderRadius: scale(RADIUS.xl),
    borderWidth: scale(1),
    borderColor: COLORS.glass.white20,
    overflow: 'hidden',
  },
  inputWrapperFocused: {
    borderColor: COLORS.primary,
  },
  inputWrapperError: {
    borderColor: COLORS.error,
  },
  blur: {
    borderRadius: scale(RADIUS.xl),
    overflow: 'hidden',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.glass.white10,
    minHeight: scale(52),
    paddingHorizontal: scale(SPACING.lg),
  },
  input: {
    flex: 1,
    fontSize: scaleFont(TYPOGRAPHY.fontSize.md),
    color: COLORS.white,
    paddingVertical: scale(SPACING.md),
  },
  inputWithLeftIcon: {
    paddingLeft: scale(SPACING.sm),
  },
  inputWithRightIcon: {
    paddingRight: scale(SPACING.sm),
  },
  leftIcon: {
    marginRight: scale(SPACING.sm),
  },
  rightIcon: {
    marginLeft: scale(SPACING.sm),
  },
  helperText: {
    fontSize: scaleFont(TYPOGRAPHY.fontSize.xs),
    color: COLORS.glass.white60,
    marginTop: scale(SPACING.xs),
    marginLeft: scale(SPACING.xs),
  },
  errorText: {
    color: COLORS.error,
  },
});
