import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Dimensions,
  Pressable,
  Animated,
  PanResponder,
  Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MapPin, History } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '@/constants/design';
import { SAMPLE_MISSIONS } from '@/stores/missionStore';
import { useBackground } from '@/contexts';

const { width, height } = Dimensions.get('window');

const SWIPE_THRESHOLD = 100;

export default function MissionScreen() {
  const router = useRouter();
  const { backgroundImage } = useBackground();
  const [currentIndex, setCurrentIndex] = useState(0);
  const position = useRef(new Animated.ValueXY()).current;
  const rotate = position.x.interpolate({
    inputRange: [-200, 0, 200],
    outputRange: ['-15deg', '0deg', '15deg'],
  });

  const currentMission = SAMPLE_MISSIONS[currentIndex];

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gesture) => {
        position.setValue({ x: gesture.dx, y: 0 });
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx > SWIPE_THRESHOLD) {
          // Swipe right - previous
          swipeCard('right');
        } else if (gesture.dx < -SWIPE_THRESHOLD) {
          // Swipe left - next
          swipeCard('left');
        } else {
          // Reset position
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const swipeCard = (direction: 'left' | 'right') => {
    const toValue = direction === 'right' ? width + 100 : -width - 100;
    Animated.timing(position, {
      toValue: { x: toValue, y: 0 },
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      position.setValue({ x: 0, y: 0 });
      if (direction === 'left') {
        setCurrentIndex((currentIndex + 1) % SAMPLE_MISSIONS.length);
      } else {
        setCurrentIndex(
          (currentIndex - 1 + SAMPLE_MISSIONS.length) % SAMPLE_MISSIONS.length
        );
      }
    });
  };

  const handleMissionPress = () => {
    router.push(`/mission/${currentMission.id}`);
  };

  const handleDotPress = (index: number) => {
    if (index !== currentIndex) {
      const direction = index > currentIndex ? 'left' : 'right';
      const toValue = direction === 'right' ? width + 100 : -width - 100;
      Animated.timing(position, {
        toValue: { x: toValue, y: 0 },
        duration: 250,
        useNativeDriver: true,
      }).start(() => {
        position.setValue({ x: 0, y: 0 });
        setCurrentIndex(index);
      });
    }
  };

  const getCardStyle = (index: number) => {
    const offset = index - currentIndex;

    if (offset === 0) {
      return {
        transform: [
          { translateX: position.x },
          { rotate: rotate },
        ],
        zIndex: 10,
        opacity: 1,
      };
    } else if (offset === 1 || (offset === -(SAMPLE_MISSIONS.length - 1))) {
      return {
        transform: [
          { scale: 0.94 },
          { translateY: -12 },
          { translateX: 6 },
          { rotate: '5deg' },
        ],
        zIndex: 2,
        opacity: 0.8,
      };
    } else if (offset === 2 || (offset === -(SAMPLE_MISSIONS.length - 2))) {
      return {
        transform: [
          { scale: 0.88 },
          { translateY: -24 },
          { translateX: -8 },
          { rotate: '-8deg' },
        ],
        zIndex: 1,
        opacity: 0.6,
      };
    }
    return {
      transform: [{ scale: 0.85 }],
      zIndex: 0,
      opacity: 0,
    };
  };

  return (
    <View style={styles.container}>
      {/* Background Image */}
      <ImageBackground
        source={backgroundImage}
        style={styles.backgroundImage}
        blurRadius={40}
      >
        <View style={styles.backgroundScale} />
      </ImageBackground>
      <View style={styles.overlay} />


      {/* Decorative blurs */}
      <View style={styles.decorativeBlur1} />
      <View style={styles.decorativeBlur2} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>오늘의 미션</Text>
          <Text style={styles.headerSubtitle}>
            오늘은 어떤 순간을 함께할까요?
          </Text>
        </View>
        <Pressable style={styles.historyButton}>
          <History color={COLORS.white} size={24} strokeWidth={2} />
        </Pressable>
      </View>

      {/* Card Stack */}
      <View style={styles.cardContainer}>
        <View style={styles.cardStack}>
          {/* Background cards (static) */}
          {SAMPLE_MISSIONS.map((mission, index) => {
            const offset = index - currentIndex;
            // Only render cards close to current
            if (
              Math.abs(offset) > 2 &&
              Math.abs(offset) < SAMPLE_MISSIONS.length - 2
            ) {
              return null;
            }

            if (index === currentIndex) return null;

            const cardStyle = getCardStyle(index);
            return (
              <View
                key={mission.id}
                style={[styles.card, styles.staticCard, cardStyle]}
                pointerEvents="none"
              >
                <MissionCardContent mission={mission} />
              </View>
            );
          })}

          {/* Active card (draggable) */}
          <Animated.View
            {...panResponder.panHandlers}
            style={[
              styles.card,
              {
                transform: [
                  { translateX: position.x },
                  { rotate: rotate },
                ],
                zIndex: 10,
              },
            ]}
          >
            <Pressable onPress={handleMissionPress} style={styles.cardPressable}>
              <MissionCardContent
                mission={currentMission}
                onStartPress={handleMissionPress}
              />
            </Pressable>
          </Animated.View>
        </View>
      </View>

      {/* Dots Indicator */}
      <View style={styles.dotsContainer}>
        {SAMPLE_MISSIONS.map((_, index) => (
          <Pressable
            key={index}
            onPress={() => handleDotPress(index)}
            style={[
              styles.dot,
              index === currentIndex && styles.dotActive,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

interface MissionCardContentProps {
  mission: typeof SAMPLE_MISSIONS[0];
  onStartPress?: () => void;
}

function MissionCardContent({ mission, onStartPress }: MissionCardContentProps) {
  const locationText =
    mission.locationType === 'indoor'
      ? '실내'
      : mission.locationType === 'outdoor'
      ? '야외'
      : '무관';

  return (
    <>
      {/* Background Image */}
      <Image
        source={{ uri: `${mission.imageUrl}?w=800&h=1000&fit=crop` }}
        style={styles.cardImage}
        resizeMode="cover"
      />

      {/* Gradient Overlay */}
      <LinearGradient
        colors={['rgba(0,0,0,0.1)', 'transparent', 'rgba(0,0,0,0.7)']}
        locations={[0, 0.3, 1]}
        style={styles.cardGradient}
      />

      {/* Bottom blur effect */}
      <View style={styles.cardBottomBlur} />

      {/* Side glow effects */}
      <View style={styles.leftGlow} />
      <View style={styles.rightGlow} />

      {/* Content */}
      <View style={styles.cardContent}>
        {/* Location Badge */}
        <View style={styles.locationBadge}>
          <View style={styles.locationIcon}>
            <MapPin color={COLORS.white} size={16} />
          </View>
          <Text style={styles.locationText}>{locationText}</Text>
        </View>

        {/* Title */}
        <Text style={styles.missionTitle}>{mission.title}</Text>

        {/* Description */}
        <Text style={styles.missionDescription}>{mission.description}</Text>

        {/* Tags */}
        <View style={styles.tagsContainer}>
          {mission.tags.map((tag, index) => (
            <Text key={index} style={styles.tagText}>
              #{tag}
            </Text>
          ))}
        </View>

        {/* Action Button */}
        {onStartPress && (
          <Pressable style={styles.actionButton} onPress={onStartPress}>
            <Text style={styles.actionButtonText}>미션 확인하기</Text>
          </Pressable>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  backgroundImage: {
    position: 'absolute',
    width: width,
    height: height,
  },
  backgroundScale: {
    flex: 1,
    transform: [{ scale: 1.1 }],
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  topFadeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 50,
    zIndex: 10,
  },
  decorativeBlur1: {
    position: 'absolute',
    top: 80,
    right: 40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  decorativeBlur2: {
    position: 'absolute',
    bottom: 200,
    left: 40,
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: 64,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    zIndex: 20,
  },
  headerTitle: {
    fontSize: 32,
    color: COLORS.white,
    fontWeight: '700',
    lineHeight: 38,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '400',
    marginTop: 4,
  },
  historyButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    marginBottom: 16,
  },
  cardStack: {
    width: '100%',
    maxWidth: 360,
    height: 520,
    position: 'relative',
  },
  card: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 40,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  staticCard: {
    // Static cards in background
  },
  cardPressable: {
    flex: 1,
  },
  cardImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  cardGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cardBottomBlur: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '75%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  leftGlow: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: 48,
    height: '45%',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  rightGlow: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 48,
    height: '45%',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  cardContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: SPACING.lg,
  },
  locationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 100,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginBottom: SPACING.sm,
  },
  locationIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  locationText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '400',
  },
  missionTitle: {
    fontSize: 28,
    color: COLORS.white,
    fontWeight: '700',
    marginBottom: SPACING.sm,
    lineHeight: 34,
  },
  missionDescription: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.8)',
    lineHeight: 22,
    marginBottom: SPACING.md,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: SPACING.lg,
  },
  tagText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '400',
  },
  actionButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 100,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  actionButtonText: {
    fontSize: 16,
    color: COLORS.black,
    fontWeight: '600',
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 100,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  dotActive: {
    width: 32,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.white,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 2,
  },
});
