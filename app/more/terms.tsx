import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft color={COLORS.black} size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('settings.other.termsAndPolicies')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Terms Section */}
        <Text style={styles.sectionTitle}>{t('settings.other.termsAndPolicies')}</Text>
        <View style={styles.termsContainer}>
          {/* Terms of Service */}
          <Pressable
            style={styles.menuItem}
            onPress={() => openPolicyModal('https://daydate.my/policy/terms', t('settings.other.termsOfService'))}
          >
            <View style={styles.menuItemLeft}>
              <View style={styles.iconWrapper}>
                <FileText color={COLORS.black} size={20} />
              </View>
              <Text style={styles.menuItemLabel}>{t('settings.other.termsOfService')}</Text>
            </View>
            <ChevronRight color="#999" size={20} />
          </Pressable>

          <View style={styles.divider} />

          {/* Location Terms */}
          <Pressable
            style={styles.menuItem}
            onPress={() => openPolicyModal('https://daydate.my/policy/location', t('settings.other.locationTerms'))}
          >
            <View style={styles.menuItemLeft}>
              <View style={styles.iconWrapper}>
                <MapPin color={COLORS.black} size={20} />
              </View>
              <Text style={styles.menuItemLabel}>{t('settings.other.locationTerms')}</Text>
            </View>
            <ChevronRight color="#999" size={20} />
          </Pressable>

          <View style={styles.divider} />

          {/* Privacy Policy */}
          <Pressable
            style={styles.menuItem}
            onPress={() => openPolicyModal('https://daydate.my/policy/privacy', t('settings.other.privacyPolicy'))}
          >
            <View style={styles.menuItemLeft}>
              <View style={styles.iconWrapper}>
                <Shield color={COLORS.black} size={20} />
              </View>
              <Text style={styles.menuItemLabel}>{t('settings.other.privacyPolicy')}</Text>
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
  termsContainer: {
    marginHorizontal: SPACING.lg,
    backgroundColor: '#f8f8f8',
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.md,
  },
  menuItemLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.black,
    flex: 1,
    paddingRight: SPACING.sm,
  },
  divider: {
    height: 1,
    backgroundColor: '#e8e8e8',
    marginLeft: SPACING.lg + 36 + SPACING.md,
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
