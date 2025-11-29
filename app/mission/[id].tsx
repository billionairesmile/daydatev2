import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Dimensions,
  Pressable,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import {
  ChevronLeft,
  Clock,
  MapPin,
  Camera,
  Edit3,
  Check,
  User,
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '@/constants/design';
import { SAMPLE_MISSIONS } from '@/stores/missionStore';

const { width, height } = Dimensions.get('window');

export default function MissionDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [photoTaken, setPhotoTaken] = useState(false);
  const [user1Message, setUser1Message] = useState<string | null>(null);
  const [user2Message, setUser2Message] = useState<string | null>(null);

  const mission = SAMPLE_MISSIONS.find((m) => m.id === id) || SAMPLE_MISSIONS[0];

  const handleTakePhoto = () => {
    // TODO: Implement camera functionality
    setPhotoTaken(true);
  };

  const handleAddMessage = () => {
    // TODO: Implement message modal
    if (!user1Message) {
      setUser1Message('오늘 정말 재밌었어!');
    } else if (!user2Message) {
      setUser2Message('나도 너무 좋았어 💕');
    }
  };

  const isComplete = photoTaken && user1Message && user2Message;

  return (
    <View style={styles.container}>
      {/* Background */}
      <ImageBackground
        source={{ uri: mission.imageUrl }}
        style={styles.backgroundImage}
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.4)', 'rgba(0,0,0,0.7)']}
          style={styles.overlay}
        />
      </ImageBackground>

      {/* Header */}
      <BlurView intensity={60} tint="dark" style={styles.header}>
        <View style={styles.headerContent}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeft color={COLORS.white} size={24} />
          </Pressable>
          <Text style={styles.headerTitle}>미션 상세</Text>
          <View style={styles.headerSpacer} />
        </View>
      </BlurView>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Mission Info Card */}
        <BlurView intensity={60} tint="dark" style={styles.missionCard}>
          <View style={styles.missionContent}>
            <View style={styles.missionHeader}>
              <Text style={styles.missionTitle}>{mission.title}</Text>
            </View>

            <View style={styles.categoryBadge}>
              <Text style={styles.categoryText}>{mission.category}</Text>
            </View>

            <Text style={styles.missionDescription}>{mission.description}</Text>

            <View style={styles.missionMeta}>
              <View style={styles.metaItem}>
                <Clock color={COLORS.glass.white70} size={18} />
                <Text style={styles.metaText}>{mission.duration}</Text>
              </View>
              <View style={styles.metaItem}>
                <MapPin color={COLORS.glass.white70} size={18} />
                <Text style={styles.metaText}>{mission.locationType}</Text>
              </View>
            </View>

            <View style={styles.tagsContainer}>
              {mission.tags.map((tag, index) => (
                <View key={index} style={styles.tag}>
                  <Text style={styles.tagText}>#{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        </BlurView>

        {/* Mission Steps Card */}
        <BlurView intensity={60} tint="dark" style={styles.stepsCard}>
          <View style={styles.stepsContent}>
            <View style={styles.stepsHeader}>
              <Text style={styles.stepsTitle}>미션 완료 방법</Text>
              {isComplete && (
                <View style={styles.completeBadge}>
                  <Check color={COLORS.status.success} size={14} />
                  <Text style={styles.completeText}>미션 완료!</Text>
                </View>
              )}
            </View>

            {/* Step 1: Photo */}
            <View style={styles.stepItem}>
              <View style={styles.stepIndicator}>
                <View
                  style={[
                    styles.stepCircle,
                    photoTaken && styles.stepCircleComplete,
                  ]}
                >
                  {photoTaken ? (
                    <Check color={COLORS.white} size={16} />
                  ) : (
                    <Text style={styles.stepNumber}>1</Text>
                  )}
                </View>
                <View style={styles.stepLine} />
              </View>
              <View style={styles.stepContent}>
                <View style={styles.stepTitleRow}>
                  <Camera color={COLORS.white} size={18} />
                  <Text style={styles.stepTitle}>사진 촬영하기</Text>
                  {photoTaken && <Text style={styles.stepComplete}>완료</Text>}
                </View>
                <Text style={styles.stepDescription}>
                  두 분의 특별한 순간을 사진으로 담아주세요.
                </Text>
              </View>
            </View>

            {/* Step 2: Messages */}
            <View style={styles.stepItem}>
              <View style={styles.stepIndicator}>
                <View
                  style={[
                    styles.stepCircle,
                    user1Message && user2Message && styles.stepCircleComplete,
                  ]}
                >
                  {user1Message && user2Message ? (
                    <Check color={COLORS.white} size={16} />
                  ) : (
                    <Text style={styles.stepNumber}>2</Text>
                  )}
                </View>
              </View>
              <View style={styles.stepContent}>
                <View style={styles.stepTitleRow}>
                  <Edit3 color={COLORS.white} size={18} />
                  <Text style={styles.stepTitle}>서로에게 한마디</Text>
                  {user1Message && user2Message && (
                    <Text style={styles.stepComplete}>완료</Text>
                  )}
                </View>
                <Text style={styles.stepDescription}>
                  이 순간 상대방에게 전하고 싶은 마음을 남겨보세요.
                </Text>

                {/* User Status */}
                <View style={styles.userStatusContainer}>
                  <View style={styles.userStatus}>
                    <View
                      style={[
                        styles.userIcon,
                        user1Message && styles.userIconComplete,
                      ]}
                    >
                      <User
                        color={user1Message ? COLORS.white : COLORS.glass.white50}
                        size={14}
                      />
                    </View>
                    <View style={styles.userInfo}>
                      <Text style={styles.userLabel}>나</Text>
                      <Text
                        style={[
                          styles.userStatusText,
                          user1Message && styles.userStatusComplete,
                        ]}
                      >
                        {user1Message ? '작성 완료' : '미작성'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.userStatus}>
                    <View
                      style={[
                        styles.userIcon,
                        user2Message && styles.userIconComplete,
                      ]}
                    >
                      <User
                        color={user2Message ? COLORS.white : COLORS.glass.white50}
                        size={14}
                      />
                    </View>
                    <View style={styles.userInfo}>
                      <Text style={styles.userLabel}>상대방</Text>
                      <Text
                        style={[
                          styles.userStatusText,
                          user2Message && styles.userStatusComplete,
                        ]}
                      >
                        {user2Message ? '작성 완료' : '미작성'}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          </View>
        </BlurView>
      </ScrollView>

      {/* Bottom CTA */}
      <BlurView intensity={60} tint="dark" style={styles.bottomBar}>
        <View style={styles.bottomContent}>
          <Pressable
            style={styles.ctaButton}
            onPress={
              isComplete
                ? () => router.back()
                : photoTaken
                ? handleAddMessage
                : handleTakePhoto
            }
          >
            <Text style={styles.ctaButtonText}>
              {isComplete
                ? '확인'
                : photoTaken
                ? '서로에게 한마디'
                : '사진 촬영하기'}
            </Text>
          </Pressable>
        </View>
      </BlurView>
    </View>
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
  overlay: {
    flex: 1,
  },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.glass.white20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: 50,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.glass.white10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.glass.white20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    color: COLORS.white,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: 120,
  },
  missionCard: {
    borderRadius: RADIUS.xxl,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.glass.white20,
  },
  missionContent: {
    padding: SPACING.lg,
    backgroundColor: COLORS.glass.white10,
  },
  missionHeader: {
    marginBottom: SPACING.sm,
  },
  missionTitle: {
    fontSize: TYPOGRAPHY.fontSize.display,
    color: COLORS.white,
    fontWeight: TYPOGRAPHY.fontWeight.bold,
  },
  categoryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.glass.white30,
    borderRadius: RADIUS.full,
    marginBottom: SPACING.md,
  },
  categoryText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.white,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  missionDescription: {
    fontSize: TYPOGRAPHY.fontSize.base,
    color: COLORS.glass.white90,
    lineHeight: 24,
    marginBottom: SPACING.lg,
  },
  missionMeta: {
    flexDirection: 'row',
    marginBottom: SPACING.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: SPACING.xl,
  },
  metaText: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.glass.white70,
    marginLeft: SPACING.sm,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tag: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.glass.white20,
    borderRadius: RADIUS.full,
    marginRight: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  tagText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.glass.white80,
  },
  stepsCard: {
    borderRadius: RADIUS.xxl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.glass.white20,
  },
  stepsContent: {
    padding: SPACING.lg,
    backgroundColor: COLORS.glass.white10,
  },
  stepsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  stepsTitle: {
    fontSize: TYPOGRAPHY.fontSize.lg,
    color: COLORS.white,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
  },
  completeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    backgroundColor: COLORS.status.successLight,
    borderRadius: RADIUS.full,
  },
  completeText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.status.success,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    marginLeft: SPACING.xs,
  },
  stepItem: {
    flexDirection: 'row',
    marginBottom: SPACING.lg,
  },
  stepIndicator: {
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.glass.white30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleComplete: {
    backgroundColor: COLORS.status.success,
  },
  stepNumber: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.white,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
  },
  stepLine: {
    width: 2,
    flex: 1,
    backgroundColor: COLORS.glass.white20,
    marginTop: SPACING.sm,
  },
  stepContent: {
    flex: 1,
    paddingBottom: SPACING.md,
  },
  stepTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  stepTitle: {
    fontSize: TYPOGRAPHY.fontSize.base,
    color: COLORS.white,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
    marginLeft: SPACING.sm,
  },
  stepComplete: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.status.success,
    marginLeft: SPACING.sm,
  },
  stepDescription: {
    fontSize: TYPOGRAPHY.fontSize.md,
    color: COLORS.glass.white70,
    lineHeight: 20,
  },
  userStatusContainer: {
    flexDirection: 'row',
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  userStatus: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.sm,
    backgroundColor: COLORS.glass.white10,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.glass.white20,
  },
  userIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.glass.white20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userIconComplete: {
    backgroundColor: COLORS.status.success,
  },
  userInfo: {
    marginLeft: SPACING.sm,
    flex: 1,
  },
  userLabel: {
    fontSize: TYPOGRAPHY.fontSize.xs,
    color: COLORS.glass.white60,
  },
  userStatusText: {
    fontSize: TYPOGRAPHY.fontSize.sm,
    color: COLORS.glass.white50,
    fontWeight: TYPOGRAPHY.fontWeight.medium,
  },
  userStatusComplete: {
    color: COLORS.status.success,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: COLORS.glass.white20,
  },
  bottomContent: {
    padding: SPACING.lg,
    paddingBottom: 34,
    backgroundColor: COLORS.glass.white10,
  },
  ctaButton: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    paddingVertical: SPACING.lg,
    alignItems: 'center',
  },
  ctaButtonText: {
    fontSize: TYPOGRAPHY.fontSize.base,
    color: COLORS.black,
    fontWeight: TYPOGRAPHY.fontWeight.semiBold,
  },
});
