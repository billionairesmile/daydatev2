import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import { Image } from 'react-native';
import { useCoupleSyncStore } from '@/stores/coupleSyncStore';

interface BackgroundContextType {
  backgroundImage: any;
  setBackgroundImage: (image: any) => void;
  resetToDefault: () => void;
  isLoaded: boolean;
}

// Default background image
const DEFAULT_BACKGROUND = require('@/assets/images/backgroundimage.png');
const BACKGROUND_STORAGE_KEY = '@daydate_background_image';

const BackgroundContext = createContext<BackgroundContextType | undefined>(undefined);

export function BackgroundProvider({ children }: { children: ReactNode }) {
  const [backgroundImage, setBackgroundImageState] = useState<any>(DEFAULT_BACKGROUND);
  const [isLoaded, setIsLoaded] = useState(false);

  // Get sync store values and actions
  const {
    isInitialized: isSyncInitialized,
    backgroundImageUrl: syncedBackgroundUrl,
    updateBackgroundImage: syncBackgroundImage,
  } = useCoupleSyncStore();

  // Helper to check if URL is a valid remote URL (not local file://)
  const isValidRemoteUrl = (url: string | null | undefined): boolean => {
    if (!url || typeof url !== 'string' || url.trim() === '') return false;
    return url.startsWith('http://') || url.startsWith('https://');
  };

  // Preload default background image and check for saved/synced backgrounds
  useEffect(() => {
    const preloadImages = async () => {
      try {
        // Always preload default background first for instant display
        const asset = Asset.fromModule(DEFAULT_BACKGROUND);
        await asset.downloadAsync();

        // First priority: Check for synced background from partner (only remote URLs)
        if (isSyncInitialized && isValidRemoteUrl(syncedBackgroundUrl)) {
          try {
            await Image.prefetch(syncedBackgroundUrl!);
            setBackgroundImageState({ uri: syncedBackgroundUrl });
            // Also save to local storage as fallback
            await AsyncStorage.setItem(BACKGROUND_STORAGE_KEY, syncedBackgroundUrl!);
          } catch {
            console.warn('Failed to load synced background, falling back to local');
          }
        } else {
          // Fallback: Check for locally saved custom background
          const savedBackground = await AsyncStorage.getItem(BACKGROUND_STORAGE_KEY);

          if (savedBackground && isValidRemoteUrl(savedBackground)) {
            try {
              await Image.prefetch(savedBackground);
              setBackgroundImageState({ uri: savedBackground });
            } catch {
              console.warn('Failed to load saved background');
            }
          }
        }

        setIsLoaded(true);
      } catch (error) {
        console.error('Error preloading background images:', error);
        setIsLoaded(true);
      }
    };

    preloadImages();
  }, [isSyncInitialized, syncedBackgroundUrl]);

  // Listen for synced background updates from partner
  useEffect(() => {
    if (!isSyncInitialized) return;

    // If there's a valid synced background URL that's different from current
    if (isValidRemoteUrl(syncedBackgroundUrl)) {
      const currentUri = backgroundImage?.uri;
      if (currentUri !== syncedBackgroundUrl) {
        // Partner changed the background - update ours
        const updateFromSync = async () => {
          try {
            await Image.prefetch(syncedBackgroundUrl!);
            setBackgroundImageState({ uri: syncedBackgroundUrl });
            await AsyncStorage.setItem(BACKGROUND_STORAGE_KEY, syncedBackgroundUrl!);
          } catch (error) {
            console.error('Error loading synced background:', error);
            // Don't crash - just keep current background
          }
        };
        updateFromSync();
      }
    } else if (syncedBackgroundUrl === null && backgroundImage?.uri) {
      // Partner reset to default - reset ours too
      setBackgroundImageState(DEFAULT_BACKGROUND);
      AsyncStorage.removeItem(BACKGROUND_STORAGE_KEY);
    }
  }, [isSyncInitialized, syncedBackgroundUrl, backgroundImage?.uri]);

  const setBackgroundImage = useCallback(async (image: any) => {
    try {
      console.log('[Background] setBackgroundImage called:', { uri: image?.uri, isSyncInitialized });
      setBackgroundImageState(image);

      // Save custom background URI to AsyncStorage
      if (image?.uri) {
        await AsyncStorage.setItem(BACKGROUND_STORAGE_KEY, image.uri);
        // Preload the new image
        await Image.prefetch(image.uri);

        // Sync to partner via coupleSyncStore (only remote URLs)
        if (isSyncInitialized && isValidRemoteUrl(image.uri)) {
          console.log('[Background] Syncing to partner:', image.uri);
          await syncBackgroundImage(image.uri);
        } else {
          console.log('[Background] Not syncing - local file or not initialized');
        }
      }
    } catch (error) {
      console.error('Error saving background image:', error);
    }
  }, [isSyncInitialized, syncBackgroundImage]);

  const resetToDefault = useCallback(async () => {
    try {
      setBackgroundImageState(DEFAULT_BACKGROUND);
      await AsyncStorage.removeItem(BACKGROUND_STORAGE_KEY);

      // Sync reset to partner
      if (isSyncInitialized) {
        await syncBackgroundImage(null);
      }
    } catch (error) {
      console.error('Error resetting background:', error);
    }
  }, [isSyncInitialized, syncBackgroundImage]);

  return (
    <BackgroundContext.Provider value={{
      backgroundImage,
      setBackgroundImage,
      resetToDefault,
      isLoaded
    }}>
      {children}
    </BackgroundContext.Provider>
  );
}

export function useBackground() {
  const context = useContext(BackgroundContext);
  if (context === undefined) {
    throw new Error('useBackground must be used within a BackgroundProvider');
  }
  return context;
}
