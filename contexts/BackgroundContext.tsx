import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import { Image as ExpoImage } from 'expo-image';
import { useCoupleSyncStore } from '@/stores/coupleSyncStore';
import { useMemoryStore, SAMPLE_MEMORIES } from '@/stores/memoryStore';

interface BackgroundContextType {
  backgroundImage: any;
  setBackgroundImage: (image: any, skipPrefetch?: boolean) => Promise<void>;
  resetToDefault: () => void;
  isLoaded: boolean;
  prefetchImages: (urls: string[]) => Promise<void>;
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
    coupleAlbums,
    sharedMissions,
    allMissionProgress,
  } = useCoupleSyncStore();

  // Get memories for prefetching
  const { memories } = useMemoryStore();

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
          // Set state immediately for instant display (expo-image handles caching)
          setBackgroundImageState({ uri: syncedBackgroundUrl });
          // Prefetch in background (non-blocking)
          ExpoImage.prefetch(syncedBackgroundUrl!).catch(() => {
            console.warn('Failed to prefetch synced background');
          });
          // Also save to local storage as fallback (non-blocking)
          AsyncStorage.setItem(BACKGROUND_STORAGE_KEY, syncedBackgroundUrl!).catch(console.error);
        } else {
          // Fallback: Check for locally saved custom background
          const savedBackground = await AsyncStorage.getItem(BACKGROUND_STORAGE_KEY);

          if (savedBackground && isValidRemoteUrl(savedBackground)) {
            // Set state immediately (expo-image handles caching)
            setBackgroundImageState({ uri: savedBackground });
            // Prefetch in background (non-blocking)
            ExpoImage.prefetch(savedBackground).catch(() => {
              console.warn('Failed to prefetch saved background');
            });
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

  // Prefetch all important images after initial load
  useEffect(() => {
    if (!isLoaded) return;

    const prefetchAppImages = async () => {
      const imagesToPrefetch: string[] = [];

      // 1. Album cover photos (for memories tab - custom albums)
      if (coupleAlbums && coupleAlbums.length > 0) {
        coupleAlbums.forEach(album => {
          if (album.cover_photo_url && isValidRemoteUrl(album.cover_photo_url)) {
            imagesToPrefetch.push(album.cover_photo_url);
          }
        });
      }

      // 2. Mission background images (for mission cards)
      if (sharedMissions && sharedMissions.length > 0) {
        sharedMissions.forEach(mission => {
          if (mission.imageUrl && isValidRemoteUrl(mission.imageUrl)) {
            // Add optimized version for card display
            imagesToPrefetch.push(`${mission.imageUrl}?w=800&h=1000&fit=crop`);
          }
        });
      }

      // 3. Mission progress photos (for calendar tab - completed mission photos)
      if (allMissionProgress && allMissionProgress.length > 0) {
        allMissionProgress.forEach(progress => {
          if (progress.photo_url && isValidRemoteUrl(progress.photo_url)) {
            imagesToPrefetch.push(progress.photo_url);
          }
        });
      }

      // 4. Memory photos (for memories tab - monthly albums)
      const allMemories = [...memories, ...SAMPLE_MEMORIES];
      allMemories.forEach(memory => {
        if (memory.photoUrl && isValidRemoteUrl(memory.photoUrl)) {
          imagesToPrefetch.push(memory.photoUrl);
        }
      });

      // Prefetch all images in background (limit to first 30 for performance)
      if (imagesToPrefetch.length > 0) {
        // Remove duplicates
        const uniqueUrls = [...new Set(imagesToPrefetch)];
        const limitedUrls = uniqueUrls.slice(0, 30);
        console.log('[Background] Prefetching', limitedUrls.length, 'app images');

        // Non-blocking prefetch
        Promise.allSettled(
          limitedUrls.map(url => ExpoImage.prefetch(url))
        ).then(() => {
          console.log('[Background] App images prefetch complete');
        }).catch(() => {
          // Ignore prefetch errors
        });
      }
    };

    // Delay prefetching slightly to not block main thread during splash
    const timer = setTimeout(prefetchAppImages, 500);
    return () => clearTimeout(timer);
  }, [isLoaded, coupleAlbums, sharedMissions, allMissionProgress, memories]);

  // Listen for synced background updates from partner
  useEffect(() => {
    if (!isSyncInitialized) return;

    // If there's a valid synced background URL that's different from current
    if (isValidRemoteUrl(syncedBackgroundUrl)) {
      const currentUri = backgroundImage?.uri;
      if (currentUri !== syncedBackgroundUrl) {
        // Partner changed the background - update ours IMMEDIATELY (optimistic)
        setBackgroundImageState({ uri: syncedBackgroundUrl });
        // Prefetch in background (non-blocking)
        ExpoImage.prefetch(syncedBackgroundUrl!).catch((error) => {
          console.error('Error prefetching synced background:', error);
        });
        // Save to local storage (non-blocking)
        AsyncStorage.setItem(BACKGROUND_STORAGE_KEY, syncedBackgroundUrl!).catch(console.error);
      }
    } else if (syncedBackgroundUrl === null && backgroundImage?.uri) {
      // Partner reset to default - reset ours too
      setBackgroundImageState(DEFAULT_BACKGROUND);
      AsyncStorage.removeItem(BACKGROUND_STORAGE_KEY);
    }
  }, [isSyncInitialized, syncedBackgroundUrl, backgroundImage?.uri]);

  const setBackgroundImage = useCallback(async (image: any, skipPrefetch: boolean = false) => {
    try {
      console.log('[Background] setBackgroundImage called:', { uri: image?.uri, isSyncInitialized, skipPrefetch });

      // OPTIMISTIC UPDATE: Set state immediately for instant UI response
      // expo-image handles caching automatically, so prefetching is not blocking
      setBackgroundImageState(image);

      // Pre-cache with expo-image in the background (non-blocking)
      if (image?.uri && !skipPrefetch) {
        ExpoImage.prefetch(image.uri).catch((prefetchError) => {
          console.warn('[Background] Prefetch failed:', prefetchError);
        });
      }

      // Save custom background URI to AsyncStorage (non-blocking)
      if (image?.uri) {
        AsyncStorage.setItem(BACKGROUND_STORAGE_KEY, image.uri).catch(console.error);

        // Sync to partner via coupleSyncStore (only remote URLs, non-blocking)
        if (isSyncInitialized && isValidRemoteUrl(image.uri)) {
          console.log('[Background] Syncing to partner:', image.uri);
          syncBackgroundImage(image.uri).catch(console.error);
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

  // Utility function to prefetch multiple images at once (for splash screen)
  const prefetchImages = useCallback(async (urls: string[]) => {
    if (!urls || urls.length === 0) return;

    const validUrls = urls.filter(url => url && typeof url === 'string');
    console.log('[Background] Prefetching', validUrls.length, 'images');

    // Use expo-image's prefetch for all URLs in parallel
    await Promise.allSettled(
      validUrls.map(url => ExpoImage.prefetch(url))
    );

    console.log('[Background] Prefetch complete');
  }, []);

  return (
    <BackgroundContext.Provider value={{
      backgroundImage,
      setBackgroundImage,
      resetToDefault,
      isLoaded,
      prefetchImages,
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
