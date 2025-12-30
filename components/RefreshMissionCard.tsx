import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
} from 'react-native';
import { RefreshCw } from 'lucide-react-native';
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
        {/* Icon */}
        <View style={styles.iconContainer}>
          <RefreshCw color={COLORS.black} size={32} strokeWidth={1.5} />
        </View>

        {/* Text */}
        <Text style={styles.questionText}>
          {t('mission.refresh.questionLine1')}
        </Text>
        <Text style={styles.questionText}>
          {t('mission.refresh.questionLine2')}
        </Text>

        {/* Button */}
        <Pressable
          style={styles.refreshButton}
          onPress={onRefreshPress}
        >
          <Text style={styles.refreshButtonText}>
            {t('mission.refresh.button')}
          </Text>
        </Pressable>

        {/* Hint text - only show for non-premium users */}
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
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  questionText: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.black,
    textAlign: 'center',
    lineHeight: 28,
  },
  refreshButton: {
    marginTop: SPACING.xl,
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
    marginTop: SPACING.md,
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
  },
});
