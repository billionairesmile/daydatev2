import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  StatusBar,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Instagram,
  Mail,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LinearGradient } from 'expo-linear-gradient';

import Svg, { Path } from 'react-native-svg';
import { COLORS, SPACING, RADIUS } from '@/constants/design';
import { FAQ_DATA, type FAQItem } from '@/constants/faqData';
import { useLanguageStore, type SupportedLanguage } from '@/stores/languageStore';

// WhatsApp Icon Component
const WhatsAppIcon = ({ size = 24, color = '#25D366' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </Svg>
);

// KakaoTalk Icon Component
const KakaoTalkIcon = ({ size = 24, color = '#000' }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
    <Path d="M12 3c-5.52 0-10 3.59-10 8 0 2.78 1.82 5.22 4.56 6.64-.15.53-.96 3.41-.99 3.64 0 0-.02.13.05.19.07.05.16.03.16.03.21-.03 2.42-1.56 3.43-2.22.88.13 1.81.19 2.79.19 5.52 0 10-3.59 10-8s-4.48-8-10-8z" />
  </Svg>
);

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

  const handleInstagram = () => {
    Linking.openURL('https://instagram.com/daydate.my');
  };

  const handleWhatsApp = () => {
    Linking.openURL('https://chat.whatsapp.com/LYZKsX5VKsLGj6sNmq72jg');
  };

  const handleKakaoTalk = () => {
    Alert.alert(t('more.customerService.comingSoon'));
  };

  const handleEmail = () => {
    Linking.openURL('mailto:daydateceo@gmail.com');
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

        {/* Contact Section */}
        <View style={styles.inquiryContainer}>
          <Text style={styles.inquiryTitle}>{t('more.customerService.inquiryTitle')}</Text>
          <Text style={styles.inquiryDescription}>
            {t('more.customerService.inquiryDescription')}
          </Text>
          <View style={styles.contactButtonsRow}>
            <Pressable style={styles.contactButton} onPress={handleInstagram}>
              <LinearGradient
                colors={['#FCAF45', '#F77737', '#FD1D1D', '#E1306C', '#C13584', '#833AB4', '#5851DB']}
                start={{ x: 1, y: 1 }}
                end={{ x: 0, y: 0 }}
                style={styles.contactIconWrapper}
              >
                <Instagram color="#fff" size={22} />
              </LinearGradient>
            </Pressable>
            <Pressable style={styles.contactButton} onPress={handleWhatsApp}>
              <View style={[styles.contactIconWrapper, { backgroundColor: '#25D366' }]}>
                <WhatsAppIcon size={22} color="#fff" />
              </View>
            </Pressable>
            <Pressable style={styles.contactButton} onPress={handleKakaoTalk}>
              <View style={[styles.contactIconWrapper, { backgroundColor: '#FEE500' }]}>
                <KakaoTalkIcon size={22} color="#000" />
              </View>
            </Pressable>
            <Pressable style={styles.contactButton} onPress={handleEmail}>
              <View style={[styles.contactIconWrapper, { backgroundColor: '#666' }]}>
                <Mail color="#fff" size={22} />
              </View>
            </Pressable>
          </View>
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
  contactButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.lg,
  },
  contactButton: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
