import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  ScrollView,
  Modal,
  Animated,
  PanResponder,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Alert,
  NativeSyntheticEvent,
  NativeScrollEvent,
  LayoutChangeEvent,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import { Paths, File as ExpoFile } from 'expo-file-system';
import { ChevronDown, MapPin, Clock, X, Plus, ImageIcon, RefreshCw, BookHeart, MoreHorizontal, Edit2, Trash2, Check, Download } from 'lucide-react-native';
import { useFonts } from 'expo-font';
import { Jua_400Regular } from '@expo-google-fonts/jua';
import ReanimatedModule, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useTranslation } from 'react-i18next';

import { COLORS, SPACING } from '@/constants/design';
import { useMemoryStore, SAMPLE_MEMORIES } from '@/stores/memoryStore';
import { useAuthStore } from '@/stores/authStore';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { useCoupleSyncStore, CoupleAlbum, AlbumPhoto } from '@/stores/coupleSyncStore';
import { useBackground } from '@/contexts';
import { isDemoMode, db } from '@/lib/supabase';
import type { CompletedMission } from '@/types';
import { RansomText } from '@/components/ransom';

// Font style type
type FontStyleType = 'basic' | 'ransom' | null;

// Album type
interface Album {
  id: string;
  name: string;
  coverPhoto: string | null;
  createdAt: Date;
  namePosition: { x: number; y: number }; // Position for draggable text overlay
  textScale: number; // Overall text scale (0.5 - 1.5)
  fontStyle: FontStyleType; // 'basic' for Jua, 'ransom' for image-based ransom style
  ransomSeed?: number; // Seed for consistent ransom text image selection
}

const { width, height } = Dimensions.get('window');

// Calculate scale ratio between modal preview and album card
// Modal: maxWidth 360 - 48 padding = 312px modal content width (or device width - 48 if smaller)
// Album card: 140px fixed width
// Album detail: 180px fixed width
const MODAL_PREVIEW_WIDTH = Math.min(width, 360) - 48;
const ALBUM_CARD_WIDTH = 140; // Fixed width 140px
const ALBUM_DETAIL_WIDTH = 180; // Fixed width for album detail modal
const ALBUM_SCALE_RATIO = ALBUM_CARD_WIDTH / MODAL_PREVIEW_WIDTH;
const ALBUM_DETAIL_SCALE_RATIO = ALBUM_DETAIL_WIDTH / MODAL_PREVIEW_WIDTH;

type MemoryType = typeof SAMPLE_MEMORIES[0];

interface MonthData {
  year: string;
  month: string;
  monthName: string;
  missions: MemoryType[];
}

export default function MemoriesScreen() {
  const { t, i18n } = useTranslation();
  const { backgroundImage } = useBackground();
  const { memories, deleteMemory } = useMemoryStore();
  const { user, partner } = useAuthStore();

  // Album sync store
  const {
    isInitialized: isSyncInitialized,
    coupleId,
    coupleAlbums: syncedAlbums,
    albumPhotosMap: syncedAlbumPhotosMap,
    createAlbum: syncCreateAlbum,
    updateAlbum: syncUpdateAlbum,
    deleteAlbum: syncDeleteAlbum,
    addPhotoToAlbum: syncAddPhotoToAlbum,
    removePhotoFromAlbum: syncRemovePhotoFromAlbum,
  } = useCoupleSyncStore();

  const [selectedMonth, setSelectedMonth] = useState<MonthData | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<MemoryType | null>(null);
  const [showYearPicker, setShowYearPicker] = useState<string | null>(null);

  // Load fonts
  const [fontsLoaded] = useFonts({
    Jua_400Regular,
  });

  // Local albums state (for demo mode fallback)
  const [localAlbums, setLocalAlbums] = useState<Album[]>([]);
  const [localAlbumPhotos, setLocalAlbumPhotos] = useState<{ [albumId: string]: MemoryType[] }>({});

  // Combine store memories with SAMPLE_MEMORIES (store memories take priority)
  // This needs to be defined early for album photo lookups
  const allMemories = React.useMemo(() => {
    // Get IDs of memories from store that are NOT from SAMPLE_MEMORIES
    const storeOnlyMemories = memories.filter(
      (m) => !SAMPLE_MEMORIES.some((s) => s.id === m.id)
    );
    // Combine: store-only memories first, then SAMPLE_MEMORIES
    return [...storeOnlyMemories, ...SAMPLE_MEMORIES];
  }, [memories]);

  // Convert synced CoupleAlbum to local Album format
  const convertSyncedAlbumToLocal = useCallback((syncedAlbum: CoupleAlbum): Album => ({
    id: syncedAlbum.id,
    name: syncedAlbum.name,
    coverPhoto: syncedAlbum.cover_photo_url,
    createdAt: new Date(syncedAlbum.created_at),
    namePosition: syncedAlbum.name_position || { x: 30, y: 16 },
    textScale: syncedAlbum.text_scale || 1.0,
    fontStyle: (syncedAlbum.font_style as FontStyleType) || 'basic',
    ransomSeed: syncedAlbum.ransom_seed ?? undefined,
  }), []);

  // Use synced albums if available, otherwise fallback to local
  const albums: Album[] = React.useMemo(() => {
    if (isSyncInitialized && !isDemoMode) {
      return syncedAlbums.map(convertSyncedAlbumToLocal);
    }
    return localAlbums;
  }, [isSyncInitialized, syncedAlbums, localAlbums, convertSyncedAlbumToLocal]);

  // Use synced album photos if available, otherwise fallback to local
  // Uses allMemories to ensure both store and sample memories are included
  const albumPhotos: { [albumId: string]: MemoryType[] } = React.useMemo(() => {
    if (isSyncInitialized && !isDemoMode) {
      const result: { [albumId: string]: MemoryType[] } = {};
      syncedAlbums.forEach((album: CoupleAlbum) => {
        const photoRefs = syncedAlbumPhotosMap[album.id] || [];
        result[album.id] = photoRefs
          .map((ref: AlbumPhoto) => allMemories.find(m => m.id === ref.memory_id))
          .filter((m): m is MemoryType => m !== undefined);
      });
      return result;
    }
    return localAlbumPhotos;
  }, [isSyncInitialized, syncedAlbums, syncedAlbumPhotosMap, localAlbumPhotos, allMemories]);

  // Prefetch album cover photos for instant display
  useEffect(() => {
    albums.forEach(album => {
      if (album.coverPhoto) {
        ExpoImage.prefetch(album.coverPhoto).catch(() => {
          // Ignore prefetch errors silently
        });
      }
    });
  }, [albums]);

  // Prefetch album photos for instant display when opening albums
  useEffect(() => {
    Object.values(albumPhotos).forEach(photos => {
      photos.forEach(photo => {
        if (photo.photoUrl) {
          ExpoImage.prefetch(photo.photoUrl).catch(() => {});
        }
      });
    });
  }, [albumPhotos]);

  // Album creation states
  const [showAlbumModal, setShowAlbumModal] = useState(false);
  const [albumName, setAlbumName] = useState('');
  const [albumCoverPhoto, setAlbumCoverPhoto] = useState<string | null>(null);
  const [albumStep, setAlbumStep] = useState<'fontStyle' | 'name' | 'cover'>('fontStyle'); // Start with font selection
  const [namePosition, setNamePosition] = useState({ x: 30, y: 16 }); // Default position (past 24px book spine)
  const [textScale, setTextScale] = useState(1.0); // Overall text scale (0.5 - 1.5)
  const [fontStyle, setFontStyle] = useState<FontStyleType>(null); // No style selected by default
  const [textColor, setTextColor] = useState<'white' | 'black'>('white'); // Text color for basic font
  const [ransomSeed, setRansomSeed] = useState<number>(() => Math.floor(Math.random() * 1000000)); // Seed for ransom text

  // Album detail modal states
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [showAlbumDetailModal, setShowAlbumDetailModal] = useState(false);
  const [showAlbumMenu, setShowAlbumMenu] = useState(false);

  // Album photo selection states
  const [isSelectingAlbumPhotos, setIsSelectingAlbumPhotos] = useState(false);
  const [selectedAlbumPhotoIndices, setSelectedAlbumPhotoIndices] = useState<Set<number>>(new Set());
  const [selectedAlbumPhoto, setSelectedAlbumPhoto] = useState<MemoryType | null>(null);
  const [showMissionPhotosPicker, setShowMissionPhotosPicker] = useState(false);
  const [showCoverPhotoPicker, setShowCoverPhotoPicker] = useState(false);
  const [selectedMissionPhotos, setSelectedMissionPhotos] = useState<Set<string>>(new Set());

  // Cover edit modal states
  const [showCoverEditModal, setShowCoverEditModal] = useState(false);
  const [editAlbumName, setEditAlbumName] = useState('');
  const [editAlbumStep, setEditAlbumStep] = useState<'fontStyle' | 'name' | 'cover'>('fontStyle');
  const [editFontStyle, setEditFontStyle] = useState<FontStyleType>(null);
  const [editRansomSeed, setEditRansomSeed] = useState<number>(() => Math.floor(Math.random() * 1000000));
  const [editCoverPhoto, setEditCoverPhoto] = useState<string | null>(null);
  const [editTextPosition, setEditTextPosition] = useState({ x: 30, y: 16 });
  const [editTextScale, setEditTextScale] = useState(1);

  // Refs to keep state values fresh in PanResponder callbacks
  const albumNameRef = useRef(albumName);
  const fontStyleRef = useRef(fontStyle);
  const textScaleRef = useRef(textScale);
  const editAlbumNameRef = useRef(editAlbumName);
  const editFontStyleRef = useRef(editFontStyle);
  const editTextScaleRef = useRef(editTextScale);

  // Keep refs in sync with state
  useEffect(() => { albumNameRef.current = albumName; }, [albumName]);
  useEffect(() => { fontStyleRef.current = fontStyle; }, [fontStyle]);
  useEffect(() => { textScaleRef.current = textScale; }, [textScale]);
  useEffect(() => { editAlbumNameRef.current = editAlbumName; }, [editAlbumName]);
  useEffect(() => { editFontStyleRef.current = editFontStyle; }, [editFontStyle]);
  useEffect(() => { editTextScaleRef.current = editTextScale; }, [editTextScale]);

  // Animated values for picker modals
  const missionPickerSlideAnim = useRef(new Animated.Value(height)).current;
  const coverPickerSlideAnim = useRef(new Animated.Value(height)).current;

  // Animated values for album creation modal
  const albumModalScaleAnim = useRef(new Animated.Value(0.9)).current;
  const albumModalOpacityAnim = useRef(new Animated.Value(0)).current;

  // Animated values for step transitions (fade effect)
  const stepOpacityAnim = useRef(new Animated.Value(1)).current;

  // Animated position for dragging
  const panPosition = useRef(new Animated.ValueXY({ x: 30, y: 16 })).current;
  const panOffset = useRef({ x: 0, y: 0 });

  // Actual container bounds measured via onLayout (ref to work with PanResponder)
  const containerBounds = useRef({ width: MODAL_PREVIEW_WIDTH, height: MODAL_PREVIEW_WIDTH * 4 / 3 });

  // Handler to measure actual container dimensions
  const handleContainerLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    containerBounds.current = { width, height };
  };

  // Calculate estimated text width based on character count and style
  const getEstimatedTextWidth = (text: string, isRansom: boolean, scale: number = 1) => {
    const charCount = text.replace(/\s/g, '').length;
    const spaceCount = (text.match(/\s/g) || []).length;
    if (charCount === 0) return 16;
    // Ransom style: characters overlap due to negative spacing (-4px), so effective width is ~24px per char
    // Basic style: each char ~16px
    const charWidth = isRansom ? 24 : 16;
    const spaceWidth = isRansom ? 8 : 6;
    const baseWidth = (charCount * charWidth + spaceCount * spaceWidth) * scale;
    return baseWidth + 12; // Small margin for safety
  };

  // Helper function to wrap text for RansomText preview (prevents overflow)
  // 띄어쓰기 제거하고 8글자마다 줄바꿈
  const wrapLongWordsForRansom = (text: string, maxChars: number = 8): string => {
    // 띄어쓰기 제거
    const textWithoutSpaces = text.replace(/\s/g, '');

    // 8글자 이하면 그대로 반환
    if (textWithoutSpaces.length <= maxChars) return textWithoutSpaces;

    // 8글자씩 분할하여 공백으로 연결 (RansomText가 자동 줄바꿈)
    const chunks = [];
    for (let i = 0; i < textWithoutSpaces.length; i += maxChars) {
      chunks.push(textWithoutSpaces.slice(i, i + maxChars));
    }
    return chunks.join(' ');
  };

  // PanResponder for dragging text position (constrained within photo bounds)
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        panOffset.current = {
          x: (panPosition.x as any)._value,
          y: (panPosition.y as any)._value,
        };
      },
      onPanResponderMove: (_, gestureState) => {
        // Calculate new position
        let newX = panOffset.current.x + gestureState.dx;
        let newY = panOffset.current.y + gestureState.dy;

        // Use ACTUAL measured container dimensions
        const actualWidth = containerBounds.current.width;
        const actualHeight = containerBounds.current.height;

        // Simple bounds - just use fixed margins, let text overflow naturally
        const BOOK_SPINE_WIDTH = 24;
        const SPINE_MARGIN = 4;
        const RIGHT_MARGIN = 16;
        const TEXT_HEIGHT_BUFFER = 32;
        const TOP_PADDING = 8;

        const minX = BOOK_SPINE_WIDTH + SPINE_MARGIN;
        const maxX = actualWidth - RIGHT_MARGIN;
        const minY = TOP_PADDING;
        const maxY = actualHeight - TEXT_HEIGHT_BUFFER;

        newX = Math.max(minX, Math.min(maxX, newX));
        newY = Math.max(minY, Math.min(maxY, newY));

        panPosition.setValue({ x: newX, y: newY });
      },
      onPanResponderRelease: () => {
        // Update the position state
        setNamePosition({
          x: (panPosition.x as any)._value,
          y: (panPosition.y as any)._value,
        });
      },
    })
  ).current;

  // Animation for month modal
  const slideAnim = useRef(new Animated.Value(height)).current;
  const backdropOpacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (selectedMonth) {
      // Slide up + backdrop fade in animation
      Animated.parallel([
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.timing(backdropOpacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [selectedMonth]);

  // Close month modal with slide down + backdrop fade out animation
  const closeMonthModal = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: height,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setSelectedMonth(null);
      setSelectedPhoto(null);
      // Reset animations for next open
      slideAnim.setValue(height);
      backdropOpacityAnim.setValue(0);
    });
  };

  // Animation for mission photos picker
  useEffect(() => {
    if (showMissionPhotosPicker) {
      Animated.spring(missionPickerSlideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    }
  }, [showMissionPhotosPicker]);

  // Close mission picker with slide down animation
  const closeMissionPicker = () => {
    Animated.timing(missionPickerSlideAnim, {
      toValue: height,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShowMissionPhotosPicker(false);
      setSelectedMissionPhotos(new Set());
    });
  };

  // Animation for cover photo picker
  useEffect(() => {
    if (showCoverPhotoPicker) {
      // Reset to bottom first, then animate up
      coverPickerSlideAnim.setValue(height);
      Animated.spring(coverPickerSlideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    }
  }, [showCoverPhotoPicker]);

  // Close cover photo picker with animation
  const closeCoverPhotoPicker = () => {
    Animated.timing(coverPickerSlideAnim, {
      toValue: height,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setShowCoverPhotoPicker(false);
    });
  };

  // Select cover photo and close picker
  const handleSelectCoverPhoto = (photoUrl: string) => {
    console.log('[DEBUG] Selected cover photo:', photoUrl);
    setAlbumCoverPhoto(photoUrl);
    closeCoverPhotoPicker();
  };

  // Animation for album detail modal (scale + fade + slide)
  const albumDetailScaleAnim = useRef(new Animated.Value(0.92)).current;
  const albumDetailOpacityAnim = useRef(new Animated.Value(0)).current;
  const albumDetailTranslateYAnim = useRef(new Animated.Value(30)).current;

  useEffect(() => {
    if (showAlbumDetailModal) {
      // Scale up + fade in + slide up animation (iOS-like natural feel)
      Animated.parallel([
        Animated.spring(albumDetailScaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.spring(albumDetailOpacityAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
        Animated.spring(albumDetailTranslateYAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 11,
        }),
      ]).start();
    } else {
      // Reset animations
      albumDetailScaleAnim.setValue(0.92);
      albumDetailOpacityAnim.setValue(0);
      albumDetailTranslateYAnim.setValue(30);
    }
  }, [showAlbumDetailModal]);

  // Group missions by year and month
  const groupByYearMonth = (memories: MemoryType[]) => {
    const grouped: {
      [year: string]: { [month: string]: MemoryType[] };
    } = {};

    memories.forEach((memory) => {
      const date = new Date(memory.completedAt);
      const year = date.getFullYear().toString();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');

      if (!grouped[year]) grouped[year] = {};
      if (!grouped[year][month]) grouped[year][month] = [];

      grouped[year][month].push(memory);
    });

    return grouped;
  };

  // Filter only completed missions (both users have written messages)
  const completedMemories = allMemories.filter(
    (memory) => memory.user1Message && memory.user2Message && memory.photoUrl
  );

  const groupedMissions = groupByYearMonth(completedMemories);
  const years = Object.keys(groupedMissions).sort((a, b) => parseInt(b) - parseInt(a));

  // Sync selectedMonth with current groupedMissions when memories change (real-time sync from partner)
  useEffect(() => {
    if (!selectedMonth) return;

    const currentMissions = groupedMissions[selectedMonth.year]?.[selectedMonth.month];

    if (!currentMissions || currentMissions.length === 0) {
      // Month no longer has any photos - close the modal
      console.log('[RealTimeSync] Month has no photos, closing modal');
      setSelectedMonth(null);
      setSelectedPhoto(null);
      return;
    }

    // Check if missions have changed (compare IDs)
    const currentIds = currentMissions.map(m => m.id).join(',');
    const selectedIds = selectedMonth.missions.map(m => m.id).join(',');

    if (currentIds !== selectedIds) {
      console.log('[RealTimeSync] Missions changed, updating selectedMonth');
      console.log('[RealTimeSync] Previous count:', selectedMonth.missions.length, '-> New count:', currentMissions.length);

      setSelectedMonth(prev => prev ? {
        ...prev,
        missions: currentMissions
      } : null);

      // Also update selectedPhoto if it was deleted
      if (selectedPhoto && !currentMissions.some(m => m.id === selectedPhoto.id)) {
        console.log('[RealTimeSync] Selected photo was deleted, clearing selection');
        // The PhotoDetailView useEffect will handle navigation
      }
    }
  }, [completedMemories]); // Only depend on completedMemories to avoid infinite loops

  // Sync custom album PhotoDetailView when albumPhotos change (real-time sync from partner)
  useEffect(() => {
    if (!selectedAlbum || !showAlbumDetailModal) return;

    const currentAlbumPhotos = albumPhotos[selectedAlbum.id] || [];

    // If viewing a photo that was deleted by partner
    if (selectedAlbumPhoto && !currentAlbumPhotos.some(p => p.id === selectedAlbumPhoto.id)) {
      console.log('[RealTimeSync Album] Currently viewed photo was deleted by partner');

      if (currentAlbumPhotos.length === 0) {
        // No photos left in album - only close the photo detail view, keep album modal open
        console.log('[RealTimeSync Album] No photos remaining, closing photo detail view only');
        setSelectedAlbumPhoto(null);
      }
      // If there are other photos, PhotoDetailView will handle navigation automatically
    }
  }, [albumPhotos, selectedAlbum?.id, showAlbumDetailModal, selectedAlbumPhoto]);

  const getMonthName = (monthNumber: string) => {
    const monthNames = t('memories.monthNames', { returnObjects: true }) as string[];
    return monthNames[parseInt(monthNumber) - 1];
  };

  // Update album name (filter to English only for ransom style)
  const handleAlbumNameChange = (text: string) => {
    // Filter to only allow English letters, numbers, and spaces when ransom style is selected
    const filteredText = fontStyle === 'ransom'
      ? text.replace(/[^a-zA-Z0-9\s]/g, '')
      : text;
    setAlbumName(filteredText);
  };

  // Regenerate ransom style with new seed
  const regenerateStyles = () => {
    if (albumName.length > 0 && fontStyle === 'ransom') {
      setRansomSeed(Math.floor(Math.random() * 1000000));
    }
  };

  // Auto-crop image to 3:4 aspect ratio (center crop)
  const autoCropTo3x4 = async (uri: string, imgWidth: number, imgHeight: number): Promise<string> => {
    const targetAspect = 3 / 4; // width / height
    const currentAspect = imgWidth / imgHeight;

    let cropWidth: number;
    let cropHeight: number;
    let originX: number;
    let originY: number;

    if (currentAspect > targetAspect) {
      // Image is wider than 3:4, crop sides
      cropHeight = imgHeight;
      cropWidth = Math.round(imgHeight * targetAspect);
      originX = Math.round((imgWidth - cropWidth) / 2);
      originY = 0;
    } else {
      // Image is taller than 3:4, crop top/bottom
      cropWidth = imgWidth;
      cropHeight = Math.round(imgWidth / targetAspect);
      originX = 0;
      originY = Math.round((imgHeight - cropHeight) / 2);
    }

    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ crop: { originX, originY, width: cropWidth, height: cropHeight } }],
      { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
    );

    return result.uri;
  };

  // Pick cover photo from device photo library
  const handlePickCoverPhoto = async () => {
    // Request permission
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert(t('memories.permission.required'), t('memories.permission.photoAccess'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      try {
        const croppedUri = await autoCropTo3x4(
          asset.uri,
          asset.width || 1000,
          asset.height || 1000
        );
        setAlbumCoverPhoto(croppedUri);
      } catch (error) {
        console.error('Crop error:', error);
        setAlbumCoverPhoto(asset.uri);
      }
    }
  };

  // Pick cover photo for edit modal
  const handlePickEditCoverPhoto = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (permissionResult.granted === false) {
      Alert.alert(t('memories.permission.required'), t('memories.permission.photoAccess'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 1,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      try {
        const croppedUri = await autoCropTo3x4(
          asset.uri,
          asset.width || 1000,
          asset.height || 1000
        );
        setEditCoverPhoto(croppedUri);
      } catch (error) {
        console.error('Crop error:', error);
        setEditCoverPhoto(asset.uri);
      }
    }
  };

  // Create album with closing animation
  const handleCreateAlbum = async () => {
    if (albumName.trim()) {
      let finalCoverPhotoUrl = albumCoverPhoto;

      // If syncing and we have a cover photo, upload it first
      if (isSyncInitialized && !isDemoMode && albumCoverPhoto && coupleId) {
        try {
          console.log('[Album] Uploading cover photo to Supabase Storage...');
          const uploadedUrl = await db.storage.uploadAlbumCover(coupleId, albumCoverPhoto);
          if (uploadedUrl) {
            console.log('[Album] Cover photo uploaded:', uploadedUrl);
            finalCoverPhotoUrl = uploadedUrl;
          } else {
            console.warn('[Album] Cover photo upload failed, using local URI');
          }
        } catch (error) {
          console.error('[Album] Cover photo upload error:', error);
        }
      }

      const newAlbum: Album = {
        id: Date.now().toString(),
        name: albumName.trim(),
        coverPhoto: finalCoverPhotoUrl,
        createdAt: new Date(),
        namePosition: { ...namePosition },
        textScale: textScale,
        fontStyle: fontStyle,
        ransomSeed: ransomSeed, // Save the ransom seed for consistent rendering
      };

      // Sync or local save based on mode
      if (isSyncInitialized && !isDemoMode) {
        try {
          await syncCreateAlbum(
            albumName.trim(),
            finalCoverPhotoUrl,
            { ...namePosition },
            textScale,
            fontStyle || 'basic',
            ransomSeed
          );
        } catch (error) {
          console.error('Error syncing album:', error);
          // Fallback to local if sync fails
          setLocalAlbums([...localAlbums, newAlbum]);
        }
      } else {
        // Demo mode: save locally
        setLocalAlbums([...localAlbums, newAlbum]);
      }

      // Animate out then reset modal state
      Animated.parallel([
        Animated.timing(albumModalScaleAnim, {
          toValue: 0.9,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(albumModalOpacityAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setShowAlbumModal(false);
        setAlbumName('');
        setAlbumCoverPhoto(null);
        setAlbumStep('fontStyle'); // Reset to font selection
        setNamePosition({ x: 30, y: 16 }); // Reset position (past 24px book spine)
        panPosition.setValue({ x: 30, y: 16 }); // Reset animated position
        setTextScale(1.0); // Reset text scale
        setFontStyle(null); // Reset font style - no selection
        setRansomSeed(Math.floor(Math.random() * 1000000)); // Generate new seed for next album
      });
    }
  };

  // Smooth step transition with fade animation
  const transitionToNextStep = (nextStep: 'fontStyle' | 'name' | 'cover') => {
    // Fade out current content
    Animated.timing(stepOpacityAnim, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start(() => {
      // Change step
      setAlbumStep(nextStep);
      // Fade in new content
      Animated.timing(stepOpacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }).start();
    });
  };

  // Open album creation modal with animation
  const openAlbumModal = () => {
    // Reset animation values
    albumModalScaleAnim.setValue(0.9);
    albumModalOpacityAnim.setValue(0);
    stepOpacityAnim.setValue(1);

    setShowAlbumModal(true);
    setAlbumStep('fontStyle'); // Start with font selection
    setAlbumName('');
    setAlbumCoverPhoto(null);
    setNamePosition({ x: 30, y: 16 }); // Reset position (past 24px book spine)
    panPosition.setValue({ x: 30, y: 16 }); // Reset animated position
    setTextScale(1.0); // Reset text scale
    setFontStyle(null); // Reset font style - no selection
    setRansomSeed(Math.floor(Math.random() * 1000000)); // Generate fresh seed

    // Animate in
    Animated.parallel([
      Animated.spring(albumModalScaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 100,
        friction: 12,
      }),
      Animated.timing(albumModalOpacityAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };

  // Close album creation modal with animation
  const closeAlbumModal = () => {
    Animated.parallel([
      Animated.timing(albumModalScaleAnim, {
        toValue: 0.9,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(albumModalOpacityAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setShowAlbumModal(false);
      // Reset state after animation completes
      setAlbumName('');
      setAlbumCoverPhoto(null);
      setAlbumStep('fontStyle');
      setNamePosition({ x: 30, y: 16 });
      panPosition.setValue({ x: 30, y: 16 });
      setTextScale(1.0);
      setFontStyle(null);
    });
  };

  // Close album detail modal with fade-out + scale-down + slide-down animation
  const closeAlbumDetailModal = () => {
    Animated.parallel([
      Animated.spring(albumDetailScaleAnim, {
        toValue: 0.92,
        useNativeDriver: true,
        tension: 65,
        friction: 9,
      }),
      Animated.timing(albumDetailOpacityAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(albumDetailTranslateYAnim, {
        toValue: 30,
        useNativeDriver: true,
        tension: 65,
        friction: 9,
      }),
    ]).start(() => {
      setShowAlbumDetailModal(false);
      setShowAlbumMenu(false);
      setSelectedAlbum(null);
      setIsSelectingAlbumPhotos(false);
      setSelectedAlbumPhotoIndices(new Set());
      setSelectedAlbumPhoto(null);
      setShowMissionPhotosPicker(false);
    });
  };

  // Split text into words for proper wrapping
  const splitIntoWords = (text: string) => {
    const words: { word: string; startIndex: number }[] = [];
    let currentWord = '';
    let startIndex = 0;

    for (let i = 0; i < text.length; i++) {
      if (text[i] === ' ') {
        if (currentWord) {
          words.push({ word: currentWord, startIndex });
          currentWord = '';
        }
        words.push({ word: ' ', startIndex: i }); // Keep space as a separate "word"
      } else {
        if (!currentWord) {
          startIndex = i;
        }
        currentWord += text[i];
      }
    }
    if (currentWord) {
      words.push({ word: currentWord, startIndex });
    }
    return words;
  };

  // Go to next step (cover selection) with slide animation
  const goToNextStep = () => {
    if (albumName.trim()) {
      transitionToNextStep('cover');
    }
  };

  // ====== Cover Edit Modal Functions ======

  // Animated position for edit modal dragging
  const editPanPosition = useRef(new Animated.ValueXY({ x: 30, y: 16 })).current;
  const editPanOffset = useRef({ x: 0, y: 0 });
  const editContainerBounds = useRef({ width: MODAL_PREVIEW_WIDTH, height: MODAL_PREVIEW_WIDTH * 4 / 3 });

  // Handler to measure actual container dimensions for edit modal
  const handleEditContainerLayout = (event: any) => {
    const { width, height } = event.nativeEvent.layout;
    editContainerBounds.current = { width, height };
  };

  // PanResponder for edit modal dragging
  const editPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        editPanOffset.current = {
          x: (editPanPosition.x as any)._value,
          y: (editPanPosition.y as any)._value,
        };
      },
      onPanResponderMove: (_, gestureState) => {
        let newX = editPanOffset.current.x + gestureState.dx;
        let newY = editPanOffset.current.y + gestureState.dy;

        const actualWidth = editContainerBounds.current.width;
        const actualHeight = editContainerBounds.current.height;

        // Simple bounds - just use fixed margins, let text overflow naturally
        const BOOK_SPINE_WIDTH = 24;
        const SPINE_MARGIN = 4;
        const RIGHT_MARGIN = 16;
        const TEXT_HEIGHT_BUFFER = 32;

        const minX = BOOK_SPINE_WIDTH + SPINE_MARGIN;
        const maxX = actualWidth - RIGHT_MARGIN;
        const minY = 0;
        const maxY = actualHeight - TEXT_HEIGHT_BUFFER;

        newX = Math.max(minX, Math.min(maxX, newX));
        newY = Math.max(minY, Math.min(maxY, newY));

        editPanPosition.setValue({ x: newX, y: newY });
      },
      onPanResponderRelease: () => {
        setEditTextPosition({
          x: (editPanPosition.x as any)._value,
          y: (editPanPosition.y as any)._value,
        });
      },
    })
  ).current;

  // Update edit album name (filter to English only for ransom style)
  const handleEditAlbumNameChange = (text: string) => {
    // Filter to only allow English letters, numbers, and spaces when ransom style is selected
    const filteredText = editFontStyle === 'ransom'
      ? text.replace(/[^a-zA-Z0-9\s]/g, '')
      : text;
    setEditAlbumName(filteredText);
  };

  // Regenerate edit ransom style with new seed
  const regenerateEditStyles = () => {
    if (editAlbumName.length > 0 && editFontStyle === 'ransom') {
      setEditRansomSeed(Math.floor(Math.random() * 1000000));
    }
  };

  // Save edited album
  const handleSaveEdit = async () => {
    if (selectedAlbum && editAlbumName.trim()) {
      const updatedAlbum: Album = {
        ...selectedAlbum,
        name: editAlbumName.trim(),
        coverPhoto: editCoverPhoto,
        namePosition: { ...editTextPosition },
        textScale: editTextScale,
        fontStyle: editFontStyle,
        ransomSeed: editRansomSeed,
      };

      // Sync or local update based on mode
      if (isSyncInitialized && !isDemoMode) {
        try {
          await syncUpdateAlbum(selectedAlbum.id, {
            name: editAlbumName.trim(),
            cover_photo_url: editCoverPhoto,
            name_position: { ...editTextPosition },
            text_scale: editTextScale,
            font_style: editFontStyle || 'basic',
            ransom_seed: editRansomSeed,
          });
        } catch (error) {
          console.error('Error syncing album update:', error);
          // Fallback to local if sync fails
          setLocalAlbums(localAlbums.map(album =>
            album.id === selectedAlbum.id ? updatedAlbum : album
          ));
        }
      } else {
        // Demo mode: update locally
        setLocalAlbums(localAlbums.map(album =>
          album.id === selectedAlbum.id ? updatedAlbum : album
        ));
      }

      setSelectedAlbum(updatedAlbum);
      setShowCoverEditModal(false);
    }
  };

  // Initialize edit pan position when modal opens
  useEffect(() => {
    if (showCoverEditModal && selectedAlbum) {
      const pos = selectedAlbum.namePosition || { x: 30, y: 16 };
      editPanPosition.setValue(pos);
      editPanOffset.current = pos;
    }
  }, [showCoverEditModal]);

  return (
    <View style={styles.container}>
      {/* Background Image - Optimized with expo-image + blur */}
      <View style={styles.backgroundImage}>
        <ExpoImage
          source={backgroundImage?.uri ? { uri: backgroundImage.uri } : backgroundImage}
          placeholder="L6PZfSi_.AyE_3t7t7R**0LTIpIp"
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          style={styles.backgroundImageStyle}
        />
        <BlurView intensity={90} tint="light" style={StyleSheet.absoluteFill} />
      </View>
      <View style={styles.overlay} />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{t('memories.title')}</Text>
          <Text style={styles.headerSubtitle}>{t('memories.subtitle')}</Text>
        </View>
      </View>

      {/* Content */}
      {completedMemories.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyMissionCard}>
            <Text style={styles.emptyMissionText}>{t('memories.empty')}</Text>
            <Text style={styles.emptyMissionHint}>
              {t('memories.emptyHint')}
            </Text>
          </View>
        </View>
      ) : (
        <ScrollView
          style={styles.mainContent}
          contentContainerStyle={styles.mainContentContainer}
          showsVerticalScrollIndicator={false}
          bounces={true}
          alwaysBounceVertical={true}
        >
          {/* Year Groups */}
          {years.map((year) => {
            const months = Object.keys(groupedMissions[year]).sort(
              (a, b) => parseInt(b) - parseInt(a)
            );

            return (
              <View key={year} style={styles.yearSection}>
                {/* Year Header */}
                <View style={styles.yearHeader}>
                  <Text style={styles.yearTitle}>{i18n.language === 'ko' ? `${year}년` : year}</Text>
                  {years.length > 1 && (
                    <Pressable
                      onPress={() => setShowYearPicker(showYearPicker === year ? null : year)}
                      style={styles.yearPickerButton}
                    >
                      <ChevronDown
                        color={COLORS.white}
                        size={16}
                        style={{
                          transform: [{ rotate: showYearPicker === year ? '180deg' : '0deg' }],
                        }}
                      />
                    </Pressable>
                  )}
                </View>

                {/* Year Picker Dropdown */}
                {showYearPicker === year && (
                  <View style={styles.yearPickerDropdown}>
                    {years.map((y) => (
                      <Pressable
                        key={y}
                        onPress={() => {
                          setShowYearPicker(null);
                        }}
                        style={[
                          styles.yearPickerItem,
                          y === year && styles.yearPickerItemActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.yearPickerItemText,
                            y === year && styles.yearPickerItemTextActive,
                          ]}
                        >
                          {i18n.language === 'ko' ? `${y}년` : y}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                {/* Horizontal Month Cards */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.monthCardsContainer}
                >
                  {months.map((month) => {
                    const missions = groupedMissions[year][month];
                    const representativeMission = missions[0];
                    const hasMultiple = missions.length > 1;

                    return (
                      <Pressable
                        key={`${year}-${month}`}
                        style={styles.monthCard}
                        onPress={() => setSelectedMonth({
                          year,
                          month,
                          monthName: getMonthName(month),
                          missions,
                        })}
                      >
                        <View style={styles.monthCardInner}>
                          <ExpoImage
                            source={{ uri: representativeMission.photoUrl }}
                            style={styles.monthCardImage}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            transition={100}
                          />

                          {/* Month Badge */}
                          <View style={styles.monthBadge}>
                            <Text style={styles.monthBadgeText}>
                              {getMonthName(month)}
                            </Text>
                          </View>

                          {/* Multiple Photos Icon */}
                          {hasMultiple && (
                            <View style={styles.multipleIcon}>
                              <View style={styles.stackIcon}>
                                <View style={styles.stackBack} />
                                <View style={styles.stackFront} />
                              </View>
                            </View>
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            );
          })}

          {/* Photo Collage Section */}
          <View style={styles.collageSection}>
            <View style={styles.collageSectionHeader}>
              <Text style={styles.collageSectionTitle}>{t('memories.album.title')}</Text>
              <Pressable style={styles.albumIconButton} onPress={openAlbumModal}>
                <BookHeart color={COLORS.white} size={20} strokeWidth={1.5} />
              </Pressable>
            </View>
            <Text style={styles.collageSectionSubtitle}>{t('memories.album.subtitle')}</Text>

            {/* Created Albums List */}
            {albums.length > 0 && (
              <View style={styles.albumsListContainer}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.albumsList}
                >
                  {albums.map((album) => (
                    <Pressable
                      key={album.id}
                      style={styles.albumItem}
                      onPress={() => {
                        setSelectedAlbum(album);
                        setShowAlbumDetailModal(true);
                      }}
                    >
                      <View style={styles.hardcoverBook}>
                        {/* Full Photo Background */}
                        {album.coverPhoto ? (
                          <ExpoImage source={{ uri: album.coverPhoto }} style={styles.bookFullPhoto} contentFit="cover" cachePolicy="memory-disk" transition={100} />
                        ) : (
                          <View style={styles.bookPlaceholder}>
                            <ImageIcon color="rgba(255,255,255,0.3)" size={24} />
                          </View>
                        )}

                        {/* Book Spine - Inward Curve Effect */}
                        <LinearGradient
                          colors={['rgba(0, 0, 0, 0.65)', 'rgba(0, 0, 0, 0.35)', 'rgba(0, 0, 0, 0.12)', 'rgba(255, 255, 255, 0.08)', 'transparent']}
                          locations={[0, 0.25, 0.55, 0.8, 1]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 0 }}
                          style={styles.bookSpineCurve}
                        />

                        {/* Main Cover Area */}
                        <View style={styles.albumCoverWrapper}>
                          {/* Cover Texture Overlay */}
                          <View style={styles.coverTextureOverlay} pointerEvents="none" />

                          {/* Cover Edge Highlight */}
                          <View style={styles.coverEdgeHighlight} pointerEvents="none" />

                          {/* Album Name - Basic or Ransom Style */}
                          <View style={[
                            styles.albumNameOverlay,
                            {
                              left: (album.namePosition?.x ?? 30) * ALBUM_SCALE_RATIO,
                              top: (album.namePosition?.y ?? 16) * ALBUM_SCALE_RATIO,
                            }
                          ]}>
                            {album.fontStyle === 'basic' ? (
                              // Basic Jua Font Style
                              <Text style={[styles.basicFontTiny, { fontSize: 16 * (album.textScale || 1) * ALBUM_SCALE_RATIO }]}>{album.name}</Text>
                            ) : (
                              // Ransom Style - Image-based
                              <RansomText
                                text={album.name}
                                seed={album.ransomSeed || 12345}
                                characterSize={18 * (album.textScale || 1) * ALBUM_SCALE_RATIO}
                                spacing={-4 * ALBUM_SCALE_RATIO}
                                enableRotation={true}
                                enableYOffset={true}
                              />
                            )}
                          </View>
                        </View>
                      </View>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* Month Album Modal */}
      <Modal
        visible={!!selectedMonth}
        transparent
        animationType="none"
        onRequestClose={() => {
          if (selectedPhoto) {
            setSelectedPhoto(null);
          } else {
            setSelectedMonth(null);
          }
        }}
      >
        <View style={styles.monthModalContainer}>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: backdropOpacityAnim }]}>
            <Pressable
              style={styles.monthModalBackdrop}
              onPress={() => {
                if (selectedPhoto) {
                  setSelectedPhoto(null);
                } else {
                  closeMonthModal();
                }
              }}
            >
              <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
            </Pressable>
          </Animated.View>

          {/* Album Grid View */}
          {!selectedPhoto && (
            <Animated.View
              style={[
                styles.monthModalContent,
                { transform: [{ translateY: slideAnim }] }
              ]}
            >
              <View style={styles.monthModalHeader}>
                <View>
                  <Text style={styles.monthModalTitle}>
                    {i18n.language === 'ko'
                      ? `${selectedMonth?.year}년 ${selectedMonth?.monthName}`
                      : `${selectedMonth?.monthName} ${selectedMonth?.year}`}
                  </Text>
                  <Text style={styles.monthModalCount}>
                    {t('memories.itemCount', { count: selectedMonth?.missions.length })}
                  </Text>
                </View>
                {/* Close Button */}
                <Pressable
                  style={styles.monthModalCloseButton}
                  onPress={closeMonthModal}
                >
                  <X color="rgba(255,255,255,0.8)" size={20} />
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={styles.monthModalGrid}>
                {selectedMonth?.missions.map((mission) => (
                  <Pressable
                    key={mission.id}
                    style={styles.monthModalItem}
                    onPress={() => setSelectedPhoto(mission)}
                  >
                    <View style={styles.monthModalItemInner}>
                      <ExpoImage
                        source={{ uri: mission.photoUrl }}
                        style={styles.monthModalItemImage}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={100}
                      />
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            </Animated.View>
          )}

          {/* Photo Detail View (Overlay) */}
          {selectedPhoto && selectedMonth && (
            <PhotoDetailView
              missions={selectedMonth.missions}
              initialPhoto={selectedPhoto}
              onClose={() => setSelectedPhoto(null)}
              onDelete={async (memoryId) => {
                console.log('[Delete] Starting deletion for memoryId:', memoryId);
                console.log('[Delete] isSyncInitialized:', isSyncInitialized, 'isDemoMode:', isDemoMode);

                // UUID validation - skip DB delete for sample memories
                const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memoryId);

                // Delete from database if synced and valid UUID
                if (isSyncInitialized && !isDemoMode && isValidUUID) {
                  try {
                    console.log('[Delete] Calling db.completedMissions.delete...');
                    const { error } = await db.completedMissions.delete(memoryId);
                    if (error) {
                      console.error('[Delete] Error deleting memory from DB:', error);
                    } else {
                      console.log('[Delete] Successfully deleted from DB');
                    }
                  } catch (error) {
                    console.error('[Delete] Exception during deletion:', error);
                  }
                } else if (!isValidUUID) {
                  console.log('[Delete] Sample memory - skipping DB delete');
                }
                // Delete from local state
                console.log('[Delete] Deleting from local state...');
                deleteMemory(memoryId);

                // Update selectedMonth to remove the deleted photo from the modal
                // Use callback form to avoid stale closure issue
                setSelectedMonth(prevMonth => {
                  if (!prevMonth) return null;
                  const updatedMissions = prevMonth.missions.filter(m => m.id !== memoryId);
                  console.log('[Delete] Updated selectedMonth - remaining missions:', updatedMissions.length);
                  return {
                    ...prevMonth,
                    missions: updatedMissions
                  };
                });

                console.log('[Delete] Deletion complete');
              }}
            />
          )}
        </View>
      </Modal>

      {/* Album Creation Modal */}
      <Modal
        visible={showAlbumModal}
        transparent
        animationType="none"
        onRequestClose={closeAlbumModal}
      >
        <Animated.View style={[styles.albumModalFadeWrapper, { opacity: albumModalOpacityAnim }]}>
          <BlurView intensity={80} tint="dark" style={styles.albumModalContainer}>
            <TouchableWithoutFeedback onPress={closeAlbumModal}>
              <View style={styles.albumModalBackdrop} />
            </TouchableWithoutFeedback>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.keyboardAvoidingView}
            >
              <Animated.View
                style={[
                  styles.albumModalContent,
                  {
                    transform: [{ scale: albumModalScaleAnim }],
                  },
                ]}
              >
                {/* Header */}
                <View style={styles.albumModalHeader}>
                  <Text style={styles.albumModalTitle}>
                    {albumStep === 'fontStyle' ? t('memories.album.fontStyle') : albumStep === 'name' ? t('memories.album.name') : t('memories.album.coverPhoto')}
                  </Text>
                  <Pressable
                    style={styles.albumModalCloseButton}
                    onPress={closeAlbumModal}
                  >
                    <X color="rgba(255,255,255,0.8)" size={20} />
                  </Pressable>
                </View>
                <View style={styles.albumModalHeaderDivider} />

                <Animated.View style={{ opacity: stepOpacityAnim }}>
                  {albumStep === 'fontStyle' ? (
                    <>
                      {/* Step 0: Font Style Selection */}
                      <Text style={styles.albumModalSubtitle}>
                        {t('memories.album.fontStyleDesc')}
                      </Text>

                      <View style={styles.fontStyleOptions}>
                        {/* Basic Font Option */}
                        <Pressable
                          style={[
                            styles.fontStyleOption,
                            fontStyle === 'basic' && styles.fontStyleOptionSelected,
                          ]}
                          onPress={() => setFontStyle('basic')}
                        >
                          <Text style={styles.fontStylePreviewBasic}>{t('memories.album.basicFont')}</Text>
                          <Text style={styles.fontStyleLabel}>{t('memories.album.basicFontDesc')}</Text>
                        </Pressable>

                        {/* Ransom Font Option */}
                        <Pressable
                          style={[
                            styles.fontStyleOption,
                            fontStyle === 'ransom' && styles.fontStyleOptionSelected,
                          ]}
                          onPress={() => {
                            setFontStyle('ransom');
                            // Clear text if it contains Korean characters (not supported in ransom style)
                            if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(albumName)) {
                              setAlbumName('');
                            }
                          }}
                        >
                          <View style={styles.fontStylePreviewRansom}>
                            <RansomText
                              text="FONT"
                              seed={12345}
                              characterSize={28}
                              spacing={-4}
                              enableRotation={true}
                              enableYOffset={true}
                            />
                          </View>
                          <Text style={styles.fontStyleLabel}>{t('memories.album.ransomStyle')}</Text>
                        </Pressable>
                      </View>

                      <Pressable
                        style={[
                          styles.albumModalButton,
                          { width: '100%' },
                          !fontStyle && styles.albumModalButtonDisabled,
                        ]}
                        onPress={() => transitionToNextStep('name')}
                        disabled={!fontStyle}
                      >
                        <Text style={styles.albumModalButtonText}>{t('common.next')}</Text>
                      </Pressable>
                    </>
                  ) : albumStep === 'name' ? (
                    <>
                      {/* Step 1: Album Name Input */}
                      <Text style={styles.albumModalSubtitle}>
                        {fontStyle === 'basic' ? t('memories.album.basicFontHint') : t('memories.album.ransomFontHint')}
                      </Text>

                      {/* Text Preview - Basic or Ransom Style */}
                      <View style={styles.ransomPreviewContainer}>
                        {albumName.length > 0 ? (
                          fontStyle === 'basic' ? (
                            // Basic Jua Font Style - Clean text without paper backgrounds
                            <Text style={styles.basicFontPreview}>{albumName}</Text>
                          ) : (
                            // Ransom Style - Image-based character rendering
                            <RansomText
                              text={wrapLongWordsForRansom(albumName, 8)}
                              seed={ransomSeed}
                              characterSize={36}
                              spacing={-4}
                              enableRotation={true}
                              enableYOffset={true}
                            />
                          )
                        ) : (
                          <Text style={[styles.ransomPlaceholder, fontStyle === 'basic' && { fontFamily: 'Jua_400Regular' }]}>{t('memories.album.name')}</Text>
                        )}
                        {/* Refresh Button for Ransom Style */}
                        {fontStyle === 'ransom' && albumName.length > 0 && (
                          <Pressable
                            style={styles.refreshButton}
                            onPress={() => setRansomSeed(Math.floor(Math.random() * 1000000))}
                          >
                            <RefreshCw color="rgba(255, 255, 255, 0.6)" size={18} />
                          </Pressable>
                        )}
                      </View>

                      {/* Text Input */}
                      <TextInput
                        style={styles.albumNameInput}
                        value={albumName}
                        onChangeText={handleAlbumNameChange}
                        placeholder={fontStyle === 'ransom' ? t('memories.album.ransomPlaceholder') : t('memories.album.namePlaceholder')}
                        placeholderTextColor="rgba(255,255,255,0.4)"
                        maxLength={20}
                        autoFocus
                      />

                      {/* Button Row */}
                      <View style={styles.albumModalButtonRow}>
                        <Pressable
                          style={styles.albumModalButtonSecondary}
                          onPress={() => transitionToNextStep('fontStyle')}
                        >
                          <Text style={styles.albumModalButtonSecondaryText}>{t('common.back')}</Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.albumModalButton,
                            !albumName.trim() && styles.albumModalButtonDisabled,
                          ]}
                          onPress={goToNextStep}
                          disabled={!albumName.trim()}
                        >
                          <Text style={styles.albumModalButtonText}>{t('common.next')}</Text>
                        </Pressable>
                      </View>
                    </>
                  ) : (
                    <>
                      {/* Step 2: Cover Photo Selection with Draggable Text */}
                      <Text style={styles.albumModalSubtitle}>
                        {t('memories.album.coverEditHint')}
                      </Text>

                      {/* Cover Photo Preview with Draggable Text */}
                      <View style={styles.coverPhotoContainer}>
                        <View style={styles.coverPhotoPickerContainer} onLayout={handleContainerLayout}>
                          {/* Book Spine - Inward Curve Effect */}
                          <LinearGradient
                            colors={['rgba(0, 0, 0, 0.65)', 'rgba(0, 0, 0, 0.35)', 'rgba(0, 0, 0, 0.12)', 'rgba(255, 255, 255, 0.08)', 'transparent']}
                            locations={[0, 0.25, 0.55, 0.8, 1]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.modalBookSpineCurve}
                          />

                          <Pressable
                            style={styles.coverPhotoInner}
                            onPress={handlePickCoverPhoto}
                          >
                            {albumCoverPhoto ? (
                              <ExpoImage
                                source={{ uri: albumCoverPhoto }}
                                style={styles.coverPhotoPreview}
                                contentFit="cover"
                                cachePolicy="memory-disk"
                                transition={100}
                              />
                            ) : (
                              <View style={styles.coverPhotoPlaceholder}>
                                <Plus color="rgba(255,255,255,0.6)" size={40} />
                                <Text style={styles.coverPhotoPlaceholderText}>{t('memories.album.selectPhoto')}</Text>
                              </View>
                            )}
                          </Pressable>

                          {/* Draggable Album Name Overlay */}
                          {albumCoverPhoto && (
                            <Animated.View
                              {...panResponder.panHandlers}
                              style={[
                                styles.draggableTextOverlay,
                                {
                                  transform: [
                                    { translateX: panPosition.x },
                                    { translateY: panPosition.y },
                                  ],
                                },
                              ]}
                            >
                              {fontStyle === 'basic' ? (
                                // Basic Jua Font Style
                                <Text style={[
                                  styles.basicFontOverlay,
                                  {
                                    fontSize: 16 * textScale,
                                    color: textColor === 'black' ? '#000000' : COLORS.white,
                                  }
                                ]}>{albumName}</Text>
                              ) : (
                                // Ransom Style - Image-based
                                <RansomText
                                  text={albumName}
                                  seed={ransomSeed}
                                  characterSize={18 * textScale}
                                  spacing={-4}
                                  enableRotation={true}
                                  enableYOffset={true}
                                />
                              )}
                            </Animated.View>
                          )}
                        </View>
                      </View>

                      {/* Drag instruction */}
                      {albumCoverPhoto && (
                        <Text style={styles.dragHintText}>{t('memories.album.dragHint')}</Text>
                      )}

                      {/* Text Style Selection - Different UI based on font style */}
                      {albumCoverPhoto && fontStyle === 'basic' && (
                        <View style={styles.textStyleSelectionContainer}>
                          {/* Color Selection (Left) */}
                          <View style={styles.colorSelectionSection}>
                            <Text style={styles.selectionLabel}>{t('memories.album.color')}</Text>
                            <View style={styles.colorButtonRow}>
                              <Pressable
                                style={[
                                  styles.colorButton,
                                  { backgroundColor: '#000000' },
                                  textColor === 'black' && styles.colorButtonSelected,
                                ]}
                                onPress={() => setTextColor('black')}
                              />
                              <Pressable
                                style={[
                                  styles.colorButton,
                                  { backgroundColor: '#FFFFFF' },
                                  textColor === 'white' && styles.colorButtonSelected,
                                ]}
                                onPress={() => setTextColor('white')}
                              />
                            </View>
                          </View>

                          {/* Size Selection (Right) */}
                          <View style={styles.sizeSelectionSection}>
                            <Text style={styles.selectionLabel}>{t('memories.album.size')}</Text>
                            <View style={styles.sizeButtonRow}>
                              {[1.5, 2.25, 3.0].map((scale, index) => (
                                <Pressable
                                  key={index}
                                  style={[
                                    styles.sizeButton,
                                    textScale === scale && styles.sizeButtonSelected,
                                  ]}
                                  onPress={() => setTextScale(scale)}
                                >
                                  <Text style={[
                                    styles.sizeButtonText,
                                    { fontSize: 10 + index * 7 },
                                    textScale === scale && styles.sizeButtonTextSelected,
                                  ]}>A</Text>
                                </Pressable>
                              ))}
                            </View>
                          </View>
                        </View>
                      )}

                      {/* Ransom Style - Size Only */}
                      {albumCoverPhoto && fontStyle === 'ransom' && (
                        <View style={styles.sizeSelectionContainer}>
                          <Text style={styles.sizeSelectionLabel}>{t('memories.album.textSize')}</Text>
                          <View style={styles.sizeButtonRow}>
                            {[1.0, 1.5, 2.0].map((scale, index) => (
                              <Pressable
                                key={index}
                                style={[
                                  styles.sizeButton,
                                  textScale === scale && styles.sizeButtonSelected,
                                ]}
                                onPress={() => setTextScale(scale)}
                              >
                                <Text style={[
                                  styles.sizeButtonText,
                                  { fontSize: 10 + index * 7 },
                                  textScale === scale && styles.sizeButtonTextSelected,
                                ]}>A</Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      )}

                      {/* Action Buttons */}
                      <View style={styles.albumModalButtonRow}>
                        <Pressable
                          style={styles.albumModalButtonSecondary}
                          onPress={() => transitionToNextStep('name')}
                        >
                          <Text style={styles.albumModalButtonSecondaryText}>{t('common.back')}</Text>
                        </Pressable>
                        <Pressable
                          style={[
                            styles.albumModalButton,
                            !albumCoverPhoto && styles.albumModalButtonDisabled
                          ]}
                          onPress={handleCreateAlbum}
                          disabled={!albumCoverPhoto}
                        >
                          <Text style={[
                            styles.albumModalButtonText,
                            !albumCoverPhoto && styles.albumModalButtonTextDisabled
                          ]}>{t('common.done')}</Text>
                        </Pressable>
                      </View>
                    </>
                  )}
                </Animated.View>
              </Animated.View>
            </KeyboardAvoidingView>

            {/* Cover Photo Picker Overlay */}
            {showCoverPhotoPicker && (
              <View style={styles.missionPickerOverlay}>
                <Pressable
                  style={styles.monthModalBackdrop}
                  onPress={closeCoverPhotoPicker}
                >
                  <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
                </Pressable>
                <Animated.View
                  style={[
                    styles.monthModalContent,
                    { transform: [{ translateY: coverPickerSlideAnim }] }
                  ]}
                >
                  <View style={styles.monthModalHeader}>
                    <Text style={styles.monthModalTitle}>{t('memories.album.selectPhoto')}</Text>
                    <Pressable
                      style={styles.monthModalCloseButton}
                      onPress={closeCoverPhotoPicker}
                    >
                      <X color="rgba(255,255,255,0.8)" size={20} />
                    </Pressable>
                  </View>
                  <ScrollView contentContainerStyle={styles.monthModalGrid}>
                    {completedMemories.length === 0 ? (
                      <View style={styles.missionPickerEmpty}>
                        <Text style={styles.missionPickerEmptyText}>{t('memories.empty')}</Text>
                      </View>
                    ) : (
                      completedMemories.map((mission) => (
                        <Pressable
                          key={mission.id}
                          style={styles.monthModalItem}
                          onPress={() => handleSelectCoverPhoto(mission.photoUrl)}
                        >
                          <View style={styles.monthModalItemInner}>
                            <ExpoImage source={{ uri: mission.photoUrl }} style={styles.monthModalItemImage} contentFit="cover" cachePolicy="memory-disk" transition={100} />
                          </View>
                        </Pressable>
                      ))
                    )}
                  </ScrollView>
                </Animated.View>
              </View>
            )}
          </BlurView>
        </Animated.View>
      </Modal>

      {/* Album Detail Page (Full Screen) */}
      <Modal
        visible={showAlbumDetailModal}
        transparent
        animationType="none"
        onRequestClose={closeAlbumDetailModal}
      >
        <Animated.View
          style={[
            styles.albumDetailFullScreen,
            {
              opacity: albumDetailOpacityAnim,
              transform: [
                { scale: albumDetailScaleAnim },
                { translateY: albumDetailTranslateYAnim },
              ],
            },
          ]}
        >
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000' }]} />
          {/* Album Content (hidden when photo is selected) */}
          {!selectedAlbumPhoto && (
            <>
              {/* Menu Overlay for closing menu */}
              {showAlbumMenu && (
                <Pressable
                  style={styles.menuOverlay}
                  onPress={() => setShowAlbumMenu(false)}
                />
              )}
              {/* Header */}
              <View style={styles.albumDetailHeader}>
                <Pressable
                  style={styles.albumDetailCloseButton}
                  onPress={closeAlbumDetailModal}
                >
                  <X color="#FFFFFF" size={24} />
                </Pressable>
                <Text
                  style={[
                    styles.albumDetailTitle,
                    { fontSize: selectedAlbum?.name ? Math.max(12, Math.min(18, 20 - selectedAlbum.name.length * 0.5)) : 18 }
                  ]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.6}
                >
                  {selectedAlbum?.name || t('memories.album.title')}
                </Text>
                <Pressable
                  style={styles.albumDetailMenuButton}
                  onPress={() => setShowAlbumMenu(!showAlbumMenu)}
                >
                  <MoreHorizontal color="#FFFFFF" size={24} />
                </Pressable>

                {/* Dropdown Menu */}
                {showAlbumMenu && (
                  <View style={styles.albumMenuDropdown}>
                    <Pressable
                      style={styles.albumMenuItem}
                      onPress={() => {
                        setShowAlbumMenu(false);
                        setShowMissionPhotosPicker(true);
                      }}
                    >
                      <Plus color="#FFFFFF" size={18} />
                      <Text style={styles.albumMenuItemText}>{t('memories.album.addPhoto')}</Text>
                    </Pressable>
                    <Pressable
                      style={styles.albumMenuItem}
                      onPress={() => {
                        if (selectedAlbum) {
                          // Initialize all edit states from existing album data
                          setEditAlbumName(selectedAlbum.name);
                          setEditFontStyle(selectedAlbum.fontStyle);
                          setEditCoverPhoto(selectedAlbum.coverPhoto);
                          setEditTextPosition(selectedAlbum.namePosition || { x: 30, y: 16 });
                          setEditTextScale(selectedAlbum.textScale || 1);
                          setEditRansomSeed(selectedAlbum.ransomSeed || Math.floor(Math.random() * 1000000));
                          setEditAlbumStep('fontStyle');
                          setShowCoverEditModal(true);
                        }
                        setShowAlbumMenu(false);
                      }}
                    >
                      <Edit2 color="#FFFFFF" size={18} />
                      <Text style={styles.albumMenuItemText}>{t('memories.album.editCover')}</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.albumMenuItem, styles.albumMenuItemDanger]}
                      onPress={() => {
                        setShowAlbumMenu(false);
                        Alert.alert(
                          t('memories.album.deleteAlbum'),
                          t('memories.album.deleteAlbumConfirm'),
                          [
                            { text: t('common.cancel'), style: 'cancel' },
                            {
                              text: t('common.delete'),
                              style: 'destructive',
                              onPress: async () => {
                                if (selectedAlbum) {
                                  const albumIdToDelete = selectedAlbum.id;
                                  // Reset all modal states first
                                  setShowAlbumDetailModal(false);
                                  setShowAlbumMenu(false);
                                  setSelectedAlbum(null);
                                  setIsSelectingAlbumPhotos(false);
                                  setSelectedAlbumPhotoIndices(new Set());
                                  setSelectedAlbumPhoto(null);
                                  setShowMissionPhotosPicker(false);

                                  // Delete album via sync or locally
                                  if (isSyncInitialized && !isDemoMode) {
                                    try {
                                      await syncDeleteAlbum(albumIdToDelete);
                                      // Album photos are deleted via CASCADE in DB
                                    } catch (error) {
                                      console.error('Error syncing album delete:', error);
                                      // Fallback to local
                                      setLocalAlbums(localAlbums.filter(a => a.id !== albumIdToDelete));
                                      setLocalAlbumPhotos(prev => {
                                        const newPhotos = { ...prev };
                                        delete newPhotos[albumIdToDelete];
                                        return newPhotos;
                                      });
                                    }
                                  } else {
                                    // Demo mode: delete locally
                                    setLocalAlbums(localAlbums.filter(a => a.id !== albumIdToDelete));
                                    setLocalAlbumPhotos(prev => {
                                      const newPhotos = { ...prev };
                                      delete newPhotos[albumIdToDelete];
                                      return newPhotos;
                                    });
                                  }
                                }
                              }
                            }
                          ]
                        );
                      }}
                    >
                      <Trash2 color="#FF6B6B" size={18} />
                      <Text style={[styles.albumMenuItemText, { color: '#FF6B6B' }]}>{t('memories.album.deleteAlbum')}</Text>
                    </Pressable>
                  </View>
                )}
              </View>

              {/* Scrollable Content - Album Cover + Sticky Header + Photos */}
              <ScrollView
                style={styles.albumDetailScrollView}
                contentContainerStyle={styles.albumDetailScrollContent}
                showsVerticalScrollIndicator={false}
                stickyHeaderIndices={[1]}
              >
                {/* Index 0: Album Cover Preview */}
                <View style={styles.albumDetailCoverContainer}>
                  {selectedAlbum && (
                    <View style={styles.albumDetailCoverWrapper}>
                      {/* Book Spine Effect */}
                      <LinearGradient
                        colors={['rgba(0, 0, 0, 0.65)', 'rgba(0, 0, 0, 0.35)', 'rgba(0, 0, 0, 0.12)', 'rgba(255, 255, 255, 0.08)', 'transparent']}
                        locations={[0, 0.25, 0.55, 0.8, 1]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.albumDetailSpine}
                      />
                      {selectedAlbum.coverPhoto ? (
                        <ExpoImage source={{ uri: selectedAlbum.coverPhoto }} style={styles.albumDetailCoverImage} contentFit="cover" cachePolicy="memory-disk" transition={100} />
                      ) : (
                        <View style={styles.albumDetailCoverPlaceholder}>
                          <ImageIcon color="rgba(255,255,255,0.3)" size={40} />
                        </View>
                      )}
                      {/* Album Name Overlay */}
                      <View style={[
                        styles.albumDetailNameOverlay,
                        {
                          left: (selectedAlbum.namePosition?.x ?? 30) * ALBUM_DETAIL_SCALE_RATIO,
                          top: (selectedAlbum.namePosition?.y ?? 16) * ALBUM_DETAIL_SCALE_RATIO,
                        }
                      ]}>
                        {selectedAlbum.fontStyle === 'basic' ? (
                          <Text style={[styles.basicFontOverlay, { fontSize: 16 * selectedAlbum.textScale * ALBUM_DETAIL_SCALE_RATIO }]}>
                            {selectedAlbum.name}
                          </Text>
                        ) : (
                          <RansomText
                            text={selectedAlbum.name}
                            seed={selectedAlbum.ransomSeed || 12345}
                            characterSize={18 * (selectedAlbum.textScale || 1) * ALBUM_DETAIL_SCALE_RATIO}
                            spacing={-4 * ALBUM_DETAIL_SCALE_RATIO}
                            enableRotation={true}
                            enableYOffset={true}
                          />
                        )}
                      </View>
                    </View>
                  )}
                </View>

                {/* Index 1: Photos Section Header - Sticky */}
                <View style={styles.albumPhotosSectionHeaderSticky}>
                  <View style={styles.albumPhotosSectionHeaderInner}>
                    <Text style={styles.albumPhotosSectionTitle}>
                      {selectedAlbum ? t('memories.itemCount', { count: (albumPhotos[selectedAlbum.id] || []).length }) : t('memories.itemCount', { count: 0 })}
                    </Text>
                    {/* Select/Delete/Cancel Buttons */}
                    {selectedAlbum && (albumPhotos[selectedAlbum.id] || []).length > 0 && (
                      <View style={styles.albumPhotoActionButtons}>
                        {isSelectingAlbumPhotos ? (
                          <>
                            <Pressable
                              style={styles.albumPhotoCancelButton}
                              onPress={() => {
                                setIsSelectingAlbumPhotos(false);
                                setSelectedAlbumPhotoIndices(new Set());
                              }}
                            >
                              <Text style={styles.albumPhotoCancelButtonText}>{t('common.cancel')}</Text>
                            </Pressable>
                            <Pressable
                              style={[
                                styles.albumPhotoDeleteButton,
                                selectedAlbumPhotoIndices.size === 0 && styles.albumPhotoDeleteButtonDisabled
                              ]}
                              disabled={selectedAlbumPhotoIndices.size === 0}
                              onPress={() => {
                                if (selectedAlbumPhotoIndices.size > 0) {
                                  Alert.alert(
                                    t('memories.photo.deleteTitle'),
                                    t('memories.photo.deleteConfirm', { count: selectedAlbumPhotoIndices.size }),
                                    [
                                      { text: t('common.cancel'), style: 'cancel' },
                                      {
                                        text: t('common.delete'),
                                        style: 'destructive',
                                        onPress: async () => {
                                          if (selectedAlbum) {
                                            const currentPhotos = albumPhotos[selectedAlbum.id] || [];
                                            const photosToRemove = currentPhotos.filter((_, idx) => selectedAlbumPhotoIndices.has(idx));
                                            const newPhotos = currentPhotos.filter((_, idx) => !selectedAlbumPhotoIndices.has(idx));

                                            console.log('[AlbumRemove] ========== ALBUM REMOVE START ==========');
                                            console.log('[AlbumRemove] Selected album ID:', selectedAlbum.id);
                                            console.log('[AlbumRemove] Selected indices:', Array.from(selectedAlbumPhotoIndices));
                                            console.log('[AlbumRemove] Current photos count:', currentPhotos.length);
                                            console.log('[AlbumRemove] Current photos (id list):', currentPhotos.map(p => p.id));
                                            console.log('[AlbumRemove] Photos to remove:', photosToRemove.map(p => ({ id: p.id, photoUrl: p.photoUrl })));
                                            console.log('[AlbumRemove] syncedAlbumPhotosMap for this album:', syncedAlbumPhotosMap[selectedAlbum.id]?.map(p => ({ id: p.id, memory_id: p.memory_id })));

                                            // UUID validation helper
                                            const isValidUUID = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

                                            // Separate real and sample photos
                                            const realPhotos = photosToRemove.filter(p => isValidUUID(p.id));
                                            const samplePhotos = photosToRemove.filter(p => !isValidUUID(p.id));

                                            console.log('[AlbumRemove] Real photos:', realPhotos.length, 'Sample photos:', samplePhotos.length);
                                            console.log('[AlbumRemove] isSyncInitialized:', isSyncInitialized, 'isDemoMode:', isDemoMode);

                                            // Remove real photos via sync
                                            if (isSyncInitialized && !isDemoMode && realPhotos.length > 0) {
                                              console.log('[AlbumRemove] Calling syncRemovePhotoFromAlbum for each real photo...');
                                              try {
                                                // Remove each real photo from the album in sync store
                                                for (const photo of realPhotos) {
                                                  console.log('[AlbumRemove] Removing photo:', photo.id);
                                                  await syncRemovePhotoFromAlbum(selectedAlbum.id, photo.id);
                                                }
                                                console.log('[AlbumRemove] All removals completed');
                                              } catch (error) {
                                                console.error('[AlbumRemove] Error syncing photo removal:', error);
                                              }
                                            } else {
                                              console.log('[AlbumRemove] Skipping sync removal - conditions not met');
                                            }

                                            // Always update local state for all photos (including samples)
                                            if (samplePhotos.length > 0 || !isSyncInitialized || isDemoMode) {
                                              console.log('[AlbumRemove] Updating local album photos state');
                                              setLocalAlbumPhotos(prev => ({
                                                ...prev,
                                                [selectedAlbum.id]: newPhotos
                                              }));
                                            }

                                            // Delete sample photos from local memory store
                                            for (const photo of samplePhotos) {
                                              deleteMemory(photo.id);
                                            }

                                            setSelectedAlbumPhotoIndices(new Set());
                                            setIsSelectingAlbumPhotos(false);
                                            console.log('[AlbumRemove] ========== ALBUM REMOVE COMPLETE ==========');
                                            console.log('[AlbumRemove] (Note: UI will update on next render cycle)');
                                          }
                                        }
                                      }
                                    ]
                                  );
                                }
                              }}
                            >
                              <Text style={[
                                styles.albumPhotoDeleteButtonText,
                                selectedAlbumPhotoIndices.size === 0 && styles.albumPhotoDeleteButtonTextDisabled
                              ]}>{t('common.delete')}</Text>
                            </Pressable>
                          </>
                        ) : (
                          <Pressable
                            style={styles.albumPhotoSelectButton}
                            onPress={() => setIsSelectingAlbumPhotos(true)}
                          >
                            <Text style={styles.albumPhotoSelectButtonText}>{t('memories.photo.select')}</Text>
                          </Pressable>
                        )}
                      </View>
                    )}
                  </View>
                </View>

                {/* Index 2+: Photos Grid */}
                <View style={styles.albumPhotosGridContainer}>
                  {/* Empty state - Add Photo Button */}
                  {selectedAlbum && (albumPhotos[selectedAlbum.id] || []).length === 0 && (
                    <Pressable
                      style={styles.emptyAddPhotoButton}
                      onPress={() => setShowMissionPhotosPicker(true)}
                    >
                      <Plus color="#FFFFFF" size={32} />
                      <Text style={styles.emptyAddPhotoButtonText}>{t('memories.album.addPhoto')}</Text>
                    </Pressable>
                  )}

                  {/* Album Photos - Grouped by Year/Month */}
                  {selectedAlbum && (() => {
                    const photos = albumPhotos[selectedAlbum.id] || [];
                    if (photos.length === 0) return null;

                    const groupedPhotos = groupByYearMonth(photos);
                    const sortedYears = Object.keys(groupedPhotos).sort((a, b) => parseInt(b) - parseInt(a));

                    // Create a map of photo to original index for selection tracking
                    const photoIndexMap = new Map<CompletedMission, number>();
                    photos.forEach((photo, index) => {
                      photoIndexMap.set(photo, index);
                    });

                    // Flatten year/month into single sections with combined header
                    const sections: { year: string; month: string; photos: typeof photos }[] = [];
                    sortedYears.forEach((year) => {
                      const months = groupedPhotos[year];
                      const sortedMonths = Object.keys(months).sort((a, b) => parseInt(b) - parseInt(a));
                      sortedMonths.forEach((month) => {
                        sections.push({ year, month, photos: months[month] });
                      });
                    });

                    return sections.map(({ year, month, photos: monthPhotos }) => (
                      <View key={`section-${year}-${month}`} style={styles.albumMonthSection}>
                        <Text style={styles.albumMonthHeader}>{getMonthName(month)} {year}</Text>
                        <View style={styles.albumMonthPhotosGrid}>
                          {monthPhotos.map((photo) => {
                            const originalIndex = photoIndexMap.get(photo) ?? 0;
                            return (
                              <Pressable
                                key={`album-photo-${photo.id}`}
                                style={styles.missionPhotoItem}
                                onPress={() => {
                                  if (isSelectingAlbumPhotos) {
                                    // Toggle selection
                                    setSelectedAlbumPhotoIndices(prev => {
                                      const newSet = new Set(prev);
                                      if (newSet.has(originalIndex)) {
                                        newSet.delete(originalIndex);
                                      } else {
                                        newSet.add(originalIndex);
                                      }
                                      return newSet;
                                    });
                                  } else {
                                    // Open photo detail view
                                    setSelectedAlbumPhoto(photo);
                                  }
                                }}
                              >
                                <ExpoImage source={{ uri: photo.photoUrl }} style={styles.missionPhotoImage} contentFit="cover" cachePolicy="memory-disk" transition={100} />
                                {/* Selection Overlay */}
                                {isSelectingAlbumPhotos && (
                                  <View style={[
                                    styles.photoSelectionOverlay,
                                    selectedAlbumPhotoIndices.has(originalIndex) && styles.photoSelectionOverlaySelected
                                  ]}>
                                    {selectedAlbumPhotoIndices.has(originalIndex) && (
                                      <View style={styles.photoSelectionCheck}>
                                        <Check color={COLORS.white} size={16} />
                                      </View>
                                    )}
                                  </View>
                                )}
                              </Pressable>
                            );
                          })}
                        </View>
                      </View>
                    ));
                  })()}
                </View>
              </ScrollView>
            </>
          )}

          {/* Album Photo Detail View */}
          {selectedAlbumPhoto && selectedAlbum && (
            <PhotoDetailView
              missions={albumPhotos[selectedAlbum.id] || []}
              initialPhoto={selectedAlbumPhoto}
              onClose={() => setSelectedAlbumPhoto(null)}
              onDelete={async (memoryId) => {
                console.log('[AlbumPhotoDelete] Starting deletion for memoryId:', memoryId);
                // UUID validation - check if it's a sample memory
                const isValidUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(memoryId);
                console.log('[AlbumPhotoDelete] isValidUUID:', isValidUUID, 'isSyncInitialized:', isSyncInitialized, 'isDemoMode:', isDemoMode);

                // Always update local state immediately for instant UI feedback
                setLocalAlbumPhotos(prev => ({
                  ...prev,
                  [selectedAlbum.id]: (prev[selectedAlbum.id] || []).filter(p => p.id !== memoryId)
                }));
                // Also delete from local memories store immediately
                deleteMemory(memoryId);

                // Delete from album photos AND completed_missions if synced
                if (isSyncInitialized && !isDemoMode && isValidUUID) {
                  try {
                    // 1. Remove from album_photos table
                    console.log('[AlbumPhotoDelete] Calling syncRemovePhotoFromAlbum...');
                    await syncRemovePhotoFromAlbum(selectedAlbum.id, memoryId);
                    console.log('[AlbumPhotoDelete] Album removal successful');

                    // 2. Delete from completed_missions table (for full sync to partner)
                    console.log('[AlbumPhotoDelete] Calling db.completedMissions.delete...');
                    const { error: deleteError } = await db.completedMissions.delete(memoryId);
                    if (deleteError) {
                      console.error('[AlbumPhotoDelete] DB delete error:', deleteError);
                    } else {
                      console.log('[AlbumPhotoDelete] DB delete successful');
                    }
                  } catch (error) {
                    console.error('[AlbumPhotoDelete] Error during deletion:', error);
                  }
                }
                console.log('[AlbumPhotoDelete] Deletion complete');
              }}
            />
          )}

          {/* Mission Photos Picker Overlay (inside Album Detail Modal) */}
          {showMissionPhotosPicker && (
            <View style={styles.missionPickerOverlay}>
              <Pressable
                style={styles.monthModalBackdrop}
                onPress={closeMissionPicker}
              >
                <BlurView intensity={50} tint="dark" style={StyleSheet.absoluteFill} />
              </Pressable>
              <Animated.View
                style={[
                  styles.monthModalContent,
                  { transform: [{ translateY: missionPickerSlideAnim }] }
                ]}
              >
                <View style={styles.missionPickerHeader}>
                  <Pressable
                    style={styles.missionPickerHeaderButton}
                    onPress={closeMissionPicker}
                  >
                    <Text style={styles.missionPickerHeaderButtonText}>{t('common.close')}</Text>
                  </Pressable>
                  <Text style={styles.missionPickerTitle}>{t('memories.album.selectPhoto')}</Text>
                  <Pressable
                    style={styles.missionPickerHeaderButton}
                    onPress={async () => {
                      if (selectedAlbum && selectedMissionPhotos.size > 0) {
                        const photosToAdd = completedMemories.filter(m => selectedMissionPhotos.has(m.id));

                        // Add photos via sync or locally
                        if (isSyncInitialized && !isDemoMode) {
                          try {
                            // Add each photo to the album in sync store
                            for (const photo of photosToAdd) {
                              await syncAddPhotoToAlbum(selectedAlbum.id, photo.id);
                            }
                          } catch (error) {
                            console.error('Error syncing photo addition:', error);
                            // Fallback to local
                            setLocalAlbumPhotos(prev => ({
                              ...prev,
                              [selectedAlbum.id]: [...(prev[selectedAlbum.id] || []), ...photosToAdd]
                            }));
                          }
                        } else {
                          // Demo mode: add locally
                          setLocalAlbumPhotos(prev => ({
                            ...prev,
                            [selectedAlbum.id]: [...(prev[selectedAlbum.id] || []), ...photosToAdd]
                          }));
                        }
                      }
                      closeMissionPicker();
                    }}
                  >
                    <Text style={[
                      styles.missionPickerHeaderButtonText,
                      styles.missionPickerDoneButton,
                      selectedMissionPhotos.size === 0 && styles.missionPickerDoneButtonDisabled
                    ]}>
                      {t('common.add')}
                    </Text>
                  </Pressable>
                </View>
                <ScrollView contentContainerStyle={styles.monthModalGrid}>
                  {completedMemories.length === 0 ? (
                    <View style={styles.missionPickerEmpty}>
                      <Text style={styles.missionPickerEmptyText}>{t('memories.empty')}</Text>
                    </View>
                  ) : (
                    completedMemories.map((mission) => {
                      const isAlreadyInAlbum = selectedAlbum &&
                        (albumPhotos[selectedAlbum.id] || []).some(p => p.id === mission.id);
                      const isSelected = selectedMissionPhotos.has(mission.id);
                      return (
                        <Pressable
                          key={mission.id}
                          style={[
                            styles.monthModalItem,
                            isAlreadyInAlbum && styles.missionPickerItemDisabled
                          ]}
                          disabled={isAlreadyInAlbum}
                          onPress={() => {
                            if (!isAlreadyInAlbum) {
                              setSelectedMissionPhotos(prev => {
                                const newSet = new Set(prev);
                                if (newSet.has(mission.id)) {
                                  newSet.delete(mission.id);
                                } else {
                                  newSet.add(mission.id);
                                }
                                return newSet;
                              });
                            }
                          }}
                        >
                          <View style={styles.monthModalItemInner}>
                            <ExpoImage source={{ uri: mission.photoUrl }} style={styles.monthModalItemImage} contentFit="cover" cachePolicy="memory-disk" transition={100} />
                            {isSelected && (
                              <>
                                <View style={styles.missionPickerSelectedOverlay} />
                                <View style={styles.missionPickerCheckBadge}>
                                  <Check color={COLORS.white} size={14} />
                                </View>
                              </>
                            )}
                            {isAlreadyInAlbum && !isSelected && (
                              <View style={styles.missionPickerItemOverlay}>
                                <Check color={COLORS.white} size={24} />
                              </View>
                            )}
                          </View>
                        </Pressable>
                      );
                    })
                  )}
                </ScrollView>
              </Animated.View>
            </View>
          )}

          {/* Cover Edit Modal - Same structure as Album Creation Modal */}
          {showCoverEditModal && selectedAlbum && (
            <Modal
              visible={showCoverEditModal}
              transparent
              animationType="fade"
              onRequestClose={() => setShowCoverEditModal(false)}
            >
              <BlurView intensity={80} tint="dark" style={styles.albumModalContainer}>
                <TouchableWithoutFeedback onPress={() => setShowCoverEditModal(false)}>
                  <View style={styles.albumModalBackdrop} />
                </TouchableWithoutFeedback>
                <KeyboardAvoidingView
                  behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                  style={styles.keyboardAvoidingView}
                >
                  <View style={styles.albumModalContent}>
                    {/* Header */}
                    <View style={styles.albumModalHeader}>
                      <Text style={styles.albumModalTitle}>
                        {editAlbumStep === 'fontStyle' ? t('memories.album.fontStyle') : editAlbumStep === 'name' ? t('memories.album.name') : t('memories.album.coverPhoto')}
                      </Text>
                      <Pressable
                        style={styles.albumModalCloseButton}
                        onPress={() => setShowCoverEditModal(false)}
                      >
                        <X color="rgba(255,255,255,0.8)" size={20} />
                      </Pressable>
                    </View>
                    <View style={styles.albumModalHeaderDivider} />

                    {editAlbumStep === 'fontStyle' ? (
                      <>
                        {/* Step 0: Font Style Selection */}
                        <Text style={styles.albumModalSubtitle}>
                          {t('memories.album.fontStyleDesc')}
                        </Text>

                        <View style={styles.fontStyleOptions}>
                          {/* Basic Font Option */}
                          <Pressable
                            style={[
                              styles.fontStyleOption,
                              editFontStyle === 'basic' && styles.fontStyleOptionSelected,
                            ]}
                            onPress={() => setEditFontStyle('basic')}
                          >
                            <Text style={styles.fontStylePreviewBasic}>{t('memories.album.basicFont')}</Text>
                            <Text style={styles.fontStyleLabel}>{t('memories.album.basicFontDesc')}</Text>
                          </Pressable>

                          {/* Ransom Font Option */}
                          <Pressable
                            style={[
                              styles.fontStyleOption,
                              editFontStyle === 'ransom' && styles.fontStyleOptionSelected,
                            ]}
                            onPress={() => {
                              setEditFontStyle('ransom');
                              // Clear text if it contains Korean characters (not supported in ransom style)
                              if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(editAlbumName)) {
                                setEditAlbumName('');
                              }
                            }}
                          >
                            <View style={styles.fontStylePreviewRansom}>
                              <View style={[styles.ransomMiniBox, { backgroundColor: '#FFE4E1', transform: [{ rotate: '-5deg' }] }]}>
                                <Text style={[styles.ransomMiniText, { fontFamily: 'PermanentMarker_400Regular' }]}>F</Text>
                              </View>
                              <View style={[styles.ransomMiniBox, { backgroundColor: '#E6F3FF', transform: [{ rotate: '3deg' }], borderRadius: 12 }]}>
                                <Text style={[styles.ransomMiniText, { fontFamily: 'Pacifico_400Regular' }]}>O</Text>
                              </View>
                              <View style={[styles.ransomMiniBox, { backgroundColor: '#FFFACD', transform: [{ rotate: '-2deg' }] }]}>
                                <Text style={[styles.ransomMiniText, { fontFamily: 'SpecialElite_400Regular' }]}>N</Text>
                              </View>
                              <View style={[styles.ransomMiniBox, { backgroundColor: '#E8F5E9', transform: [{ rotate: '4deg' }] }]}>
                                <Text style={[styles.ransomMiniText, { fontFamily: 'RockSalt_400Regular' }]}>T</Text>
                              </View>
                            </View>
                            <Text style={styles.fontStyleLabel}>{t('memories.album.ransomStyle')}</Text>
                          </Pressable>
                        </View>

                        <Pressable
                          style={[
                            styles.albumModalButton,
                            { width: '100%' },
                            !editFontStyle && styles.albumModalButtonDisabled,
                          ]}
                          onPress={() => setEditAlbumStep('name')}
                          disabled={!editFontStyle}
                        >
                          <Text style={styles.albumModalButtonText}>{t('common.next')}</Text>
                        </Pressable>
                      </>
                    ) : editAlbumStep === 'name' ? (
                      <>
                        {/* Step 1: Album Name Input */}
                        <Text style={styles.albumModalSubtitle}>
                          {editFontStyle === 'basic' ? t('memories.album.basicFontHint') : t('memories.album.ransomFontHint')}
                        </Text>

                        {/* Text Preview - Basic or Ransom Style */}
                        <View style={styles.ransomPreviewContainer}>
                          {editAlbumName.length > 0 ? (
                            editFontStyle === 'basic' ? (
                              <Text style={styles.basicFontPreview}>{editAlbumName}</Text>
                            ) : (
                              <RansomText
                                text={editAlbumName}
                                seed={editRansomSeed}
                                characterSize={36}
                                spacing={-4}
                                enableRotation={true}
                                enableYOffset={true}
                              />
                            )
                          ) : (
                            <Text style={[styles.ransomPlaceholder, editFontStyle === 'basic' && { fontFamily: 'Jua_400Regular' }]}>{t('memories.album.name')}</Text>
                          )}
                          {/* Refresh Button for Ransom Style */}
                          {editFontStyle === 'ransom' && editAlbumName.length > 0 && (
                            <Pressable
                              style={styles.refreshButton}
                              onPress={() => setEditRansomSeed(Math.floor(Math.random() * 1000000))}
                            >
                              <RefreshCw color="rgba(255, 255, 255, 0.6)" size={18} />
                            </Pressable>
                          )}
                        </View>

                        {/* Text Input */}
                        <TextInput
                          style={styles.albumNameInput}
                          value={editAlbumName}
                          onChangeText={handleEditAlbumNameChange}
                          placeholder={editFontStyle === 'ransom' ? t('memories.album.ransomPlaceholder') : t('memories.album.namePlaceholder')}
                          placeholderTextColor="rgba(255,255,255,0.4)"
                          maxLength={20}
                          autoFocus
                        />

                        {/* Button Row - Previous and Next */}
                        <View style={styles.albumModalButtonRow}>
                          <Pressable
                            style={styles.albumModalButtonSecondary}
                            onPress={() => setEditAlbumStep('fontStyle')}
                          >
                            <Text style={styles.albumModalButtonSecondaryText}>{t('common.back')}</Text>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.albumModalButton,
                              !editAlbumName.trim() && styles.albumModalButtonDisabled,
                            ]}
                            onPress={() => setEditAlbumStep('cover')}
                            disabled={!editAlbumName.trim()}
                          >
                            <Text style={styles.albumModalButtonText}>{t('common.next')}</Text>
                          </Pressable>
                        </View>
                      </>
                    ) : (
                      <>
                        {/* Step 2: Cover Photo Selection with Draggable Text */}
                        <Text style={styles.albumModalSubtitle}>
                          {t('memories.album.coverEditHint')}
                        </Text>

                        {/* Cover Photo Preview with Draggable Text */}
                        <View style={styles.coverPhotoContainer}>
                          <View style={styles.coverPhotoPickerContainer} onLayout={handleEditContainerLayout}>
                            {/* Book Spine - Inward Curve Effect */}
                            <LinearGradient
                              colors={['rgba(0, 0, 0, 0.65)', 'rgba(0, 0, 0, 0.35)', 'rgba(0, 0, 0, 0.12)', 'rgba(255, 255, 255, 0.08)', 'transparent']}
                              locations={[0, 0.25, 0.55, 0.8, 1]}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 0 }}
                              style={styles.modalBookSpineCurve}
                            />

                            <Pressable
                              style={styles.coverPhotoInner}
                              onPress={handlePickEditCoverPhoto}
                            >
                              {editCoverPhoto ? (
                                <ExpoImage
                                  source={{ uri: editCoverPhoto }}
                                  style={styles.coverPhotoPreview}
                                  contentFit="cover"
                                  cachePolicy="memory-disk"
                                  transition={100}
                                />
                              ) : (
                                <View style={styles.coverPhotoPlaceholder}>
                                  <Plus color="rgba(255,255,255,0.6)" size={40} />
                                  <Text style={styles.coverPhotoPlaceholderText}>{t('memories.album.selectPhoto')}</Text>
                                </View>
                              )}
                            </Pressable>

                            {/* Draggable Album Name Overlay */}
                            {editCoverPhoto && (
                              <Animated.View
                                {...editPanResponder.panHandlers}
                                style={[
                                  styles.draggableTextOverlay,
                                  {
                                    transform: [
                                      { translateX: editPanPosition.x },
                                      { translateY: editPanPosition.y },
                                    ],
                                  },
                                ]}
                              >
                                {editFontStyle === 'basic' ? (
                                  <Text style={[
                                    styles.basicFontOverlay,
                                    {
                                      fontSize: 16 * editTextScale,
                                      color: textColor === 'black' ? '#000000' : COLORS.white,
                                    }
                                  ]}>{editAlbumName}</Text>
                                ) : (
                                  <RansomText
                                    text={editAlbumName}
                                    seed={editRansomSeed}
                                    characterSize={18 * editTextScale}
                                    spacing={-4}
                                    enableRotation={true}
                                    enableYOffset={true}
                                  />
                                )}
                              </Animated.View>
                            )}
                          </View>
                        </View>

                        {/* Drag instruction */}
                        {editCoverPhoto && (
                          <Text style={styles.dragHintText}>{t('memories.album.dragHint')}</Text>
                        )}

                        {/* Text Style Selection - Different UI based on font style */}
                        {editCoverPhoto && editFontStyle === 'basic' && (
                          <View style={styles.textStyleSelectionContainer}>
                            {/* Color Selection (Left) */}
                            <View style={styles.colorSelectionSection}>
                              <Text style={styles.selectionLabel}>{t('memories.album.color')}</Text>
                              <View style={styles.colorButtonRow}>
                                <Pressable
                                  style={[
                                    styles.colorButton,
                                    { backgroundColor: '#000000' },
                                    textColor === 'black' && styles.colorButtonSelected,
                                  ]}
                                  onPress={() => setTextColor('black')}
                                />
                                <Pressable
                                  style={[
                                    styles.colorButton,
                                    { backgroundColor: '#FFFFFF' },
                                    textColor === 'white' && styles.colorButtonSelected,
                                  ]}
                                  onPress={() => setTextColor('white')}
                                />
                              </View>
                            </View>

                            {/* Size Selection (Right) */}
                            <View style={styles.sizeSelectionSection}>
                              <Text style={styles.selectionLabel}>{t('memories.album.size')}</Text>
                              <View style={styles.sizeButtonRow}>
                                {[1.5, 2.25, 3.0].map((scale, index) => (
                                  <Pressable
                                    key={index}
                                    style={[
                                      styles.sizeButton,
                                      editTextScale === scale && styles.sizeButtonSelected,
                                    ]}
                                    onPress={() => setEditTextScale(scale)}
                                  >
                                    <Text style={[
                                      styles.sizeButtonText,
                                      { fontSize: 10 + index * 7 },
                                      editTextScale === scale && styles.sizeButtonTextSelected,
                                    ]}>A</Text>
                                  </Pressable>
                                ))}
                              </View>
                            </View>
                          </View>
                        )}

                        {/* Ransom Style - Size Only */}
                        {editCoverPhoto && editFontStyle === 'ransom' && (
                          <View style={styles.sizeSelectionContainer}>
                            <Text style={styles.sizeSelectionLabel}>{t('memories.album.textSize')}</Text>
                            <View style={styles.sizeButtonRow}>
                              {[1.0, 1.5, 2.0].map((scale, index) => (
                                <Pressable
                                  key={index}
                                  style={[
                                    styles.sizeButton,
                                    editTextScale === scale && styles.sizeButtonSelected,
                                  ]}
                                  onPress={() => setEditTextScale(scale)}
                                >
                                  <Text style={[
                                    styles.sizeButtonText,
                                    { fontSize: 10 + index * 7 },
                                    editTextScale === scale && styles.sizeButtonTextSelected,
                                  ]}>A</Text>
                                </Pressable>
                              ))}
                            </View>
                          </View>
                        )}

                        {/* Action Buttons */}
                        <View style={styles.albumModalButtonRow}>
                          <Pressable
                            style={styles.albumModalButtonSecondary}
                            onPress={() => setEditAlbumStep('name')}
                          >
                            <Text style={styles.albumModalButtonSecondaryText}>{t('common.back')}</Text>
                          </Pressable>
                          <Pressable
                            style={[
                              styles.albumModalButton,
                              !editCoverPhoto && styles.albumModalButtonDisabled
                            ]}
                            onPress={handleSaveEdit}
                            disabled={!editCoverPhoto}
                          >
                            <Text style={[
                              styles.albumModalButtonText,
                              !editCoverPhoto && styles.albumModalButtonTextDisabled
                            ]}>{t('common.done')}</Text>
                          </Pressable>
                        </View>
                      </>
                    )}
                  </View>
                </KeyboardAvoidingView>
              </BlurView>
            </Modal>
          )}
        </Animated.View>
      </Modal>

    </View>
  );
}

// Photo Detail View Component with Flip Card
// Individual flip card item component for FlatList
function FlipCardItem({
  mission,
  isActive,
}: {
  mission: MemoryType;
  isActive: boolean;
}) {
  const { user, partner, couple } = useAuthStore();
  const { data: onboardingData } = useOnboardingStore();
  const [isFlipped, setIsFlipped] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;

  // Reset flip state when card becomes inactive
  useEffect(() => {
    if (!isActive && isFlipped) {
      setIsFlipped(false);
      flipAnim.setValue(0);
    }
  }, [isActive]);

  // Format date
  const date = new Date(mission.completedAt);
  const formattedDate = `${date.getFullYear()}.${(date.getMonth() + 1)
    .toString()
    .padStart(2, '0')}.${date.getDate().toString().padStart(2, '0')}`;
  const formattedTime = `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;

  // Determine nicknames based on couple order (user1Message is always from couple.user1)
  // This ensures consistent display order regardless of who's viewing
  const isCurrentUserCoupleUser1 = user?.id === couple?.user1Id;
  const user1Nickname = isCurrentUserCoupleUser1
    ? (user?.nickname || onboardingData.nickname || t('common.me'))
    : (partner?.nickname || t('common.partner'));
  const user2Nickname = isCurrentUserCoupleUser1
    ? (partner?.nickname || t('common.partner'))
    : (user?.nickname || onboardingData.nickname || t('common.me'));

  // Handle flip
  const handleFlip = () => {
    const toValue = isFlipped ? 0 : 1;
    Animated.spring(flipAnim, {
      toValue,
      useNativeDriver: true,
      friction: 8,
      tension: 10,
    }).start();
    setIsFlipped(!isFlipped);
  };

  // Flip interpolations
  const frontInterpolate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const backInterpolate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });

  return (
    <View style={styles.flatListCardWrapper}>
      <View style={styles.flipCardContainer}>
        <Pressable onPress={handleFlip} style={styles.flipCardPressable}>
          {/* Front - Photo */}
          <Animated.View
            style={[
              styles.flipCardFace,
              { transform: [{ perspective: 1000 }, { rotateY: frontInterpolate }] },
            ]}
          >
            <ExpoImage
              source={{ uri: mission.photoUrl }}
              style={styles.flipCardImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={100}
            />
          </Animated.View>

          {/* Back - Info */}
          <Animated.View
            style={[
              styles.flipCardFace,
              styles.flipCardBack,
              { transform: [{ perspective: 1000 }, { rotateY: backInterpolate }] },
            ]}
          >
            <View style={styles.flipCardBackContent}>
              <View style={styles.flipCardBackTop}>
                <Text style={styles.flipCardTitle} allowFontScaling={false}>
                  {mission.mission?.title || t('memories.togetherMoment')}
                </Text>
                <View style={styles.flipCardInfoSection}>
                  <View style={styles.flipCardInfoRow}>
                    <MapPin color="rgba(255,255,255,0.9)" size={16} />
                    <Text style={styles.flipCardInfoText} allowFontScaling={false}>
                      {mission.location}
                    </Text>
                  </View>
                  <View style={styles.flipCardInfoRow}>
                    <Clock color="rgba(255,255,255,0.9)" size={16} />
                    <Text style={styles.flipCardInfoText} allowFontScaling={false}>
                      {formattedDate} {formattedTime}
                    </Text>
                  </View>
                </View>
                <View style={styles.flipCardDivider} />
              </View>
              <View style={styles.flipCardMessages}>
                {mission.user1Message && (
                  <View style={styles.flipCardMessageItem}>
                    <Text style={styles.flipCardMessageLabel} allowFontScaling={false}>
                      {user1Nickname}
                    </Text>
                    <Text style={styles.flipCardMessageText} allowFontScaling={false}>
                      {mission.user1Message}
                    </Text>
                  </View>
                )}
                {mission.user2Message && (
                  <View style={styles.flipCardMessageItem}>
                    <Text style={styles.flipCardMessageLabel} allowFontScaling={false}>
                      {user2Nickname}
                    </Text>
                    <Text style={styles.flipCardMessageText} allowFontScaling={false}>
                      {mission.user2Message}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          </Animated.View>
        </Pressable>
      </View>
    </View>
  );
}

// Background image component with animated opacity and scale
function CarouselBackgroundImage({
  image,
  index,
  scrollX,
}: {
  image: string;
  index: number;
  scrollX: { value: number };
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollX.value,
      [(index - 1) * width, index * width, (index + 1) * width],
      [0, 1, 0],
      Extrapolation.CLAMP
    );

    const scale = interpolate(
      scrollX.value,
      [(index - 1) * width, index * width, (index + 1) * width],
      [1.2, 1, 1.2],
      Extrapolation.CLAMP
    );

    return {
      opacity,
      transform: [{ scale }],
    };
  });

  return (
    <ReanimatedModule.View style={[StyleSheet.absoluteFill, animatedStyle]}>
      <ExpoImage
        source={{ uri: image }}
        style={StyleSheet.absoluteFill}
        blurRadius={18}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={100}
        placeholder="L6PZfSi_.AyE_3t7t7R**0LTIpIp"
      />
    </ReanimatedModule.View>
  );
}

// Carousel card wrapper (no scale to prevent text blur)
function CarouselCardWrapper({
  mission,
  index,
  scrollX,
  currentIndex,
}: {
  mission: MemoryType;
  index: number;
  scrollX: { value: number };
  currentIndex: number;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const inputRange = [(index - 1) * width, index * width, (index + 1) * width];

    const opacity = interpolate(
      scrollX.value,
      inputRange,
      [0, 1, 0],
      Extrapolation.CLAMP
    );

    const scale = interpolate(
      scrollX.value,
      inputRange,
      [0.9, 1, 0.9],
      Extrapolation.CLAMP
    );

    return {
      opacity,
      transform: [{ scale }],
    };
  });

  return (
    <ReanimatedModule.View style={[styles.carouselCardContainer, animatedStyle]}>
      <FlipCardItem mission={mission} isActive={index === currentIndex} />
    </ReanimatedModule.View>
  );
}

function PhotoDetailView({
  missions,
  initialPhoto,
  onClose,
  onDelete,
}: {
  missions: MemoryType[];
  initialPhoto: MemoryType;
  onClose: () => void;
  onDelete: (memoryId: string) => void | Promise<void>;
}) {
  const initialIndex = missions.findIndex((m) => m.id === initialPhoto.id);
  const [currentIndex, setCurrentIndex] = useState(
    initialIndex >= 0 ? initialIndex : 0
  );
  const [localMissions, setLocalMissions] = useState<MemoryType[]>(missions);
  const scrollViewRef = useRef<any>(null);

  // Prefetch all photos for instant display when swiping
  useEffect(() => {
    missions.forEach(mission => {
      if (mission.photoUrl) {
        ExpoImage.prefetch(mission.photoUrl).catch(() => {});
      }
    });
  }, [missions]);

  // Update local missions when parent missions change (including external deletions by partner)
  useEffect(() => {
    // Check if the currently viewed photo was deleted externally (by partner)
    const currentPhoto = localMissions[currentIndex];
    const currentPhotoStillExists = currentPhoto ? missions.some(m => m.id === currentPhoto.id) : false;

    // Update local missions to sync with parent
    setLocalMissions(missions);

    // Handle external deletion of the current photo
    if (currentPhoto && !currentPhotoStillExists) {
      console.log('[PhotoDetailView] Current photo was deleted externally');

      if (missions.length === 0) {
        // No photos left - close the view
        console.log('[PhotoDetailView] No photos remaining, closing view');
        onClose();
        return;
      }

      // Navigate to adjacent photo (prefer previous, fallback to next)
      const newIndex = Math.min(currentIndex, missions.length - 1);
      console.log('[PhotoDetailView] Navigating to index:', newIndex);
      setCurrentIndex(newIndex);

      // Scroll to the adjusted position
      setTimeout(() => {
        if (scrollViewRef.current) {
          scrollViewRef.current?.scrollTo({
            x: newIndex * width,
            animated: false,
          });
        }
      }, 50);
      return;
    }

    // Adjust currentIndex if it's now out of bounds
    if (currentIndex >= missions.length && missions.length > 0) {
      const newIndex = missions.length - 1;
      setCurrentIndex(newIndex);
      // Scroll to the adjusted position
      setTimeout(() => {
        if (scrollViewRef.current) {
          scrollViewRef.current?.scrollTo({
            x: newIndex * width,
            animated: false,
          });
        }
      }, 50);
    }
  }, [missions]);

  // Track current flip state for instruction text
  const [isFlipped, setIsFlipped] = useState(false);

  // Dropdown menu state
  const [showPhotoDetailMenu, setShowPhotoDetailMenu] = useState(false);

  // Animation values for smooth entrance
  const animProgress = useSharedValue(0);

  // Reanimated scroll value
  const scrollX = useSharedValue(initialIndex >= 0 ? initialIndex * width : 0);

  // Background fade style (simple fade)
  const backgroundFadeStyle = useAnimatedStyle(() => ({
    opacity: animProgress.value,
  }));

  // Content animated style (fade + scale + slide)
  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: animProgress.value,
    transform: [
      { scale: interpolate(animProgress.value, [0, 1], [0.92, 1]) },
      { translateY: interpolate(animProgress.value, [0, 1], [30, 0]) },
    ],
  }));

  // Handle download photo to gallery
  const handleDownload = useCallback(async () => {
    const currentMission = localMissions[currentIndex];
    if (!currentMission?.photoUrl) return;

    try {
      // Request permission
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(t('memories.permission.required'), t('memories.permission.saveAccess'));
        return;
      }

      // Download image using new expo-file-system API
      const filename = `daydate_${Date.now()}.jpg`;
      const destination = new ExpoFile(Paths.cache, filename);

      // Use static method to download
      const downloadedFile = await ExpoFile.downloadFileAsync(currentMission.photoUrl, destination);

      // Save to media library
      await MediaLibrary.saveToLibraryAsync(downloadedFile.uri);
      Alert.alert(t('memories.permission.saveSuccess'), t('memories.permission.saveSuccessMessage'));

      // Clean up temp file
      await downloadedFile.delete();
    } catch (error) {
      console.log('Download error:', error);
      Alert.alert(t('memories.permission.saveFailed'), t('memories.permission.saveFailedMessage'));
    }
  }, [currentIndex, localMissions]);

  // Animated scroll handler (direct value without spring for better text rendering)
  const onScrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollX.value = event.contentOffset.x;
    },
  });

  // Scroll to initial index after mount and trigger entrance animation
  useEffect(() => {
    if (scrollViewRef.current && initialIndex > 0) {
      scrollViewRef.current?.scrollTo({
        x: initialIndex * width,
        animated: false,
      });
    }
    // Start entrance animation with natural easing
    const timer = setTimeout(() => {
      animProgress.value = withTiming(1, {
        duration: 350,
        easing: Easing.out(Easing.cubic),
      });
    }, 20);
    return () => clearTimeout(timer);
  }, []);

  // Handle scroll end to update current index
  const handleMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetX = event.nativeEvent.contentOffset.x;
      const newIndex = Math.round(offsetX / width);
      if (newIndex !== currentIndex && newIndex >= 0 && newIndex < localMissions.length) {
        setCurrentIndex(newIndex);
        setIsFlipped(false);
      }
    },
    [currentIndex, localMissions.length]
  );

  return (
    <View style={styles.carouselContainer}>
      {/* Solid black background - always visible to prevent flickering */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} />

      {/* Background with smooth fade animation */}
      <ReanimatedModule.View style={[StyleSheet.absoluteFill, backgroundFadeStyle]}>
        {/* Animated Background Images with Blur */}
        <View style={StyleSheet.absoluteFill}>
          {localMissions.map((mission, index) => (
            <CarouselBackgroundImage
              key={`background_${mission.id}`}
              image={mission.photoUrl}
              index={index}
              scrollX={scrollX}
            />
          ))}
        </View>

        {/* Dark overlay for better card visibility */}
        <View style={styles.carouselOverlay} />
      </ReanimatedModule.View>

      {/* Top Buttons - Close (left) and More Options (right) */}
      <View style={styles.photoDetailTopButtonsContainer}>
        <Pressable style={styles.photoDetailButton} onPress={onClose}>
          <X color={COLORS.white} size={20} />
        </Pressable>
        <Pressable
          style={styles.photoDetailButton}
          onPress={() => setShowPhotoDetailMenu(!showPhotoDetailMenu)}
        >
          <MoreHorizontal color={COLORS.white} size={20} />
        </Pressable>
      </View>

      {/* Photo Detail Dropdown Menu */}
      {showPhotoDetailMenu && (
        <Pressable
          style={styles.photoDetailMenuOverlay}
          onPress={() => setShowPhotoDetailMenu(false)}
        >
          <BlurView intensity={50} tint="dark" style={styles.photoDetailMenuDropdown}>
            <Pressable
              style={styles.photoDetailMenuItem}
              onPress={() => {
                setShowPhotoDetailMenu(false);
                handleDownload();
              }}
            >
              <Download color={COLORS.white} size={18} />
              <Text style={styles.photoDetailMenuItemText}>{t('memories.photo.save')}</Text>
            </Pressable>
            <Pressable
              style={[styles.photoDetailMenuItem, styles.photoDetailMenuItemDanger]}
              onPress={() => {
                setShowPhotoDetailMenu(false);
                const currentMission = localMissions[currentIndex];
                Alert.alert(
                  t('memories.photo.deleteTitle'),
                  t('memories.photo.deleteSingleConfirm'),
                  [
                    { text: t('common.cancel'), style: 'cancel' },
                    {
                      text: t('common.delete'),
                      style: 'destructive',
                      onPress: async () => {
                        // Calculate remaining photos after deletion
                        const remainingPhotos = localMissions.length - 1;

                        if (remainingPhotos <= 0) {
                          // No photos left after deletion - close the view
                          await onDelete(currentMission.id);
                          onClose();
                        } else {
                          // Calculate the target index BEFORE removing the photo
                          // User requested: show previous photo, or next if no previous
                          const deletedIndex = currentIndex;
                          const targetIndex = deletedIndex > 0 ? deletedIndex - 1 : 0;

                          // Remove photo from local state
                          const newMissions = localMissions.filter(m => m.id !== currentMission.id);
                          setLocalMissions(newMissions);
                          setCurrentIndex(targetIndex);

                          // Scroll to the target position after state update
                          // Use setTimeout to ensure the scroll happens after React re-renders
                          setTimeout(() => {
                            if (scrollViewRef.current) {
                              scrollViewRef.current?.scrollTo({
                                x: targetIndex * width,
                                animated: false, // No animation to prevent visual jumping
                              });
                            }
                          }, 50);

                          // Delete from DB in background
                          await onDelete(currentMission.id);
                        }
                      }
                    }
                  ]
                );
              }}
            >
              <Trash2 color="#FF6B6B" size={18} />
              <Text style={[styles.photoDetailMenuItemText, { color: '#FF6B6B' }]}>{t('memories.photo.delete')}</Text>
            </Pressable>
          </BlurView>
        </Pressable>
      )}

      {/* Content with smooth entrance animation (fade + scale + slide) */}
      <ReanimatedModule.View style={[{ flex: 1 }, contentAnimStyle]}>
        {/* Instruction Text */}
        <View style={styles.flipInstructionContainer}>
          <View style={styles.flipInstructionBadge}>
            <Text style={styles.flipInstructionText}>
              {isFlipped ? t('memories.photo.tapToView') : t('memories.photo.tapToFlip')}
            </Text>
          </View>
        </View>

        {/* Carousel ScrollView */}
        <ReanimatedModule.ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={onScrollHandler}
          onMomentumScrollEnd={handleMomentumScrollEnd}
          scrollEventThrottle={16}
          decelerationRate="fast"
          bounces={true}
          alwaysBounceHorizontal={true}
          contentContainerStyle={styles.carouselScrollContent}
        >
          {localMissions.map((mission, index) => (
            <CarouselCardWrapper
              key={`card_${mission.id}`}
              mission={mission}
              index={index}
              scrollX={scrollX}
              currentIndex={currentIndex}
            />
          ))}
        </ReanimatedModule.ScrollView>

        {/* Photo Counter */}
        <View style={styles.photoCounterContainer}>
          <View style={styles.photoCounterBadge}>
            <Text style={styles.photoCounterText}>
              {currentIndex + 1} / {localMissions.length}
            </Text>
          </View>
        </View>
      </ReanimatedModule.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  backgroundImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  backgroundImageStyle: {
    ...StyleSheet.absoluteFillObject,
    transform: [{ scale: 1.0 }],
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  topFadeOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 50,
    zIndex: 10,
  },
  header: {
    paddingTop: 64,
    paddingHorizontal: SPACING.lg,
    paddingBottom: SPACING.lg,
    zIndex: 20,
  },
  headerTitle: {
    fontSize: 32,
    color: COLORS.white,
    fontWeight: '700',
    lineHeight: 38,
  },
  headerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '400',
    marginTop: 4,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
  },
  emptyText: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    lineHeight: 24,
  },
  emptyMissionCard: {
    padding: 24,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    width: '100%',
  },
  emptyMissionText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 8,
  },
  emptyMissionHint: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    textAlign: 'center',
    lineHeight: 20,
  },
  mainContent: {
    flex: 1,
  },
  mainContentContainer: {
    paddingBottom: 120,
  },
  yearSection: {
    marginTop: SPACING.md,
    marginBottom: SPACING.xl,
  },
  yearHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
  },
  yearTitle: {
    fontSize: 20,
    color: COLORS.white,
    fontWeight: '700',
  },
  yearPickerButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING.xs,
  },
  yearPickerDropdown: {
    marginHorizontal: SPACING.lg,
    marginBottom: SPACING.md,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    padding: SPACING.xs,
    width: 128,
  },
  yearPickerItem: {
    paddingVertical: 10,
    paddingHorizontal: SPACING.md,
    borderRadius: 12,
  },
  yearPickerItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  yearPickerItemText: {
    fontSize: 15,
    color: COLORS.white,
    textAlign: 'center',
  },
  yearPickerItemTextActive: {
    fontWeight: '600',
  },
  monthCardsContainer: {
    paddingHorizontal: SPACING.lg,
    gap: 12,
  },
  monthCard: {
    width: ALBUM_CARD_WIDTH, // Match album card width (140px)
  },
  monthCardInner: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  monthCardImage: {
    width: '100%',
    aspectRatio: 1,
  },
  monthBadge: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  monthBadgeText: {
    fontSize: 13,
    color: COLORS.white,
    fontWeight: '600',
  },
  multipleIcon: {
    position: 'absolute',
    top: 12,
    right: 12,
  },
  stackIcon: {
    width: 14,
    height: 14,
    position: 'relative',
  },
  stackBack: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.15)',
  },
  stackFront: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.15)',
  },
  collageSection: {
    paddingHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  collageSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  collageSectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.white,
  },
  albumIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createAlbumButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createAlbumButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
  collageSectionSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: SPACING.md,
  },
  monthModalContainer: {
    flex: 1,
  },
  missionPickerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  monthModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  coverPickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  coverPickerHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  monthModalContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '90%',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  monthModalCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: 32,
    paddingBottom: SPACING.lg,
  },
  monthModalTitle: {
    fontSize: 28,
    color: COLORS.white,
    fontWeight: '700',
  },
  monthModalCount: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '500',
    marginTop: 8,
  },
  monthModalGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.lg - 1,
    gap: 2,
  },
  monthModalItem: {
    width: (width - SPACING.lg * 2 - 4) / 3,
    aspectRatio: 1,
  },
  monthModalItemInner: {
    flex: 1,
    backgroundColor: '#222',
    overflow: 'hidden',
  },
  monthModalItemImage: {
    width: '100%',
    height: '100%',
  },
  photoDetailContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.lg,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  // Carousel styles
  carouselContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  carouselOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  carouselScrollContent: {
    alignItems: 'center',
  },
  carouselCardContainer: {
    width: width,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 0,
    },
    shadowRadius: 20,
    shadowOpacity: 0.5,
    elevation: 10,
  },
  photoDetailBackgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  photoDetailTopButtons: {
    position: 'absolute',
    top: 48,
    right: 24,
    flexDirection: 'row',
    gap: 12,
    zIndex: 10,
  },
  photoDetailTopButtonsContainer: {
    position: 'absolute',
    top: 48,
    left: 24,
    right: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  photoDetailMenuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },
  photoDetailMenuDropdown: {
    position: 'absolute',
    top: 96,
    right: 24,
    borderRadius: 12,
    paddingVertical: 6,
    minWidth: 120,
    zIndex: 100,
    overflow: 'hidden',
  },
  photoDetailMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 10,
  },
  photoDetailMenuItemDanger: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  photoDetailMenuItemText: {
    fontSize: 16,
    color: COLORS.white,
    fontWeight: '500',
  },
  photoDetailButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoDetailCloseButton: {
    position: 'absolute',
    top: 48,
    right: 24,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  photoDetailCard: {
    width: '90%',
    aspectRatio: 3 / 4,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  photoDetailImage: {
    width: '100%',
    height: '100%',
  },
  photoInfoCard: {
    width: '90%',
    marginTop: SPACING.lg,
    padding: SPACING.lg,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  photoInfoTitle: {
    fontSize: 20,
    color: COLORS.white,
    fontWeight: '700',
    marginBottom: SPACING.md,
  },
  photoInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: SPACING.xs,
  },
  photoInfoText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
  },
  photoMessages: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
    gap: SPACING.md,
  },
  photoMessageItem: {},
  photoMessageLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '600',
    marginBottom: 4,
  },
  photoMessageText: {
    fontSize: 15,
    color: COLORS.white,
    lineHeight: 22,
  },
  // Flip Card Styles
  flipInstructionContainer: {
    position: 'absolute',
    top: 140,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  flipInstructionBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  flipInstructionText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '400',
  },
  singleCardContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoFlatList: {
    flex: 1,
  },
  flatListCardWrapper: {
    width: width,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: width * 0.05,
  },
  flipCardContainer: {
    width: '90%',
    aspectRatio: 3 / 4,
  },
  flipCardPressable: {
    width: '100%',
    height: '100%',
  },
  flipCardFace: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backfaceVisibility: 'hidden',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  flipCardBack: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  flipCardImage: {
    width: '100%',
    height: '100%',
  },
  flipCardBackGradient: {
    flex: 1,
    borderRadius: 16,
  },
  flipCardBackContent: {
    flex: 1,
    padding: 24,
    backgroundColor: '#1a1a1a',
    borderRadius: 16,
  },
  flipCardBackTop: {
    marginBottom: 16,
  },
  flipCardTitle: {
    fontSize: 22,
    color: COLORS.white,
    fontWeight: '700',
    marginBottom: 16,
    lineHeight: 28,
  },
  flipCardInfoSection: {
    gap: 8,
    marginBottom: 16,
  },
  flipCardInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  flipCardInfoText: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '400',
  },
  flipCardDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  flipCardMessages: {
    flex: 1,
    justifyContent: 'center',
    gap: 20,
  },
  flipCardMessageItem: {
    gap: 4,
  },
  flipCardMessageLabel: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    fontWeight: '600',
  },
  flipCardMessageText: {
    fontSize: 15,
    color: COLORS.white,
    fontWeight: '400',
    lineHeight: 22,
  },
  photoCounterContainer: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  photoCounterBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  photoCounterText: {
    fontSize: 13,
    color: COLORS.white,
    fontWeight: '600',
  },
  // Album List Styles
  albumsListContainer: {
    marginHorizontal: -SPACING.lg,
  },
  albumsList: {
    paddingHorizontal: SPACING.lg,
    gap: 12,
  },
  albumItem: {
    width: 140,
  },
  hardcoverBook: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
    // Book shadow
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  bookFullPhoto: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  bookPlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(40, 40, 40, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookSpineCurve: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 20,
    zIndex: 10,
  },
  albumCoverWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 4,
    overflow: 'hidden',
  },
  coverTextureOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
  },
  coverEdgeHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
    // Inner highlight
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
    borderRightColor: 'rgba(255, 255, 255, 0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  albumCover: {
    width: '100%',
    height: '100%',
  },
  albumCoverPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(40, 40, 40, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  albumNameOverlay: {
    position: 'absolute',
    maxWidth: ALBUM_CARD_WIDTH * 0.80, // 80% of album card width (140 * 0.80 = 112px), matches modal's draggableTextOverlay ratio
  },
  albumNameContainer: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'flex-start',
  },
  wordContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 1,
    maxWidth: '100%',
  },
  wordContainerTiny: {
    flexDirection: 'row',
    flexWrap: 'nowrap', // Keep word characters together, prevent mid-word breaks
    alignItems: 'flex-start',
    justifyContent: 'center',
    maxWidth: '100%',
  },
  // Space styles for ransom note
  ransomSpace: {
    width: 8,
    height: 20,
  },
  ransomSpaceLarge: {
    width: 12,
    height: 36,
  },
  ransomSpaceSmall: {
    width: 6,
    height: 18,
  },
  ransomSpaceTiny: {
    width: 3,
    height: 10,
  },
  // Torn paper base style
  ransomCharBox: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  ransomChar: {
    fontSize: 13,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  // Paper style variations (0-9) - torn paper effects
  paperStyle0: {
    // Rough torn edges - top left corner torn
    borderTopLeftRadius: 1,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 2,
    borderWidth: 0.5,
    borderColor: 'rgba(80, 60, 40, 0.15)',
  },
  paperStyle1: {
    // Magazine cutout - clean but slightly uneven
    borderTopLeftRadius: 2,
    borderTopRightRadius: 1,
    borderBottomLeftRadius: 1,
    borderBottomRightRadius: 3,
    shadowOffset: { width: 3, height: 4 },
    shadowOpacity: 0.3,
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.06)',
  },
  paperStyle2: {
    // Newspaper clipping - aged edges
    borderTopLeftRadius: 3,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 1,
    borderWidth: 0.8,
    borderColor: 'rgba(139, 119, 101, 0.25)',
    shadowOffset: { width: 1, height: 2 },
    shadowOpacity: 0.2,
  },
  paperStyle3: {
    // Torn notebook paper
    borderTopLeftRadius: 1,
    borderTopRightRadius: 3,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 4,
    shadowOffset: { width: 2, height: 3 },
    shadowOpacity: 0.35,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(200, 50, 50, 0.15)',
  },
  paperStyle4: {
    // Rough tear - jagged look
    borderTopLeftRadius: 4,
    borderTopRightRadius: 1,
    borderBottomLeftRadius: 1,
    borderBottomRightRadius: 5,
    shadowOffset: { width: 1, height: 4 },
    shadowOpacity: 0.28,
    borderWidth: 0.3,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  paperStyle5: {
    // Old book page
    borderTopLeftRadius: 2,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 2,
    borderWidth: 0.6,
    borderColor: 'rgba(101, 67, 33, 0.2)',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.22,
  },
  paperStyle6: {
    // Card stock - thicker paper feel
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 3,
    shadowOffset: { width: 3, height: 5 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    borderWidth: 0.4,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  paperStyle7: {
    // Sticky note style
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 1,
    shadowOffset: { width: 1, height: 3 },
    shadowOpacity: 0.2,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  paperStyle8: {
    // Ripped edge - bottom torn
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 4,
    shadowOffset: { width: 2, height: 4 },
    shadowOpacity: 0.32,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  paperStyle9: {
    // Vintage cutout
    borderTopLeftRadius: 5,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 6,
    borderWidth: 0.7,
    borderColor: 'rgba(139, 90, 43, 0.18)',
    shadowOffset: { width: 1, height: 2 },
    shadowOpacity: 0.25,
  },
  // Album Modal Styles
  albumModalFadeWrapper: {
    flex: 1,
  },
  albumModalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  albumModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  keyboardAvoidingView: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  albumModalContent: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 32,
    padding: 24,
    paddingBottom: 32,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  albumModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 0,
  },
  albumModalHeaderDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginTop: 16,
    marginBottom: 20,
    width: '100%',
  },
  albumModalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.white,
  },
  albumModalSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 20,
  },
  ransomPreviewContainer: {
    minHeight: 80,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    position: 'relative',
  },
  refreshButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ransomPreview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'flex-start',
    gap: 4,
    width: '100%',
  },
  wordContainerLarge: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: 2,
    maxWidth: '100%',
  },
  // Large preview torn paper style
  ransomPreviewCharBox: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 3, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  ransomPreviewChar: {
    fontSize: 26,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  basicFontPreview: {
    fontFamily: 'Jua_400Regular',
    fontSize: 28,
    color: COLORS.white,
    textAlign: 'center',
  },
  basicFontOverlay: {
    fontFamily: 'Jua_400Regular',
    color: COLORS.white,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  basicFontTiny: {
    fontFamily: 'Jua_400Regular',
    color: COLORS.white,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0.5, height: 0.5 },
    textShadowRadius: 2,
  },
  ransomPlaceholder: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.3)',
  },
  albumNameInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.white,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    marginBottom: 20,
  },
  albumModalButton: {
    flex: 1,
    backgroundColor: COLORS.white,
    borderRadius: 999,
    paddingVertical: 16,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumModalButtonDisabled: {
    opacity: 0.4,
  },
  albumModalButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  albumModalButtonTextDisabled: {
    color: 'rgba(26, 26, 26, 0.5)',
  },
  coverPhotoContainer: {
    width: '100%',
    position: 'relative',
    marginBottom: 12,
  },
  coverPhotoPickerContainer: {
    width: '100%',
    aspectRatio: 3 / 4, // 3:4 aspect ratio
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  modalBookSpineCurve: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 24,
    zIndex: 10,
  },
  coverPhotoInner: {
    width: '100%',
    height: '100%',
  },
  coverPhotoPreview: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  coverPhotoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  coverPhotoPlaceholderText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  draggableTextOverlay: {
    position: 'absolute',
    maxWidth: '80%',
    zIndex: 20,
  },
  albumNameContainerSmall: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'flex-start',
    gap: 2,
  },
  wordContainerSmall: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'flex-start',
    gap: 1,
  },
  dragHintText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    textAlign: 'center',
    marginBottom: 16,
  },
  // Size Selection Buttons
  textStyleSelectionContainer: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  colorSelectionSection: {
    alignItems: 'center',
  },
  sizeSelectionSection: {
    alignItems: 'center',
  },
  selectionLabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 10,
  },
  colorButtonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  colorButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  colorButtonSelected: {
    borderWidth: 3,
    borderColor: COLORS.white,
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  sizeSelectionContainer: {
    width: '100%',
    marginBottom: 16,
  },
  sizeSelectionLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 12,
    textAlign: 'center',
  },
  sizeButtonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  sizeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeButtonSelected: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderColor: COLORS.white,
  },
  sizeButtonText: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '700',
  },
  sizeButtonTextSelected: {
    color: COLORS.white,
  },
  albumNamePreviewSmall: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 3,
    marginBottom: 24,
  },
  // Small torn paper - for modal draggable text (larger modal view)
  ransomCharBoxSmall: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 2, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  ransomCharSmall: {
    fontSize: 13,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  // Tiny torn paper - for album list thumbnails (proportionally smaller ~0.56 ratio)
  ransomCharBoxTiny: {
    paddingHorizontal: 3,
    paddingVertical: 2,
    shadowColor: '#000',
    shadowOffset: { width: 1.1, height: 1.7 },
    shadowOpacity: 0.22,
    shadowRadius: 1.7,
    elevation: 2,
  },
  ransomCharTiny: {
    fontSize: 7,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  // Paper style variations for small boxes (0-9) - matching torn paper effects
  paperStyleSmall0: {
    borderTopLeftRadius: 1,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 2,
    borderWidth: 0.5,
    borderColor: 'rgba(80, 60, 40, 0.15)',
  },
  paperStyleSmall1: {
    borderTopLeftRadius: 2,
    borderTopRightRadius: 1,
    borderBottomLeftRadius: 1,
    borderBottomRightRadius: 3,
    shadowOffset: { width: 3, height: 4 },
    shadowOpacity: 0.3,
    borderRightWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.06)',
  },
  paperStyleSmall2: {
    borderTopLeftRadius: 3,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 1,
    borderWidth: 0.8,
    borderColor: 'rgba(139, 119, 101, 0.25)',
    shadowOffset: { width: 1, height: 2 },
    shadowOpacity: 0.2,
  },
  paperStyleSmall3: {
    borderTopLeftRadius: 1,
    borderTopRightRadius: 3,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 4,
    shadowOffset: { width: 2, height: 3 },
    shadowOpacity: 0.35,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(200, 50, 50, 0.15)',
  },
  paperStyleSmall4: {
    borderTopLeftRadius: 4,
    borderTopRightRadius: 1,
    borderBottomLeftRadius: 1,
    borderBottomRightRadius: 5,
    shadowOffset: { width: 1, height: 4 },
    shadowOpacity: 0.28,
    borderWidth: 0.3,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  paperStyleSmall5: {
    borderTopLeftRadius: 2,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 2,
    borderWidth: 0.6,
    borderColor: 'rgba(101, 67, 33, 0.2)',
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.22,
  },
  paperStyleSmall6: {
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 3,
    shadowOffset: { width: 3, height: 5 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    borderWidth: 0.4,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  paperStyleSmall7: {
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 1,
    shadowOffset: { width: 1, height: 3 },
    shadowOpacity: 0.2,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.05)',
  },
  paperStyleSmall8: {
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 5,
    borderBottomRightRadius: 4,
    shadowOffset: { width: 2, height: 4 },
    shadowOpacity: 0.32,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(0, 0, 0, 0.1)',
  },
  paperStyleSmall9: {
    borderTopLeftRadius: 5,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 6,
    borderWidth: 0.7,
    borderColor: 'rgba(139, 90, 43, 0.18)',
    shadowOffset: { width: 1, height: 2 },
    shadowOpacity: 0.25,
  },
  // Paper style variations for tiny boxes (0-9) - for album list thumbnails
  paperStyleTiny0: {
    borderTopLeftRadius: 0.5,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 1.5,
    borderBottomRightRadius: 1,
    borderWidth: 0.3,
    borderColor: 'rgba(80, 60, 40, 0.12)',
  },
  paperStyleTiny1: {
    borderTopLeftRadius: 1,
    borderTopRightRadius: 0.5,
    borderBottomLeftRadius: 0.5,
    borderBottomRightRadius: 1.5,
    shadowOffset: { width: 1.5, height: 2 },
    shadowOpacity: 0.25,
    borderRightWidth: 0.8,
    borderBottomWidth: 0.8,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  paperStyleTiny2: {
    borderTopLeftRadius: 1.5,
    borderTopRightRadius: 1,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 0.5,
    borderWidth: 0.4,
    borderColor: 'rgba(139, 119, 101, 0.2)',
    shadowOffset: { width: 0.5, height: 1 },
    shadowOpacity: 0.15,
  },
  paperStyleTiny3: {
    borderTopLeftRadius: 0.5,
    borderTopRightRadius: 1.5,
    borderBottomLeftRadius: 1,
    borderBottomRightRadius: 2,
    shadowOffset: { width: 1, height: 1.5 },
    shadowOpacity: 0.28,
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(200, 50, 50, 0.12)',
  },
  paperStyleTiny4: {
    borderTopLeftRadius: 2,
    borderTopRightRadius: 0.5,
    borderBottomLeftRadius: 0.5,
    borderBottomRightRadius: 2.5,
    shadowOffset: { width: 0.5, height: 2 },
    shadowOpacity: 0.22,
    borderWidth: 0.2,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  paperStyleTiny5: {
    borderTopLeftRadius: 1,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 2.5,
    borderBottomRightRadius: 1,
    borderWidth: 0.3,
    borderColor: 'rgba(101, 67, 33, 0.15)',
    shadowOffset: { width: 1, height: 1 },
    shadowOpacity: 0.18,
  },
  paperStyleTiny6: {
    borderTopLeftRadius: 1.5,
    borderTopRightRadius: 1.5,
    borderBottomLeftRadius: 1,
    borderBottomRightRadius: 1.5,
    shadowOffset: { width: 1.5, height: 2.5 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    borderWidth: 0.2,
    borderColor: 'rgba(0, 0, 0, 0.06)',
  },
  paperStyleTiny7: {
    borderTopLeftRadius: 0.5,
    borderTopRightRadius: 0.5,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 0.5,
    shadowOffset: { width: 0.5, height: 1.5 },
    shadowOpacity: 0.15,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0, 0, 0, 0.04)',
  },
  paperStyleTiny8: {
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
    borderBottomLeftRadius: 2.5,
    borderBottomRightRadius: 2,
    shadowOffset: { width: 1, height: 2 },
    shadowOpacity: 0.25,
    borderTopWidth: 0.3,
    borderTopColor: 'rgba(0, 0, 0, 0.08)',
  },
  paperStyleTiny9: {
    borderTopLeftRadius: 2.5,
    borderTopRightRadius: 1,
    borderBottomLeftRadius: 1.5,
    borderBottomRightRadius: 3,
    borderWidth: 0.4,
    borderColor: 'rgba(139, 90, 43, 0.14)',
    shadowOffset: { width: 0.5, height: 1 },
    shadowOpacity: 0.2,
  },
  albumModalButtonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  albumModalButtonSecondary: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  albumModalButtonSecondaryText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  // Slider styles
  sliderContainer: {
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  sliderLabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 12,
  },
  sliderTrackTouchable: {
    height: 44,
    justifyContent: 'center',
    position: 'relative',
    width: 280,
    alignSelf: 'center',
  },
  sliderTrack: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: COLORS.white,
    borderRadius: 4,
  },
  sliderThumb: {
    position: 'absolute',
    top: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    marginLeft: -12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  sliderValue: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: '600',
    minWidth: 50,
    textAlign: 'center',
  },
  // Padding variants for varied paper sizes (Large - for step 1 preview)
  paddingVariantLarge0: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  paddingVariantLarge1: {
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  paddingVariantLarge2: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  paddingVariantLarge3: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  paddingVariantLarge4: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  // Padding variants for varied paper sizes (Small - for modal)
  paddingVariantSmall0: {
    paddingHorizontal: 4,
    paddingVertical: 3,
  },
  paddingVariantSmall1: {
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  paddingVariantSmall2: {
    paddingHorizontal: 5,
    paddingVertical: 5,
  },
  paddingVariantSmall3: {
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  paddingVariantSmall4: {
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  // Padding variants for varied paper sizes (Tiny - for album list)
  paddingVariantTiny0: {
    paddingHorizontal: 2,
    paddingVertical: 1,
  },
  paddingVariantTiny1: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  paddingVariantTiny2: {
    paddingHorizontal: 2.5,
    paddingVertical: 2.5,
  },
  paddingVariantTiny3: {
    paddingHorizontal: 4,
    paddingVertical: 1.5,
  },
  paddingVariantTiny4: {
    paddingHorizontal: 3,
    paddingVertical: 3,
  },
  // Font style selection styles
  fontStyleOptions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  fontStyleOption: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  fontStyleOptionSelected: {
    borderColor: COLORS.white,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  fontStylePreviewBasic: {
    fontSize: 24,
    fontFamily: 'Jua_400Regular',
    color: COLORS.white,
    marginTop: 4,
    marginBottom: 8,
    textAlign: 'center',
  },
  fontStylePreviewRansom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 29,
    gap: 2,
    marginTop: -1,
    marginBottom: 8,
    overflow: 'visible',
  },
  fontStyleLabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
    textAlign: 'center',
  },
  ransomMiniBox: {
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 2,
    height: 22,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
  },
  ransomMiniText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  // Circle paper styles (10-14)
  paperStyle10: {
    borderRadius: 100, // Full circle
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.2,
  },
  paperStyle11: {
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 1, height: 2 },
    shadowOpacity: 0.25,
  },
  paperStyle12: {
    borderRadius: 100,
    shadowOffset: { width: 2, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  paperStyle13: {
    borderRadius: 100,
    borderWidth: 0.5,
    borderColor: 'rgba(139, 90, 43, 0.2)',
    shadowOffset: { width: 1, height: 1 },
    shadowOpacity: 0.15,
  },
  paperStyle14: {
    borderRadius: 100,
    shadowOffset: { width: 2, height: 2 },
    shadowOpacity: 0.2,
    borderWidth: 1.5,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  // Small circle styles
  paperStyleSmall10: {
    borderRadius: 100,
    shadowOffset: { width: 1, height: 1 },
    shadowOpacity: 0.2,
  },
  paperStyleSmall11: {
    borderRadius: 100,
    borderWidth: 0.5,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    shadowOffset: { width: 1, height: 1.5 },
    shadowOpacity: 0.2,
  },
  paperStyleSmall12: {
    borderRadius: 100,
    shadowOffset: { width: 1, height: 2 },
    shadowOpacity: 0.25,
  },
  paperStyleSmall13: {
    borderRadius: 100,
    borderWidth: 0.5,
    borderColor: 'rgba(139, 90, 43, 0.15)',
  },
  paperStyleSmall14: {
    borderRadius: 100,
    shadowOffset: { width: 1, height: 1 },
    shadowOpacity: 0.18,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
  },
  // Tiny circle styles
  paperStyleTiny10: {
    borderRadius: 100,
    shadowOffset: { width: 0.5, height: 0.5 },
    shadowOpacity: 0.15,
  },
  paperStyleTiny11: {
    borderRadius: 100,
    borderWidth: 0.3,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  paperStyleTiny12: {
    borderRadius: 100,
    shadowOffset: { width: 0.5, height: 1 },
    shadowOpacity: 0.2,
  },
  paperStyleTiny13: {
    borderRadius: 100,
    borderWidth: 0.3,
    borderColor: 'rgba(139, 90, 43, 0.12)',
  },
  paperStyleTiny14: {
    borderRadius: 100,
    shadowOffset: { width: 0.5, height: 0.5 },
    shadowOpacity: 0.15,
    borderWidth: 0.5,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  // Basic font style text
  basicFontText: {
    fontWeight: '700',
  },
  // Album Detail Full Screen Styles
  albumDetailFullScreen: {
    flex: 1,
  },
  albumDetailContent: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: 60,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    overflow: 'hidden',
  },
  albumDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    position: 'relative',
  },
  albumDetailCloseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  albumDetailTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'center',
  },
  albumDetailMenuButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },
  albumMenuDropdown: {
    position: 'absolute',
    top: 100,
    right: 20,
    borderRadius: 16,
    paddingVertical: 8,
    minWidth: 160,
    zIndex: 100,
    overflow: 'hidden',
    backgroundColor: 'rgba(40, 40, 40, 0.98)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  albumMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 18,
    gap: 14,
  },
  albumMenuItemDanger: {
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  albumMenuItemText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  albumDetailCoverContainer: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  albumDetailCoverWrapper: {
    width: 180,
    height: 240,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: 'rgba(60, 60, 60, 0.5)',
  },
  albumDetailSpine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 16,
    zIndex: 10,
  },
  albumDetailCoverImage: {
    width: '100%',
    height: '100%',
  },
  albumDetailCoverPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(60, 60, 60, 0.5)',
  },
  albumDetailNameOverlay: {
    position: 'absolute',
    maxWidth: '80%',
  },
  albumNameContainerTiny: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 1,
  },
  albumPhotosSection: {
    flex: 1,
    minHeight: 200,
  },
  albumDetailScrollView: {
    flex: 1,
  },
  albumDetailScrollContent: {
    flexGrow: 1,
    paddingBottom: 100,
  },
  albumPhotosSectionHeaderSticky: {
    paddingVertical: 14,
    paddingHorizontal: SPACING.lg,
    backgroundColor: '#000000',
  },
  albumPhotosSectionHeaderInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  albumPhotosGridContainer: {
    paddingHorizontal: SPACING.lg - 1,
    paddingTop: SPACING.md,
  },
  albumPhotosSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  albumPhotosSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  selectionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.7)',
  },
  selectAddButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  selectAddButtonDisabled: {
    opacity: 0.4,
  },
  selectAddButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
  selectAddButtonTextDisabled: {
    color: 'rgba(255, 255, 255, 0.5)',
  },
  albumPhotosScrollView: {
    flex: 1,
  },
  albumPhotosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SPACING.lg - 1,
    paddingTop: SPACING.md,
    gap: 2,
    paddingBottom: 100,
    flexGrow: 1,
  },
  albumMonthSection: {
    width: '100%',
    marginBottom: SPACING.lg,
  },
  albumMonthHeader: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
    paddingHorizontal: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  albumMonthPhotosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
  },
  addPhotoButton: {
    width: (width - SPACING.lg * 2 - 4) / 3,
    aspectRatio: 1,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyAddPhotoButton: {
    width: (width - SPACING.lg * 2 - 4) / 3,
    height: (width - SPACING.lg * 2 - 4) / 3 + 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  emptyAddPhotoButtonText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 8,
  },
  addPhotoButtonText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 8,
  },
  missionPhotoItem: {
    width: (width - SPACING.lg * 2 - 4) / 3,
    height: (width - SPACING.lg * 2 - 4) / 3 + 24,
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  missionPhotoItemInAlbum: {
    opacity: 0.5,
  },
  missionPhotoImage: {
    width: '100%',
    height: '100%',
  },
  photoSelectedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(59, 130, 246, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoInAlbumOverlay: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Album Photo Action Buttons
  albumPhotoActionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  albumPhotoSelectButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 100,
  },
  albumPhotoSelectButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  albumPhotoCancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 100,
  },
  albumPhotoCancelButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  albumPhotoDeleteButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
    borderRadius: 100,
  },
  albumPhotoDeleteButtonDisabled: {
    opacity: 0.4,
  },
  albumPhotoDeleteButtonText: {
    fontSize: 14,
    color: '#FF6B6B',
    fontWeight: '600',
  },
  albumPhotoDeleteButtonTextDisabled: {
    color: 'rgba(255, 107, 107, 0.5)',
  },
  // Photo Selection Overlay
  photoSelectionOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 12,
  },
  photoSelectionOverlaySelected: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  photoSelectionCheck: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Mission Photos Picker Header (reused in month modal style)
  missionPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: 32,
    paddingBottom: SPACING.lg,
  },
  missionPickerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.white,
    flex: 1,
    textAlign: 'center',
  },
  missionPickerItemDisabled: {
    opacity: 0.4,
  },
  missionPickerItemOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  missionPickerSelectedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  missionPickerCheckBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  missionPickerEmpty: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  missionPickerEmptyText: {
    fontSize: 15,
    color: 'rgba(255, 255, 255, 0.5)',
  },
  missionPickerHeaderButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 100,
  },
  missionPickerHeaderButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  missionPickerDoneButton: {
    color: '#007AFF',
    fontWeight: '600',
  },
  missionPickerDoneButtonDisabled: {
    color: 'rgba(0, 122, 255, 0.4)',
  },
  missionPickerItemSelected: {
    backgroundColor: 'rgba(236, 72, 153, 0.7)',
    borderWidth: 3,
    borderColor: '#EC4899',
  },

});
