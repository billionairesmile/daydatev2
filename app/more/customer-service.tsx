import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  SafeAreaView,
  StatusBar,
  Linking,
} from 'react-native';
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  MessageCircle,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { COLORS, SPACING, RADIUS } from '@/constants/design';
import { FAQ_DATA, type FAQItem } from '@/constants/faqData';
import { useLanguageStore, type SupportedLanguage } from '@/stores/languageStore';

export default function CustomerServiceScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { language } = useLanguageStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Get FAQ items from hardcoded data based on user's language setting
  const faqItems = FAQ_DATA[language] || FAQ_DATA.en;

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleKakaoInquiry = () => {
    // 카카오톡 채널 링크로 이동
    Linking.openURL('https://pf.kakao.com/_example');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft color={COLORS.black} size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('more.customerService.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* FAQ Section */}
        <Text style={styles.sectionTitle}>{t('more.customerService.faqTitle')}</Text>
        <View style={styles.faqContainer}>
          {faqItems.map((item, index) => {
            const isExpanded = expandedId === item.id;
            const isLast = index === faqItems.length - 1;
            return (
              <View key={item.id}>
                <Pressable
                  style={[styles.faqItem, !isLast && !isExpanded && styles.faqItemBorder]}
                  onPress={() => toggleExpand(item.id)}
                >
                  <Text style={styles.faqQuestion}>{item.question}</Text>
                  {isExpanded ? (
                    <ChevronUp color="#999" size={20} />
                  ) : (
                    <ChevronDown color="#999" size={20} />
                  )}
                </Pressable>
                {isExpanded && (
                  <View style={[styles.faqAnswer, !isLast && styles.faqAnswerBorder]}>
                    <Text style={styles.faqAnswerText}>{item.answer}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Kakao Inquiry Section */}
        <View style={styles.inquiryContainer}>
          <Text style={styles.inquiryTitle}>{t('more.customerService.inquiryTitle')}</Text>
          <Text style={styles.inquiryDescription}>
            {t('more.customerService.inquiryDescription')}
          </Text>
          <Pressable style={styles.kakaoButton} onPress={handleKakaoInquiry}>
            <View style={styles.kakaoIcon}>
              <MessageCircle color="#000" size={20} />
            </View>
            <Text style={styles.kakaoButtonText}>{t('more.customerService.kakaoButton')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.black,
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: SPACING.lg,
    paddingBottom: 100,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
    marginLeft: SPACING.lg,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  faqContainer: {
    marginHorizontal: SPACING.lg,
    backgroundColor: '#f8f8f8',
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  faqItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
  },
  faqItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  faqQuestion: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.black,
    flex: 1,
    paddingRight: SPACING.sm,
  },
  faqAnswer: {
    backgroundColor: '#f0f0f0',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
  },
  faqAnswerBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#e8e8e8',
  },
  faqAnswerText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  inquiryContainer: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.xl,
    backgroundColor: '#fff9e6',
    borderRadius: RADIUS.md,
    padding: SPACING.xl,
    alignItems: 'center',
  },
  inquiryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.black,
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  inquiryDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: SPACING.lg,
  },
  kakaoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE500',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: RADIUS.full,
    gap: SPACING.sm,
  },
  kakaoIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kakaoButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
});
