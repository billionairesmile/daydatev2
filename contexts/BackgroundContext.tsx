import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Asset } from 'expo-asset';
import { Image } from 'react-native';

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

  // Preload default background image
  useEffect(() => {
    const preloadImages = async () => {
      try {
        // Always preload default background first for instant display
        const asset = Asset.fromModule(DEFAULT_BACKGROUND);
        await asset.downloadAsync();

        // Check for saved custom background
        const savedBackground = await AsyncStorage.getItem(BACKGROUND_STORAGE_KEY);

        if (savedBackground) {
          const uri = savedBackground;
          // Preload custom image and set it
          await Image.prefetch(uri);
          setBackgroundImageState({ uri });
        }

        setIsLoaded(true);
      } catch (error) {
        console.error('Error preloading background images:', error);
        setIsLoaded(true);
      }
    };

    preloadImages();
  }, []);

  const setBackgroundImage = async (image: any) => {
    try {
      setBackgroundImageState(image);

      // Save custom background URI to AsyncStorage
      if (image?.uri) {
        await AsyncStorage.setItem(BACKGROUND_STORAGE_KEY, image.uri);
        // Preload the new image
        await Image.prefetch(image.uri);
      }
    } catch (error) {
      console.error('Error saving background image:', error);
    }
  };

  const resetToDefault = async () => {
    try {
      setBackgroundImageState(DEFAULT_BACKGROUND);
      await AsyncStorage.removeItem(BACKGROUND_STORAGE_KEY);
    } catch (error) {
      console.error('Error resetting background:', error);
    }
  };

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
