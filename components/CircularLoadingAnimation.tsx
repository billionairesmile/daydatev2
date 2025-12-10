import { useEffect, useMemo } from 'react';
import {
  BlurMask,
  Canvas,
  Path,
  Skia,
  Color,
} from '@shopify/react-native-skia';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

interface CircularLoadingAnimationProps {
  size?: number;
  strokeWidth?: number;
  color?: string;
  duration?: number;
}

export function CircularLoadingAnimation({
  size = 80,
  strokeWidth = 10,
  color = '#FFFFFF',
  duration = 1000,
}: CircularLoadingAnimationProps) {
  const radius = (size - strokeWidth) / 2;
  const canvasSize = size + 30; // Space for blur

  // Create circular path
  const circle = useMemo(() => {
    const skPath = Skia.Path.Make();
    skPath.addCircle(canvasSize / 2, canvasSize / 2, radius);
    return skPath;
  }, [canvasSize, radius]);

  const progress = useSharedValue(0);

  useEffect(() => {
    // Continuous clockwise rotation
    progress.value = withRepeat(
      withTiming(1, { duration, easing: Easing.linear }),
      -1, // Infinite repeat
      false, // No reverse - always clockwise
    );
  }, [progress, duration]);

  // Rotation animation style
  const rContainerStyle = useAnimatedStyle(() => {
    return {
      transform: [{ rotate: `${2 * Math.PI * progress.value}rad` }],
    };
  });

  // Dynamic stroke start point for flowing effect
  const startPath = useDerivedValue(() => {
    return interpolate(progress.value, [0, 0.5, 1], [0.6, 0.3, 0.6]);
  }, []);

  return (
    <Animated.View
      entering={FadeIn.duration(500)}
      exiting={FadeOut.duration(300)}
      style={[
        rContainerStyle,
        {
          width: canvasSize,
          height: canvasSize,
          justifyContent: 'center',
          alignItems: 'center',
        },
      ]}>
      <Canvas
        style={{
          width: canvasSize,
          height: canvasSize,
        }}>
        <Path
          path={circle}
          color={color as Color}
          style="stroke"
          strokeWidth={strokeWidth}
          start={startPath}
          end={1}
          strokeCap="round">
          <BlurMask blur={5} style="solid" />
        </Path>
      </Canvas>
    </Animated.View>
  );
}
