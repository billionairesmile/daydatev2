import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { supabase, isDemoMode } from './supabase';

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

export type SocialProvider = 'google' | 'kakao';

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
 * Get the current user's auth provider from session
 */
export const getAuthProvider = async (): Promise<SocialProvider | 'email' | null> => {
  if (!supabase) return null;

  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session?.user) return null;

    // Check the app_metadata for provider info
    const provider = session.user.app_metadata?.provider;

    if (provider === 'google' || provider === 'kakao') {
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
  signInWithProvider,
  signOut,
  getSession,
  getAuthProvider,
  onAuthStateChange,
  handleDeepLink,
  createSessionFromUrl,
};
