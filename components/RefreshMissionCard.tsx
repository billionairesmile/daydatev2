import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { COLORS, SPACING, RADIUS } from '@/constants/design';
import { usePremiumFeature } from '@/stores/subscriptionStore';

interface RefreshMissionCardProps {
  onRefreshPress: () => void;
}

export default function RefreshMissionCard({ onRefreshPress }: RefreshMissionCardProps) {
  const { t } = useTranslation();
  const { isPremium } = usePremiumFeature();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.textContainer}>
          <Text style={styles.questionText}>
            {t('mission.refresh.questionLine1')}
          </Text>
          <Text style={styles.questionText}>
            {t('mission.refresh.questionLine2')}
          </Text>
        </View>

        <Pressable
          style={styles.refreshButton}
          onPress={onRefreshPress}
        >
          <Text style={styles.refreshButtonText}>
            {t('mission.refresh.button')}
          </Text>
        </Pressable>

        {!isPremium && (
          <Text style={styles.hintText}>
            {t('mission.refresh.hint')}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 45,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.xl,
    paddingTop: 40,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 140,
  },
  questionText: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.black,
    textAlign: 'center',
    lineHeight: 32,
  },
  refreshButton: {
    paddingVertical: 16,
    paddingHorizontal: 32,
    backgroundColor: COLORS.black,
    borderRadius: RADIUS.lg,
  },
  refreshButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  hintText: {
    marginTop: SPACING.xl,
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
});
