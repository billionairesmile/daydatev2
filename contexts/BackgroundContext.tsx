import React, { createContext, useContext, useState, ReactNode } from 'react';

interface BackgroundContextType {
  backgroundImage: any;
  setBackgroundImage: (image: any) => void;
  resetToDefault: () => void;
}

// Default background image
const DEFAULT_BACKGROUND = require('@/assets/images/backgroundimage.png');

const BackgroundContext = createContext<BackgroundContextType | undefined>(undefined);

export function BackgroundProvider({ children }: { children: ReactNode }) {
  const [backgroundImage, setBackgroundImage] = useState<any>(DEFAULT_BACKGROUND);

  const resetToDefault = () => {
    setBackgroundImage(DEFAULT_BACKGROUND);
  };

  return (
    <BackgroundContext.Provider value={{
      backgroundImage,
      setBackgroundImage,
      resetToDefault
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
