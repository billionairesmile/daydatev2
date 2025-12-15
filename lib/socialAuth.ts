import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
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
 * Create a Supabase session from the OAuth callback URL
 */
export const createSessionFromUrl = async (url: string) => {
  if (!supabase) {
    console.error('Supabase client not initialized');
    return null;
  }

  try {
    const { params, errorCode } = QueryParams.getQueryParams(url);

    if (errorCode) {
      console.error('OAuth error code:', errorCode);
      throw new Error(errorCode);
    }

    const { access_token, refresh_token } = params;

    if (!access_token) {
      console.log('No access token in URL params');
      return null;
    }

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
  if (isDemoMode || !supabase) {
    console.log('Demo mode - social login not available');
    return null;
  }

  try {
    console.log(`[SocialAuth] Starting ${provider} sign in...`);
    console.log(`[SocialAuth] Redirect URL: ${redirectTo}`);

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

    if (error) {
      console.error(`[SocialAuth] ${provider} OAuth error:`, error);
      throw error;
    }

    if (!data?.url) {
      console.error(`[SocialAuth] No auth URL returned for ${provider}`);
      return null;
    }

    console.log(`[SocialAuth] Opening auth URL for ${provider}`);

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
