import React, { useState, useRef, useCallback } from 'react';
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
import type { WebViewNavigation } from 'react-native-webview';
import { ChevronLeft } from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { COLORS, SPACING } from '@/constants/design';

// Suppress error alert/confirm dialogs (e.g. Yes24 '에러' messages on page load).
// Uses Object.defineProperty to prevent the site from re-assigning window.alert.
// Harmless for non-Korean sites since it only blocks messages containing '에러'.
const ALERT_SUPPRESSION = `
(function() {
  if (window.__alertSuppressed) return;
  window.__alertSuppressed = true;
  var origAlert = window.alert;
  var origConfirm = window.confirm;
  function suppressed(msg) {
    return typeof msg === 'string' && (msg.indexOf('에러') !== -1 || msg.indexOf('조회') !== -1);
  }
  try {
    Object.defineProperty(window, 'alert', {
      value: function(msg) { if (!suppressed(msg)) origAlert.call(window, msg); },
      writable: false,
      configurable: true
    });
    Object.defineProperty(window, 'confirm', {
      value: function(msg) { return suppressed(msg) ? true : origConfirm.call(window, msg); },
      writable: false,
      configurable: true
    });
  } catch(e) {
    window.alert = function(msg) { if (!suppressed(msg)) origAlert.call(window, msg); };
    window.confirm = function(msg) { return suppressed(msg) ? true : origConfirm.call(window, msg); };
  }
})();
true;
`;

export default function WebViewerScreen() {
  const router = useRouter();
  const { url, title } = useLocalSearchParams<{ url: string; title?: string }>();
  const [isLoading, setIsLoading] = useState(true);
  const webViewRef = useRef<WebView>(null);

  // Re-inject suppression script after redirects (e.g. affiliate → yes24)
  const handleNavigationStateChange = useCallback((navState: WebViewNavigation) => {
    if (navState.url?.includes('yes24') || navState.url?.includes('ticket.')) {
      webViewRef.current?.injectJavaScript(ALERT_SUPPRESSION);
    }
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <ChevronLeft color={COLORS.black} size={24} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title || ''}
        </Text>
        <View style={styles.headerSpacer} />
      </View>
      {isLoading && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      )}
      <WebView
        ref={webViewRef}
        source={{ uri: url || '' }}
        style={styles.webView}
        onLoadEnd={() => setIsLoading(false)}
        onLoadStart={() => setIsLoading(true)}
        injectedJavaScriptBeforeContentLoaded={ALERT_SUPPRESSION}
        injectedJavaScript={ALERT_SUPPRESSION}
        onNavigationStateChange={handleNavigationStateChange}
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
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 8,
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
