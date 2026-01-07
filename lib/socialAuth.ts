import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform, Dimensions } from 'react-native';
import * as Device from 'expo-device';
import { supabase, isDemoMode } from './supabase';
import { removePushToken, cancelAllScheduledNotifications } from './pushNotifications';

/**
 * Check if current device is an iPad
 * Uses multiple detection methods for reliability
 */
const isIPad = (): boolean => {
  if (Platform.OS !== 'ios') return false;

  // Method 1: Check device type from expo-device
  if (Device.deviceType === Device.DeviceType.TABLET) {
    return true;
  }

  // Method 2: Check screen dimensions (iPad typically has larger screens)
  const { width, height } = Dimensions.get('window');
  const screenSize = Math.max(width, height);

  // iPads typically have screens >= 768 points on the short edge
  // or >= 1024 points on the long edge
  if (Math.min(width, height) >= 600 || screenSize >= 1024) {
    return true;
  }

  // Method 3: Check Platform constants (works on some iOS versions)
  // @ts-ignore - interfaceIdiom is not in the type definitions
  if (Platform.isPad === true) {
    return true;
  }

  return false;
};

// Required for web only
WebBrowser.maybeCompleteAuthSession();

// Redirect URI for OAuth
// Expo Go uses exp:// scheme, standalone apps use custom scheme
const redirectTo = makeRedirectUri({
  // For Expo Go development, don't specify scheme (uses exp://)
  // For production builds, specify your custom scheme
  ...(process.env.NODE_ENV === 'development' ? {} : { scheme: 'daydate' }),
  path: 'auth/callback',
});

// Log the redirect URI for debugging
console.log('[SocialAuth] Redirect URI:', redirectTo);

export type SocialProvider = 'google' | 'kakao' | 'apple';

interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  user: {
    id: string;
    email?: string;
    user_metadata?: {
      full_name?: string;
      avatar_url?: string;
      name?: string;
      picture?: string;
    };
  };
}

/**
 * Extract params from URL (handles both query params and hash fragments)
 */
const extractParamsFromUrl = (url: string): Record<string, string> => {
  const params: Record<string, string> = {};

  // Try to get params from hash fragment first (Supabase OAuth uses this)
  const hashIndex = url.indexOf('#');
  if (hashIndex !== -1) {
    const hashParams = url.substring(hashIndex + 1);
    const searchParams = new URLSearchParams(hashParams);
    searchParams.forEach((value, key) => {
      params[key] = value;
    });
  }

  // Also check query params
  const queryIndex = url.indexOf('?');
  if (queryIndex !== -1) {
    const endIndex = hashIndex !== -1 ? hashIndex : url.length;
    const queryString = url.substring(queryIndex + 1, endIndex);
    const searchParams = new URLSearchParams(queryString);
    searchParams.forEach((value, key) => {
      if (!params[key]) {
        params[key] = value;
      }
    });
  }

  return params;
};

/**
 * Create a Supabase session from the OAuth callback URL
 */
export const createSessionFromUrl = async (url: string) => {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return null;
  }

  try {
    console.log('[SocialAuth] Processing callback URL:', url);

    // Extract params from both hash fragment and query string
    const params = extractParamsFromUrl(url);
    console.log('[SocialAuth] Extracted params keys:', Object.keys(params));

    if (params.error) {
      console.error('OAuth error:', params.error, params.error_description);
      throw new Error(params.error_description || params.error);
    }

    const { access_token, refresh_token } = params;

    if (!access_token) {
      console.log('[SocialAuth] No access token found in URL');
      console.log('[SocialAuth] URL structure - has hash:', url.includes('#'), 'has query:', url.includes('?'));
      return null;
    }

    console.log('[SocialAuth] Access token found, setting session...');

    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    });

    if (error) {
      console.error('Error setting session:', error);
      throw error;
    }

    return data.session;
  } catch (error) {
    console.error('Error creating session from URL:', error);
    throw error;
  }
};

/**
 * Sign in with a social provider (Google or Kakao)
 */
export const signInWithProvider = async (provider: SocialProvider): Promise<AuthSession | null> => {
  console.log(`[SocialAuth] signInWithProvider called for ${provider}`);
  console.log(`[SocialAuth] isDemoMode: ${isDemoMode}, supabase exists: ${!!supabase}`);

  if (isDemoMode || !supabase) {
    console.log('Demo mode - social login not available');
    return null;
  }

  try {
    // Close any existing browser session first to prevent "Another web browser is already open" error
    // Use Promise.race with timeout to prevent hanging
    console.log('[SocialAuth] Dismissing any existing browser...');
    try {
      await Promise.race([
        WebBrowser.dismissBrowser(),
        new Promise((resolve) => setTimeout(resolve, 1000)), // 1 second timeout
      ]);
      console.log('[SocialAuth] Browser dismissed (or timed out)');
    } catch (dismissError) {
      console.log('[SocialAuth] dismissBrowser error (ignored):', dismissError);
    }

    console.log(`[SocialAuth] Starting ${provider} sign in...`);
    console.log(`[SocialAuth] Redirect URL: ${redirectTo}`);

    console.log('[SocialAuth] Calling supabase.auth.signInWithOAuth...');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: provider === 'google' ? {
          access_type: 'offline',
          prompt: 'consent',
        } : undefined,
      },
    });
    console.log('[SocialAuth] signInWithOAuth returned:', { hasData: !!data, hasError: !!error, url: data?.url?.substring(0, 50) + '...' });

    if (error) {
      console.error(`[SocialAuth] ${provider} OAuth error:`, error);
      throw error;
    }

    if (!data?.url) {
      console.error(`[SocialAuth] No auth URL returned for ${provider}`);
      return null;
    }

    console.log(`[SocialAuth] Opening auth URL for ${provider}: ${data.url.substring(0, 100)}...`);

    // Open the auth session in a browser
    // createTask: false forces Chrome Custom Tabs on Android (avoids WebView which Google blocks)
    const result = await WebBrowser.openAuthSessionAsync(
      data.url,
      redirectTo,
      {
        showInRecents: true,
        preferEphemeralSession: false,
        createTask: false,
      }
    );

    console.log(`[SocialAuth] WebBrowser result type: ${result.type}`);

    if (result.type === 'success') {
      const { url } = result;
      console.log(`[SocialAuth] Success! Processing callback URL...`);

      const session = await createSessionFromUrl(url);

      if (session) {
        console.log(`[SocialAuth] Session created successfully for user: ${session.user.id}`);
        return session as unknown as AuthSession;
      }
    } else if (result.type === 'cancel') {
      console.log(`[SocialAuth] User cancelled ${provider} sign in`);
    } else {
      console.log(`[SocialAuth] ${provider} sign in dismissed`);
    }

    return null;
  } catch (error) {
    console.error(`[SocialAuth] ${provider} sign in failed:`, error);
    throw error;
  }
};

/**
 * Sign in with Google
 */
export const signInWithGoogle = async () => {
  return signInWithProvider('google');
};

/**
 * Sign in with Kakao
 */
export const signInWithKakao = async () => {
  return signInWithProvider('kakao');
};

/**
 * Helper function to perform the actual Apple Sign-In request
 */
const performAppleSignIn = async (): Promise<AuthSession | null> => {
  // Request Apple Sign-In
  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  console.log('[SocialAuth] Apple credential received:', {
    hasIdentityToken: !!credential.identityToken,
    hasAuthorizationCode: !!credential.authorizationCode,
    hasEmail: !!credential.email,
    hasFullName: !!credential.fullName,
    user: credential.user?.substring(0, 20) + '...',
  });

  if (!credential.identityToken) {
    console.error('[SocialAuth] No identity token received from Apple');
    return null;
  }

  // Sign in to Supabase using the Apple identity token
  console.log('[SocialAuth] Signing in to Supabase with Apple token...');
  const { data, error } = await supabase!.auth.signInWithIdToken({
    provider: 'apple',
    token: credential.identityToken,
  });

  if (error) {
    console.error('[SocialAuth] Supabase Apple sign in error:', error);
    throw error;
  }

  if (data.session) {
    console.log('[SocialAuth] Apple Sign-In successful, user:', data.session.user.id);

    // If we got name from Apple (first sign in only), update user metadata
    if (credential.fullName?.givenName || credential.fullName?.familyName) {
      const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter(Boolean)
        .join(' ');

      if (fullName) {
        console.log('[SocialAuth] Updating user name:', fullName);
        await supabase!.auth.updateUser({
          data: { full_name: fullName, name: fullName }
        });
      }
    }

    return data.session as unknown as AuthSession;
  }

  return null;
};

/**
 * Sign in with Apple using web-based OAuth (for iPad)
 * iPad has issues with native Apple Sign-In after Settings redirect
 */
const signInWithAppleOAuth = async (): Promise<AuthSession | null> => {
  console.log('[SocialAuth] Using web-based Apple OAuth for iPad...');

  try {
    // Close any existing browser session first
    try {
      await Promise.race([
        WebBrowser.dismissBrowser(),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
    } catch (dismissError) {
      console.log('[SocialAuth] dismissBrowser error (ignored):', dismissError);
    }

    const { data, error } = await supabase!.auth.signInWithOAuth({
      provider: 'apple',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error) {
      console.error('[SocialAuth] Apple OAuth error:', error);
      throw error;
    }

    if (!data?.url) {
      console.error('[SocialAuth] No auth URL returned for Apple OAuth');
      return null;
    }

    console.log('[SocialAuth] Opening Apple OAuth URL...');

    const result = await WebBrowser.openAuthSessionAsync(
      data.url,
      redirectTo,
      {
        showInRecents: true,
        preferEphemeralSession: false,
      }
    );

    console.log(`[SocialAuth] WebBrowser result type: ${result.type}`);

    if (result.type === 'success') {
      const { url } = result;
      console.log('[SocialAuth] Apple OAuth success, processing callback...');

      const session = await createSessionFromUrl(url);

      if (session) {
        console.log('[SocialAuth] Apple OAuth session created for user:', session.user.id);
        return session as unknown as AuthSession;
      }
    } else if (result.type === 'cancel') {
      console.log('[SocialAuth] User cancelled Apple OAuth');
    }

    return null;
  } catch (error) {
    console.error('[SocialAuth] Apple OAuth failed:', error);
    throw error;
  }
};

/**
 * Sign in with Apple (iOS only)
 * Uses native authentication on iPhone, web-based OAuth on iPad
 * iPad has known issues with native Apple Sign-In after Settings redirect
 */
export const signInWithApple = async (): Promise<AuthSession | null> => {
  console.log('[SocialAuth] signInWithApple called');
  const isOnIPad = isIPad();
  console.log(`[SocialAuth] Platform: ${Platform.OS}, isIPad: ${isOnIPad}, isDemoMode: ${isDemoMode}`);

  if (isDemoMode || !supabase) {
    console.log('Demo mode - Apple login not available');
    return null;
  }

  if (Platform.OS !== 'ios') {
    console.log('[SocialAuth] Apple Sign-In is only available on iOS');
    return null;
  }

  // On iPad, use web-based OAuth to avoid Settings redirect issues
  if (isOnIPad) {
    console.log('[SocialAuth] iPad detected - using web-based Apple OAuth');
    return signInWithAppleOAuth();
  }

  // On iPhone, use native Apple Sign-In
  try {
    // Check if Apple Sign-In is available on this device
    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      console.log('[SocialAuth] Apple Sign-In is not available on this device');
      return null;
    }

    console.log('[SocialAuth] Starting native Apple Sign-In...');

    const result = await performAppleSignIn();
    return result;
  } catch (error: any) {
    // Handle user cancellation
    if (error.code === 'ERR_REQUEST_CANCELED' || error.code === 'ERR_CANCELED') {
      console.log('[SocialAuth] User cancelled Apple Sign-In');
      return null;
    }

    // Handle Apple Sign-In not available
    if (error.code === 'ERR_APPLE_AUTHENTICATION_UNAVAILABLE') {
      console.log('[SocialAuth] Apple Sign-In unavailable on this device');
      throw new Error('Apple Sign-In is not available on this device. Please try another login method.');
    }

    // Handle credential errors (expired, revoked, etc.)
    if (error.code === 'ERR_APPLE_AUTHENTICATION_CREDENTIAL') {
      console.log('[SocialAuth] Apple credential error');
      throw new Error('Apple Sign-In credential error. Please try again.');
    }

    // Handle network/server errors
    if (error.message?.includes('network') || error.message?.includes('timeout')) {
      console.log('[SocialAuth] Network error during Apple Sign-In');
      throw new Error('Network error. Please check your connection and try again.');
    }

    console.error('[SocialAuth] Apple Sign-In failed:', error);
    throw new Error(error.message || 'Apple Sign-In failed. Please try again.');
  }
};

/**
 * Get the current user's auth provider from session
 */
export const getAuthProvider = async (): Promise<SocialProvider | 'email' | null> => {
  if (!supabase) return null;

  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) return null;

    // Check the app_metadata for provider info
    const provider = session.user.app_metadata?.provider;

    if (provider === 'google' || provider === 'kakao' || provider === 'apple') {
      return provider;
    }

    return 'email';
  } catch (error) {
    console.error('Error getting auth provider:', error);
    return null;
  }
};

/**
 * Sign out the current user
 */
export const signOut = async () => {
  if (!supabase) return;

  try {
    // Get current user ID before signing out to remove push token
    const { data: { user } } = await supabase.auth.getUser();

    if (user?.id) {
      // Remove push token from database to prevent notifications after logout
      await removePushToken(user.id);
      console.log('[SocialAuth] Push token removed for user:', user.id);
    }

    // Cancel all scheduled local notifications
    await cancelAllScheduledNotifications();
    console.log('[SocialAuth] Scheduled notifications cancelled');

    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error);
      throw error;
    }
    console.log('[SocialAuth] User signed out successfully');
  } catch (error) {
    console.error('Sign out failed:', error);
    throw error;
  }
};

/**
 * Get the current Supabase session
 */
export const getSession = async () => {
  if (!supabase) return null;

  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.error('Error getting session:', error);
      return null;
    }
    return session;
  } catch (error) {
    console.error('Error getting session:', error);
    return null;
  }
};

/**
 * Listen for auth state changes
 */
export const onAuthStateChange = (callback: (event: string, session: any) => void) => {
  if (!supabase) return { data: { subscription: null } };

  return supabase.auth.onAuthStateChange((event, session) => {
    console.log('[SocialAuth] Auth state changed:', event);
    callback(event, session);
  });
};

/**
 * Handle deep linking for OAuth callback
 */
export const handleDeepLink = async (url: string) => {
  if (url.includes('auth/callback')) {
    console.log('[SocialAuth] Handling OAuth callback deep link');
    return createSessionFromUrl(url);
  }
  return null;
};

export default {
  signInWithGoogle,
  signInWithKakao,
  signInWithApple,
  signInWithProvider,
  signOut,
  getSession,
  getAuthProvider,
  onAuthStateChange,
  handleDeepLink,
  createSessionFromUrl,
};
