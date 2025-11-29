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
import { COLORS, RADIUS, TYPOGRAPHY, SPACING } from '@/constants/design';

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
          <BlurView intensity={40} tint="dark" style={styles.blur}>
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
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
    color: COLORS.white,
    marginBottom: SPACING.sm,
  },
  inputWrapper: {
    borderRadius: RADIUS.xl,
    borderWidth: 1,
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
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.glass.white10,
    minHeight: 52,
    paddingHorizontal: SPACING.lg,
  },
  input: {
    flex: 1,
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.white,
    paddingVertical: SPACING.md,
  },
  inputWithLeftIcon: {
    paddingLeft: SPACING.sm,
  },
  inputWithRightIcon: {
    paddingRight: SPACING.sm,
  },
  leftIcon: {
    marginRight: SPACING.sm,
  },
  rightIcon: {
    marginLeft: SPACING.sm,
  },
  helperText: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.glass.white60,
    marginTop: SPACING.xs,
    marginLeft: SPACING.xs,
  },
  errorText: {
    color: COLORS.error,
  },
});
