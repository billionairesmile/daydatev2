import React from 'react';
import Svg, { Path, Rect, G } from 'react-native-svg';

interface LogoProps {
  size?: number;
}

// Google G Logo - Official colors
export function GoogleLogo({ size = 18 }: LogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </Svg>
  );
}

// Kakao Talk Logo - speech bubble only
export function KakaoLogo({ size = 22 }: LogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512">
      {/* Yellow background with rounded corners */}
      <Rect width="512" height="512" rx="70" fill="#FEE500" />
      {/* Speech bubble with tail - shifted slightly left */}
      <Path
        d="M256 93c-93.5 0-169.3 62.3-169.3 139.2 0 49.6 32.9 93.1 82.5 117.8l-16.9 62.4c-1.5 5.5 4.8 10.1 9.5 6.9l74.2-49.5c6.6.9 13.3 1.4 20 1.4 93.5 0 169.3-62.3 169.3-139.2S349.5 93 256 93z"
        fill="#3C1E1E"
        transform="translate(-15, 0)"
      />
    </Svg>
  );
}
