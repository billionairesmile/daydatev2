import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  StatusBar,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { ChevronLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { COLORS, SPACING } from '@/constants/design';

const GIFT_SHOP_URL = 'https://link.inpock.co.kr/daydate';

export default function GiftShopScreen() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft color={COLORS.black} size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>Gift Shop</Text>
        <View style={styles.headerSpacer} />
      </View>
      {isLoading && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      )}
      <WebView
        source={{ uri: GIFT_SHOP_URL }}
        style={styles.webView}
        onLoadEnd={() => setIsLoading(false)}
        onLoadStart={() => setIsLoading(true)}
      />
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
  webView: {
    flex: 1,
  },
  loading: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -20,
    marginTop: -20,
    zIndex: 1,
  },
});
