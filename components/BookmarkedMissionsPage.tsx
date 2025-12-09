import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  Alert,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronLeft, Bookmark, Trash2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';

import { COLORS, SPACING } from '@/constants/design';
import { useMissionStore } from '@/stores/missionStore';
import type { KeptMission } from '@/types';

interface BookmarkedMissionsPageProps {
  onBack: () => void;
}

export function BookmarkedMissionsPage({ onBack }: BookmarkedMissionsPageProps) {
  const router = useRouter();
  const { keptMissions, removeKeptMissionByKeptId, canStartMission, isTodayCompletedMission } = useMissionStore();

  const handleMissionPress = useCallback((missionId: string) => {
    // Show message if can't start (already completed another mission today)
    if (!canStartMission(missionId) && !isTodayCompletedMission(missionId)) {
      Alert.alert(
        '미션 시작 불가',
        '오늘 가능한 미션을 모두 완료했어요.\n내일 다시 도전해보세요!',
        [{ text: '확인' }]
      );
      return;
    }

    router.push(`/mission/${missionId}`);
  }, [router, canStartMission, isTodayCompletedMission]);

  const handleRemove = useCallback((keptId: string, title: string) => {
    Alert.alert(
      '미션 삭제',
      `'${title}' 미션을 삭제하시겠어요?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제',
          style: 'destructive',
          onPress: () => removeKeptMissionByKeptId(keptId),
        },
      ]
    );
  }, [removeKeptMissionByKeptId]);

  return (
    <View style={styles.container}>
      {/* Blurred Background Overlay */}
      <BlurView
        intensity={80}
        tint="dark"
        style={styles.blurOverlay}
      />
      <View style={styles.darkOverlay} />

      {/* Header */}
      <View style={styles.header}>
        {/* Back Button */}
        <Pressable onPress={onBack} style={styles.backButton}>
          <ChevronLeft color={COLORS.white} size={24} />
        </Pressable>

        {/* Centered Title */}
        <Text style={styles.headerTitle}>보관함</Text>

        {/* Spacer for alignment */}
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      {keptMissions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconContainer}>
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
            <Bookmark color="rgba(255, 255, 255, 0.4)" size={40} />
          </View>
          <Text style={styles.emptyText}>보관한 미션이 없어요</Text>
          <Text style={styles.emptySubtext}>마음에 드는 미션을 Keep 해보세요</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={true}
          alwaysBounceVertical={true}
        >
          {keptMissions.map((mission: KeptMission) => (
            <View key={mission.keptId} style={styles.missionCard}>
              <BlurView intensity={10} tint="dark" style={StyleSheet.absoluteFill} />

              <View style={styles.cardInner}>
                {/* Thumbnail */}
                <View style={styles.thumbnailContainer}>
                  <Image
                    source={{ uri: `${mission.imageUrl}?w=300&h=400&fit=crop` }}
                    style={styles.thumbnail}
                    resizeMode="cover"
                  />
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.5)']}
                    style={styles.thumbnailOverlay}
                  />
                </View>

                {/* Content */}
                <View style={styles.cardContent}>
                  {/* Title */}
                  <Text style={styles.missionTitle} numberOfLines={2}>
                    {mission.title}
                  </Text>

                  {/* Description */}
                  <Text style={styles.missionDescription} numberOfLines={2}>
                    {mission.description}
                  </Text>

                  {/* Action Buttons */}
                  <View style={styles.actionButtonsRow}>
                    {/* Start Button */}
                    <Pressable
                      style={[
                        styles.startButton,
                        !canStartMission(mission.id) && !isTodayCompletedMission(mission.id) && styles.startButtonDisabled,
                      ]}
                      onPress={() => handleMissionPress(mission.id)}
                    >
                      <Text style={[
                        styles.startButtonText,
                        !canStartMission(mission.id) && !isTodayCompletedMission(mission.id) && styles.startButtonTextDisabled,
                      ]}>
                        {isTodayCompletedMission(mission.id) ? '완료' : '시작하기'}
                      </Text>
                    </Pressable>

                    {/* Delete Button */}
                    <Pressable
                      style={styles.deleteButton}
                      onPress={() => handleRemove(mission.keptId, mission.title)}
                    >
                      <Trash2 color={COLORS.white} size={18} />
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  blurOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  darkOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 64,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    zIndex: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    color: COLORS.white,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 40,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -80,
  },
  emptyIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    marginBottom: 16,
    overflow: 'hidden',
  },
  emptyText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '500',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.4)',
    fontWeight: '400',
    textAlign: 'center',
    marginTop: 8,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingBottom: 120,
    gap: 16,
  },
  missionCard: {
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'hidden',
  },
  cardInner: {
    flexDirection: 'row',
    gap: 16,
    padding: 16,
  },
  thumbnailContainer: {
    width: 96,
    height: 120,
    borderRadius: 16,
    overflow: 'hidden',
    flexShrink: 0,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
  },
  thumbnailOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '50%',
  },
  cardContent: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'space-between',
  },
  missionTitle: {
    fontSize: 16,
    color: COLORS.white,
    fontWeight: '600',
    lineHeight: 21,
    marginBottom: 4,
  },
  missionDescription: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '400',
    lineHeight: 18,
    marginBottom: 12,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  startButton: {
    flex: 1,
    height: 40,
    borderRadius: 100,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FF4444',
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonText: {
    fontSize: 14,
    color: COLORS.black,
    fontWeight: '600',
  },
  startButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  startButtonTextDisabled: {
    color: 'rgba(255, 255, 255, 0.5)',
  },
});

export default BookmarkedMissionsPage;
