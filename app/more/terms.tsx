import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { WebView } from 'react-native-webview';
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Shield,
  MapPin,
  X,
} from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { COLORS, SPACING, RADIUS } from '@/constants/design';

export default function TermsScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  const [policyModalVisible, setPolicyModalVisible] = useState(false);
  const [policyUrl, setPolicyUrl] = useState('');
  const [policyTitle, setPolicyTitle] = useState('');
  const [webViewLoading, setWebViewLoading] = useState(true);

  const openPolicyModal = (url: string, title: string) => {
    setPolicyUrl(url);
    setPolicyTitle(title);
    setWebViewLoading(true);
    setPolicyModalVisible(true);
  };

  const closePolicyModal = () => {
    setPolicyModalVisible(false);
    setPolicyUrl('');
    setPolicyTitle('');
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.background} />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <ChevronLeft color={COLORS.black} size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('settings.other.termsAndPolicies')}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.settingCard}>
          {/* Terms of Service */}
          <Pressable
            style={styles.menuItem}
            onPress={() => openPolicyModal('https://daydate.my/policy/terms', t('settings.other.termsOfService'))}
          >
            <View style={styles.settingItemLeft}>
              <View style={styles.iconWrapper}>
                <FileText color={COLORS.black} size={20} />
              </View>
              <Text style={styles.settingItemLabel}>{t('settings.other.termsOfService')}</Text>
            </View>
            <ChevronRight color="#999" size={20} />
          </Pressable>

          <View style={styles.settingDivider} />

          {/* Location Terms */}
          <Pressable
            style={styles.menuItem}
            onPress={() => openPolicyModal('https://daydate.my/policy/location', t('settings.other.locationTerms'))}
          >
            <View style={styles.settingItemLeft}>
              <View style={styles.iconWrapper}>
                <MapPin color={COLORS.black} size={20} />
              </View>
              <Text style={styles.settingItemLabel}>{t('settings.other.locationTerms')}</Text>
            </View>
            <ChevronRight color="#999" size={20} />
          </Pressable>

          <View style={styles.settingDivider} />

          {/* Privacy Policy */}
          <Pressable
            style={styles.menuItem}
            onPress={() => openPolicyModal('https://daydate.my/policy/privacy', t('settings.other.privacyPolicy'))}
          >
            <View style={styles.settingItemLeft}>
              <View style={styles.iconWrapper}>
                <Shield color={COLORS.black} size={20} />
              </View>
              <Text style={styles.settingItemLabel}>{t('settings.other.privacyPolicy')}</Text>
            </View>
            <ChevronRight color="#999" size={20} />
          </Pressable>
        </View>
      </ScrollView>

      {/* Policy WebView Modal */}
      <Modal
        visible={policyModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closePolicyModal}
      >
        <SafeAreaView style={styles.policyModalContainer}>
          <View style={styles.policyModalHeader}>
            <Text style={styles.policyModalTitle}>{policyTitle}</Text>
            <Pressable
              style={styles.policyModalCloseButton}
              onPress={closePolicyModal}
              hitSlop={8}
            >
              <X color={COLORS.black} size={24} />
            </Pressable>
          </View>
          {webViewLoading && (
            <View style={styles.webViewLoading}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          )}
          <WebView
            source={{ uri: policyUrl }}
            style={styles.webView}
            onLoadEnd={() => setWebViewLoading(false)}
            onLoadStart={() => setWebViewLoading(true)}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.xl + 44,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.background,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.black,
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.lg,
  },
  settingCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    marginTop: SPACING.md,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  settingItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  settingItemLabel: {
    fontSize: 15,
    color: COLORS.black,
    fontWeight: '500',
  },
  settingDivider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginLeft: SPACING.md + 36 + SPACING.md,
  },
  policyModalContainer: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  policyModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  policyModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.black,
  },
  policyModalCloseButton: {
    padding: SPACING.xs,
  },
  webView: {
    flex: 1,
  },
  webViewLoading: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -20,
    marginTop: -20,
    zIndex: 1,
  },
});
