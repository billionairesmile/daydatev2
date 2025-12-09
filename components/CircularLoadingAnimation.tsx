import React, { useEffect, useRef } from 'react';
import { View, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface CircularLoadingAnimationProps {
  size?: number;
  strokeWidth?: number;
  color?: string;
  duration?: number;
}

export function CircularLoadingAnimation({
  size = 80,
  strokeWidth = 4,
  color = '#FFFFFF',
  duration = 3500,
}: CircularLoadingAnimationProps) {
  const animatedValue = useRef(new Animated.Value(0)).current;
  const rotateValue = useRef(new Animated.Value(0)).current;

  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;

  useEffect(() => {
    // Stroke animation (원을 그리는 애니메이션) - 더 부드럽고 고급스러운 easing
    const strokeAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: duration * 0.65,
          easing: Easing.bezier(0.4, 0.0, 0.2, 1), // Material Design standard easing
          useNativeDriver: true,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: duration * 0.35,
          easing: Easing.bezier(0.4, 0.0, 0.6, 1), // Smoother ease-out
          useNativeDriver: true,
        }),
      ])
    );

    // Rotation animation (회전 애니메이션) - 약간 더 부드러운 회전
    const rotateAnimation = Animated.loop(
      Animated.timing(rotateValue, {
        toValue: 1,
        duration: duration * 1.2,
        easing: Easing.bezier(0.4, 0.0, 0.6, 1),
        useNativeDriver: true,
      })
    );

    strokeAnimation.start();
    rotateAnimation.start();

    return () => {
      strokeAnimation.stop();
      rotateAnimation.stop();
    };
  }, [animatedValue, rotateValue, duration]);

  const strokeDashoffset = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  const rotate = rotateValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          transform: [{ rotate }],
        },
      ]}
    >
      <Svg width={size} height={size}>
        {/* Background circle (optional) */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(255, 255, 255, 0.2)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* Animated circle */}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
