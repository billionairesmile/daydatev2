import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image as RNImage,
  GestureResponderEvent,
  ActivityIndicator,
  useWindowDimensions,
  Animated,
  Linking,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { BlurView } from 'expo-blur';
import { Camera as VisionCamera, useCameraDevice, useCameraFormat, useCameraPermission, CameraRuntimeError } from 'react-native-vision-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import {
  ChevronLeft,
  Camera,
  Edit3,
  Check,
  User,
  SwitchCamera,
  X,
  Zap,
  ZapOff,
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '@/constants/design';
import { useMissionStore } from '@/stores/missionStore';
import { useMemoryStore } from '@/stores/memoryStore';
import { useAuthStore } from '@/stores/authStore';
import { useCoupleSyncStore } from '@/stores/coupleSyncStore';
import { useSubscriptionStore } from '@/stores/subscriptionStore';
import { db, isDemoMode } from '@/lib/supabase';
import type { CompletedMission, Mission } from '@/types';

export default function MissionDetailScreen() {
  // Get screen dimensions dynamically
  const { width, height } = useWindowDimensions();
  const router = useRouter();
  const { id, source } = useLocalSearchParams<{ id: string; source?: string }>();
  const { t, i18n } = useTranslation();

  // Custom back navigation - returns to bookmark page if came from there
  const handleBack = useCallback(() => {
    if (source === 'bookmark') {
      // Navigate to mission tab with bookmark page open
      router.replace('/(tabs)/mission?showBookmark=true');
    } else {
      router.back();
    }
  }, [router, source]);

  const [photoTaken, setPhotoTaken] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const showPreviewRef = useRef(false); // Track showPreview for async callbacks
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [user1Message, setUser1Message] = useState<string | null>(null);
  const [user2Message, setUser2Message] = useState<string | null>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [flashEnabled, setFlashEnabled] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);

  // Track if current user is the photo taker (user1 in mission progress)
  const [isPhotoTaker, setIsPhotoTaker] = useState(true);


  // State for enlarged photo modal
  const [showEnlargedPhoto, setShowEnlargedPhoto] = useState(false);

  // Enlarged photo pinch-to-zoom state - using Animated for smooth performance
  const enlargedScaleAnim = useRef(new Animated.Value(1)).current;
  const enlargedTranslateXAnim = useRef(new Animated.Value(0)).current;
  const enlargedTranslateYAnim = useRef(new Animated.Value(0)).current;
  const enlargedScaleRef = useRef(1);
  const enlargedTranslateXRef = useRef(0);
  const enlargedTranslateYRef = useRef(0);
  const lastEnlargedPinchDistance = useRef<number | null>(null);
  const lastEnlargedPanPosition = useRef<{ x: number; y: number } | null>(null);
  const initialPinchScale = useRef<number>(1);
  const [enlargedScaleDisplay, setEnlargedScaleDisplay] = useState(1); // For UI indicator only

  // Camera tap-to-focus state
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | null>(null);
  const focusAnimValue = useRef(new Animated.Value(0)).current;
  const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Enlarged photo pinch-to-zoom focal point tracking
  const pinchFocalPointRef = useRef<{ x: number; y: number } | null>(null);

  // Velocity tracking for smooth pan momentum
  const panVelocityRef = useRef<{ vx: number; vy: number }>({ vx: 0, vy: 0 });
  const lastPanTimeRef = useRef<number>(0);

  // Location state for photo
  const [currentLocation, setCurrentLocation] = useState<string | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

  // Vision Camera permission and device
  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice(facing === 'front' ? 'front' : 'back');
  const cameraRef = useRef<VisionCamera>(null);

  // Select best camera format for maximum photo quality
  const format = useCameraFormat(device, [
    { photoResolution: 'max' },
    { photoHdr: true },
  ]);

  // Handle camera runtime errors
  const handleCameraError = useCallback((error: CameraRuntimeError) => {
    console.error('[VisionCamera] Camera error:', error.code, error.message);
  }, []);

  // Get mission from store (AI-generated or featured missions)
  const { getTodayMissions, completeTodayMission, hasTodayCompletedMission, isTodayCompletedMission, keptMissions, saveInProgressMission, getInProgressMission, clearInProgressMission } = useMissionStore();
  const todayMissions = getTodayMissions();

  // Get couple info for DB storage
  const { couple, user } = useAuthStore();

  // Get mission progress sync store
  const {
    isInitialized: isSyncInitialized,
    activeMissionProgress,
    allMissionProgress,
    lockedMissionId,
    startMissionProgress,
    uploadMissionPhoto,
    submitMissionMessage,
    updateMissionLocation,
    cancelMissionProgress,
    isUserMessage1Submitter,
    hasUserSubmittedMessage,
    hasPartnerSubmittedMessage,
    getMissionProgressByMissionId,
    isMissionLocked,
    sharedBookmarks,
  } = useCoupleSyncStore();

  // Find mission in today's missions, kept missions, synced bookmarks, or provide a fallback
  // Check synced bookmarks (which persist across daily resets)
  const bookmarkedMission = sharedBookmarks.find((b) => b.mission_id === id)?.mission_data;

  // State for featured mission loaded from DB
  const [featuredMission, setFeaturedMission] = useState<Mission | null>(null);
  const [isLoadingFeaturedMission, setIsLoadingFeaturedMission] = useState(false);
  // Additional promotional content from featured mission (affiliate links, etc.)
  const [additionalContent, setAdditionalContent] = useState<string | null>(null);

  // Check if mission exists in local stores
  const localMission =
    todayMissions.find((m) => m.id === id) ||
    keptMissions.find((m) => m.id === id) ||
    bookmarkedMission;

  // Load featured mission from DB if not found in local stores
  useEffect(() => {
    const loadFeaturedMission = async () => {
      if (localMission || !id || isDemoMode) return;

      setIsLoadingFeaturedMission(true);
      try {
        const { data, error } = await db.featuredMissions.getById(id);
        if (error || !data) {
          setIsLoadingFeaturedMission(false);
          return;
        }

        // Get current language
        const isEnglish = i18n.language === 'en';

        // Convert to Mission format with language-aware fields
        const converted: Mission = {
          id: data.id,
          title: (isEnglish && data.title_en) ? data.title_en : data.title,
          description: (isEnglish && data.description_en) ? data.description_en : data.description,
          category: data.category as Mission['category'],
          tags: (isEnglish && data.tags_en?.length) ? data.tags_en : (data.tags || []),
          imageUrl: data.image_url || '',
          isPremium: false,
        };
        setFeaturedMission(converted);

        // Set additional promotional content (language-aware)
        const content = (isEnglish && data.additional_content_en)
          ? data.additional_content_en
          : data.additional_content;
        setAdditionalContent(content || null);
      } catch (error) {
        console.error('[MissionDetail] Error loading featured mission:', error);
      } finally {
        setIsLoadingFeaturedMission(false);
      }
    };

    loadFeaturedMission();
  }, [id, localMission, i18n.language]);

  const mission: Mission =
    localMission ||
    featuredMission ||
    {
      id: id || 'unknown',
      title: t('missionDetail.notFound.title'),
      description: t('missionDetail.notFound.description'),
      category: 'home' as const,
      tags: [],
      imageUrl: '',
      isPremium: false,
    };

  // Render rich content with clickable links and images
  const renderRichContent = (content: string) => {
    // URL regex pattern
    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    // Image URL pattern
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i;

    // Split content by URLs while keeping the URLs
    const parts = content.split(urlRegex);

    return (
      <View>
        {parts.map((part, index) => {
          // Check if this part is a URL
          if (urlRegex.test(part)) {
            // Reset regex lastIndex
            urlRegex.lastIndex = 0;

            // Check if it's an image URL
            if (imageExtensions.test(part)) {
              return (
                <Pressable
                  key={index}
                  onPress={() => Linking.openURL(part)}
                  style={styles.additionalContentImageContainer}
                >
                  <ExpoImage
                    source={{ uri: part }}
                    style={styles.additionalContentImage}
                    contentFit="cover"
                  />
                </Pressable>
              );
            }

            // It's a regular link
            return (
              <Pressable
                key={index}
                onPress={() => Linking.openURL(part)}
              >
                <Text style={styles.additionalContentLink}>{part}</Text>
              </Pressable>
            );
          }

          // Regular text - handle newlines
          if (part.trim()) {
            return (
              <Text key={index} style={styles.additionalContentText}>
                {part}
              </Text>
            );
          }
          return null;
        })}
      </View>
    );
  };

  // Get the progress for THIS specific mission (not just the active one)
  const thisMissionProgress = getMissionProgressByMissionId(mission.id);

  // Check if another mission is locked (meaning we can't start this one)
  const isOtherMissionLocked = isMissionLocked(mission.id);
  const { addMemory, memories } = useMemoryStore();
  const hasCompletedRef = useRef(false);
  const memorySavedRef = useRef(false);
  const hasRestoredRef = useRef(false);

  // Prefetch mission images for instant display
  useEffect(() => {
    // Prefetch mission background image
    if (mission?.imageUrl) {
      ExpoImage.prefetch(mission.imageUrl).catch(() => {});
    }
    // Prefetch mission progress photo (for this specific mission)
    if (thisMissionProgress?.photo_url) {
      ExpoImage.prefetch(thisMissionProgress.photo_url).catch(() => {});
    }
  }, [mission?.imageUrl, thisMissionProgress?.photo_url]);

  // Sync state from thisMissionProgress (real-time updates from partner for THIS mission)
  useEffect(() => {
    if (!isSyncInitialized || !thisMissionProgress) return;

    // Determine if current user is the photo taker (user1 = the one who started/took photo)
    const isUser1 = user?.id === thisMissionProgress.user1_id;
    setIsPhotoTaker(isUser1);

    // Sync photo - this shows the photo to both users
    if (thisMissionProgress.photo_url && !capturedPhoto) {
      setCapturedPhoto(thisMissionProgress.photo_url);
      setPhotoTaken(true);
    }

    // Sync messages based on user role
    // user1Message = "내 메시지", user2Message = "상대방 메시지"
    // Always update partner's message when it arrives (remove the !user2Message check to force update)
    if (isUser1) {
      // User is user1 (photo taker) - their message is user1_message
      if (thisMissionProgress.user1_message && !user1Message) {
        setUser1Message(thisMissionProgress.user1_message);
      }
      // Partner's message is user2_message - always sync when available
      if (thisMissionProgress.user2_message) {
        setUser2Message(thisMissionProgress.user2_message);
      }
    } else {
      // User is user2 (partner) - their message is user2_message
      if (thisMissionProgress.user2_message && !user1Message) {
        setUser1Message(thisMissionProgress.user2_message);
      }
      // Partner's message (user1) goes to user2Message display - always sync when available
      if (thisMissionProgress.user1_message) {
        setUser2Message(thisMissionProgress.user1_message);
      }
    }

    // Sync location
    if (thisMissionProgress.location && !currentLocation) {
      setCurrentLocation(thisMissionProgress.location);
    }
  }, [
    isSyncInitialized,
    thisMissionProgress,
    user?.id,
    capturedPhoto,
    user1Message,
    currentLocation,
  ]);

  // Restore completed or in-progress state when re-entering the page
  useEffect(() => {
    if (hasRestoredRef.current) return;

    // First check if mission is fully completed today
    if (isTodayCompletedMission(mission.id)) {
      hasRestoredRef.current = true;
      hasCompletedRef.current = true;
      memorySavedRef.current = true;

      // Find the memory for this mission from today
      const today = new Date();
      const todayMemory = memories.find((m) => {
        const completedDate = new Date(m.completedAt);
        return (
          m.missionId === mission.id &&
          completedDate.getFullYear() === today.getFullYear() &&
          completedDate.getMonth() === today.getMonth() &&
          completedDate.getDate() === today.getDate()
        );
      });

      if (todayMemory) {
        setCapturedPhoto(todayMemory.photoUrl);
        setPhotoTaken(true);
        setUser1Message(todayMemory.user1Message);
        setUser2Message(todayMemory.user2Message || null);
      } else {
        // Mission is completed but no memory found - show as completed anyway
        setPhotoTaken(true);
        setUser1Message(t('missionDetail.completed'));
        setUser2Message(t('missionDetail.completed'));
      }
      return;
    }

    // Check for in-progress mission data (photo taken but not fully completed)
    const inProgressData = getInProgressMission(mission.id);
    if (inProgressData) {
      hasRestoredRef.current = true;

      if (inProgressData.capturedPhoto) {
        setCapturedPhoto(inProgressData.capturedPhoto);
        setPhotoTaken(true);
      }
      if (inProgressData.user1Message) {
        setUser1Message(inProgressData.user1Message);
      }
      if (inProgressData.user2Message) {
        setUser2Message(inProgressData.user2Message);
      }
    }
  }, [mission.id, isTodayCompletedMission, memories, getInProgressMission]);

  // Calculate max pan boundaries based on scale and image dimensions
  // Image is displayed with contentFit="contain", so it fills width on portrait screens
  const getMaxPan = useCallback((scale: number) => {
    // For a portrait photo (4:3) on portrait screen:
    // Image fills width, so maxPanX = width * (scale - 1) / 2
    // Image height is proportional, maxPanY needs to account for aspect ratio
    const imageAspectRatio = 4 / 3; // Typical phone camera aspect ratio

    let displayedWidth = width;
    let displayedHeight = width / imageAspectRatio;

    // If image would be taller than screen, it's constrained by height instead
    if (displayedHeight > height) {
      displayedHeight = height;
      displayedWidth = height * imageAspectRatio;
    }

    // Max pan is half the overflow (scaled size - screen size) / 2
    // But we also need to divide by scale since translation is applied before scale
    const maxPanX = Math.max(0, (displayedWidth * scale - width) / 2 / scale);
    const maxPanY = Math.max(0, (displayedHeight * scale - height) / 2 / scale);

    return { maxPanX, maxPanY };
  }, [width, height]);

  // Enlarged photo gesture handlers (pinch-to-zoom and pan) - using Animated for smooth performance
  const handleEnlargedGesture = (evt: GestureResponderEvent) => {
    const touches = evt.nativeEvent.touches;

    if (touches.length === 2) {
      // Pinch to zoom - zoom at pinch focal point
      const touch1 = touches[0];
      const touch2 = touches[1];

      // Calculate pinch center (focal point)
      const focalX = (touch1.pageX + touch2.pageX) / 2;
      const focalY = (touch1.pageY + touch2.pageY) / 2;

      // Calculate pinch distance
      const dx = touch1.pageX - touch2.pageX;
      const dy = touch1.pageY - touch2.pageY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (lastEnlargedPinchDistance.current === null) {
        // First pinch - save initial state
        lastEnlargedPinchDistance.current = distance;
        initialPinchScale.current = enlargedScaleRef.current;
        pinchFocalPointRef.current = { x: focalX, y: focalY };
      } else {
        const oldScale = enlargedScaleRef.current;
        // Smoother scale calculation with reduced sensitivity
        const scaleMultiplier = distance / lastEnlargedPinchDistance.current;
        const newScale = Math.max(1, Math.min(4, initialPinchScale.current * scaleMultiplier));

        // Update pinch distance for continuous scaling
        lastEnlargedPinchDistance.current = distance;
        initialPinchScale.current = newScale;

        // Zoom around focal point: adjust translation so focal point stays in place
        const centerX = width / 2;
        const centerY = height / 2;

        // Calculate how much to adjust translation to keep focal point fixed
        const scaleRatio = newScale / oldScale;
        const focalOffsetX = (pinchFocalPointRef.current!.x - centerX) / oldScale;
        const focalOffsetY = (pinchFocalPointRef.current!.y - centerY) / oldScale;

        // New translation keeps the focal point in the same screen position
        let newTranslateX = enlargedTranslateXRef.current * scaleRatio + focalOffsetX * (1 - scaleRatio);
        let newTranslateY = enlargedTranslateYRef.current * scaleRatio + focalOffsetY * (1 - scaleRatio);

        // Get proper boundaries
        const { maxPanX, maxPanY } = getMaxPan(newScale);

        enlargedScaleRef.current = newScale;
        enlargedScaleAnim.setValue(newScale);
        setEnlargedScaleDisplay(Math.round(newScale * 10) / 10);

        // Reset translation if scale goes back to 1
        if (newScale <= 1.01) {
          enlargedTranslateXRef.current = 0;
          enlargedTranslateYRef.current = 0;
          enlargedTranslateXAnim.setValue(0);
          enlargedTranslateYAnim.setValue(0);
        } else {
          // Clamp to boundaries
          enlargedTranslateXRef.current = Math.max(-maxPanX, Math.min(maxPanX, newTranslateX));
          enlargedTranslateYRef.current = Math.max(-maxPanY, Math.min(maxPanY, newTranslateY));
          enlargedTranslateXAnim.setValue(enlargedTranslateXRef.current);
          enlargedTranslateYAnim.setValue(enlargedTranslateYRef.current);
        }
      }
    } else if (touches.length === 1 && enlargedScaleRef.current > 1) {
      // Pan when zoomed in
      const touch = touches[0];
      const now = Date.now();

      if (lastEnlargedPanPosition.current === null) {
        lastEnlargedPanPosition.current = { x: touch.pageX, y: touch.pageY };
        lastPanTimeRef.current = now;
        panVelocityRef.current = { vx: 0, vy: 0 };
      } else {
        const dx = (touch.pageX - lastEnlargedPanPosition.current.x) / enlargedScaleRef.current;
        const dy = (touch.pageY - lastEnlargedPanPosition.current.y) / enlargedScaleRef.current;
        const dt = Math.max(now - lastPanTimeRef.current, 1);

        // Calculate velocity
        panVelocityRef.current = {
          vx: dx / dt * 16,
          vy: dy / dt * 16,
        };

        // Get proper boundaries
        const { maxPanX, maxPanY } = getMaxPan(enlargedScaleRef.current);
        const newX = Math.max(-maxPanX, Math.min(maxPanX, enlargedTranslateXRef.current + dx));
        const newY = Math.max(-maxPanY, Math.min(maxPanY, enlargedTranslateYRef.current + dy));

        enlargedTranslateXRef.current = newX;
        enlargedTranslateYRef.current = newY;
        enlargedTranslateXAnim.setValue(newX);
        enlargedTranslateYAnim.setValue(newY);

        lastEnlargedPanPosition.current = { x: touch.pageX, y: touch.pageY };
        lastPanTimeRef.current = now;
      }
    }
  };

  const handleEnlargedGestureEnd = () => {
    // Get current boundaries
    const { maxPanX, maxPanY } = getMaxPan(enlargedScaleRef.current);

    // Clamp to boundaries with spring animation
    const clampedX = Math.max(-maxPanX, Math.min(maxPanX, enlargedTranslateXRef.current));
    const clampedY = Math.max(-maxPanY, Math.min(maxPanY, enlargedTranslateYRef.current));

    // If out of bounds, spring back
    if (Math.abs(clampedX - enlargedTranslateXRef.current) > 0.1 ||
        Math.abs(clampedY - enlargedTranslateYRef.current) > 0.1) {
      enlargedTranslateXRef.current = clampedX;
      enlargedTranslateYRef.current = clampedY;
      Animated.parallel([
        Animated.spring(enlargedTranslateXAnim, {
          toValue: clampedX,
          useNativeDriver: true,
          tension: 200,
          friction: 20,
        }),
        Animated.spring(enlargedTranslateYAnim, {
          toValue: clampedY,
          useNativeDriver: true,
          tension: 200,
          friction: 20,
        }),
      ]).start();
    }

    // Reset tracking state
    lastEnlargedPinchDistance.current = null;
    lastEnlargedPanPosition.current = null;
    pinchFocalPointRef.current = null;
    initialPinchScale.current = enlargedScaleRef.current;
    panVelocityRef.current = { vx: 0, vy: 0 };
  };

  const resetEnlargedZoom = () => {
    enlargedScaleRef.current = 1;
    enlargedTranslateXRef.current = 0;
    enlargedTranslateYRef.current = 0;
    enlargedScaleAnim.setValue(1);
    enlargedTranslateXAnim.setValue(0);
    enlargedTranslateYAnim.setValue(0);
    setEnlargedScaleDisplay(1);
  };

  // Handle tap on camera for focus
  const handleCameraTap = useCallback((x: number, y: number) => {
    console.log('[Camera] Tap at:', { x, y });

    // Check if device supports focus
    if (!device?.supportsFocus) {
      console.log('[Camera] Device does not support focus');
      return;
    }

    // Cancel any existing timeout
    if (focusTimeoutRef.current) {
      clearTimeout(focusTimeoutRef.current);
      focusTimeoutRef.current = null;
    }

    // Update focus point for UI indicator
    setFocusPoint({ x, y });

    // Animate focus indicator with improved animation - bounce in effect
    focusAnimValue.setValue(0);
    Animated.spring(focusAnimValue, {
      toValue: 1,
      tension: 180,
      friction: 7,
      useNativeDriver: true,
    }).start();

    // Focus the camera - use pixel coordinates directly (not normalized)
    if (cameraRef.current) {
      cameraRef.current.focus({ x, y })
        .then(() => console.log('[Camera] Focus set at pixel:', x.toFixed(0), y.toFixed(0)))
        .catch((error: unknown) => console.log('[Camera] Focus error:', error));
    }

    // Auto-hide with fade out after 1.5 seconds
    focusTimeoutRef.current = setTimeout(() => {
      Animated.timing(focusAnimValue, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => {
        setFocusPoint(null);
      });
    }, 1500);
  }, [device, focusAnimValue]);


  const handleTakePhoto = async () => {
    if (!hasPermission) {
      const granted = await requestPermission();
      if (!granted) {
        Alert.alert(
          t('missionDetail.camera.permissionRequired'),
          t('missionDetail.camera.permissionMessage'),
          [{ text: t('common.confirm') }]
        );
        return;
      }
    }
    setShowCamera(true);
  };

  const handleCapture = async () => {
    if (cameraRef.current && !isCapturing) {
      setIsCapturing(true);
      try {
        // Vision Camera uses takePhoto with quality settings
        const photo = await cameraRef.current.takePhoto({
          flash: flashEnabled ? 'on' : 'off',
          enableShutterSound: true,
        });

        if (photo) {
          // Vision Camera returns path without file:// prefix
          const photoUri = `file://${photo.path}`;

          // Show preview with loading indicator while processing
          setPreviewPhoto(null); // Don't show raw photo
          setIsProcessingPhoto(true);
          setShowPreview(true);
          showPreviewRef.current = true; // Track for async callback
          setIsCapturing(false);

          // Get original image dimensions and process
          RNImage.getSize(photoUri, async (originalWidth: number, originalHeight: number) => {
            // Check if user already went back (cancelled preview) using ref
            if (!showPreviewRef.current) {
              setIsProcessingPhoto(false);
              return;
            }
            try {
              const isLandscapeImage = originalWidth > originalHeight;
              const manipulations: ImageManipulator.Action[] = [];

              // Track dimensions after each manipulation
              let currentWidth = originalWidth;
              let currentHeight = originalHeight;

              // Step 1: Rotate if needed (camera returns landscape for portrait capture)
              if (isLandscapeImage) {
                if (facing === 'back') {
                  manipulations.push({ rotate: -90 });
                } else {
                  manipulations.push({ rotate: 90 });
                }
                // After rotation, dimensions swap
                currentWidth = originalHeight;
                currentHeight = originalWidth;
              }

              // Front camera photos are kept mirrored (like the viewfinder)
              // No horizontal flip - this keeps the "selfie" appearance users expect

              // Apply rotation first
              let processedUri = photoUri;
              if (manipulations.length > 0) {
                const result = await ImageManipulator.manipulateAsync(
                  photoUri,
                  manipulations,
                  { format: ImageManipulator.SaveFormat.JPEG, compress: 1 }
                );
                processedUri = result.uri;
                console.log('[Camera] Photo after rotation:', currentWidth, 'x', currentHeight);
              }

              // Step 2: First crop to VIEWFINDER aspect (screen aspect)
              // The viewfinder fills the screen, so it shows a cropped view of the sensor
              // We need to match that crop so preview shows exactly what user saw
              const photoAspect = currentWidth / currentHeight;
              const screenAspect = width / height; // What user saw in viewfinder

              if (photoAspect > screenAspect) {
                // Photo is wider than viewfinder - crop sides to match viewfinder
                const viewfinderCropHeight = currentHeight;
                const viewfinderCropWidth = Math.round(currentHeight * screenAspect);
                const viewfinderCropX = Math.round((currentWidth - viewfinderCropWidth) / 2);
                const viewfinderCropY = 0;

                console.log('[Camera] Step 1 - Cropping to viewfinder:', {
                  viewfinderCropX, viewfinderCropY, viewfinderCropWidth, viewfinderCropHeight,
                  photoAspect: photoAspect.toFixed(3), screenAspect: screenAspect.toFixed(3)
                });

                const viewfinderResult = await ImageManipulator.manipulateAsync(
                  processedUri,
                  [{ crop: { originX: viewfinderCropX, originY: viewfinderCropY, width: viewfinderCropWidth, height: viewfinderCropHeight } }],
                  { format: ImageManipulator.SaveFormat.JPEG, compress: 1 }
                );
                processedUri = viewfinderResult.uri;
                currentWidth = viewfinderCropWidth;
                currentHeight = viewfinderCropHeight;
              }

              // Step 3: Crop to 3:4 photocard aspect ratio (final saved format)
              const currentAspect = currentWidth / currentHeight;
              const targetAspect = 3 / 4;

              if (Math.abs(currentAspect - targetAspect) > 0.01) {
                let cropWidth: number;
                let cropHeight: number;
                let cropX: number;
                let cropY: number;

                if (currentAspect > targetAspect) {
                  // Photo is wider than 3:4 - crop sides
                  cropHeight = currentHeight;
                  cropWidth = Math.round(cropHeight * targetAspect);
                  cropX = Math.round((currentWidth - cropWidth) / 2);
                  cropY = 0;
                } else {
                  // Photo is taller than 3:4 - crop top/bottom
                  cropWidth = currentWidth;
                  cropHeight = Math.round(cropWidth / targetAspect);
                  cropX = 0;
                  cropY = Math.round((currentHeight - cropHeight) / 2);
                }

                console.log('[Camera] Step 2 - Cropping to 3:4:', { cropX, cropY, cropWidth, cropHeight });

                const croppedResult = await ImageManipulator.manipulateAsync(
                  processedUri,
                  [{ crop: { originX: cropX, originY: cropY, width: cropWidth, height: cropHeight } }],
                  { format: ImageManipulator.SaveFormat.JPEG, compress: 1 }
                );
                processedUri = croppedResult.uri;
                currentWidth = cropWidth;
                currentHeight = cropHeight;
              }

              // Step 4: Resize if too large and apply final compression for optimal quality/size balance
              // Target: max 1500px width (1500x2000 for 3:4) with 0.85 compression = ~1-1.5MB
              const maxWidth = 1500;
              const finalManipulations: ImageManipulator.Action[] = [];

              if (currentWidth > maxWidth) {
                const scaledHeight = Math.round(currentHeight * (maxWidth / currentWidth));
                finalManipulations.push({ resize: { width: maxWidth, height: scaledHeight } });
                console.log('[Camera] Step 3 - Resizing:', currentWidth, 'x', currentHeight, '→', maxWidth, 'x', scaledHeight);
              }

              // Apply final resize (if needed) and compression
              const finalResult = await ImageManipulator.manipulateAsync(
                processedUri,
                finalManipulations,
                { format: ImageManipulator.SaveFormat.JPEG, compress: 0.85 }
              );
              processedUri = finalResult.uri;
              console.log('[Camera] Final photo ready with 85% quality compression');

              // Set the processed photo and stop loading
              setPreviewPhoto(processedUri);
              setIsProcessingPhoto(false);
            } catch (manipError) {
              console.error('Image manipulation error:', manipError);
              // Fallback to original photo on error
              setPreviewPhoto(photoUri);
              setIsProcessingPhoto(false);
            }
          }, (error: Error) => {
            console.error('Failed to get original image size:', error);
            // Fallback to original photo on error
            setPreviewPhoto(photoUri);
            setIsProcessingPhoto(false);
          });
        }
      } catch (error) {
        console.error('Failed to take picture:', error);
        Alert.alert(t('common.error'), t('missionDetail.camera.photoError'));
        setIsCapturing(false); // Only reset on capture failure (not in finally, as success already resets)
      }
    }
  };

  // Function to get current location with reverse geocoding
  const getCurrentLocationName = async (): Promise<string> => {
    try {
      setIsLoadingLocation(true);
      const isEnglish = i18n.language === 'en';

      // Request location permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission denied');
        return t('missionDetail.location.noInfo');
      }

      // Get current position
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      // Reverse geocode to get address
      const [address] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (address) {
        // Format: city + district only (e.g., "대전광역시 도룡동" or "Daejeon, Doryong-dong")
        // Priority: city + district (동) - no street address for privacy

        let city = '';
        let district = '';

        // Get city name (시/광역시)
        if (address.city) {
          city = address.city;
        } else if (address.region) {
          city = address.region;
        }

        // Get district name (동/읍/면)
        if (address.district) {
          district = address.district;
        } else if (address.subregion) {
          // subregion is usually 구/군 level, use it if no district
          district = address.subregion;
        }

        // Build location string based on available data
        if (city && district) {
          // For English users, use comma separator; for Korean, use space
          return isEnglish ? `${city}, ${district}` : `${city} ${district}`;
        } else if (city) {
          return city;
        } else if (district) {
          return district;
        } else if (address.region) {
          return address.region;
        }
      }

      return t('missionDetail.location.noInfo');
    } catch (error) {
      console.error('Error getting location:', error);
      return t('missionDetail.location.noInfo');
    } finally {
      setIsLoadingLocation(false);
    }
  };

  const handleConfirmPhoto = async () => {
    if (previewPhoto) {
      // Photo is already cropped to 3:4 in handleCapture, so just use it directly
      try {
        // Set the preview photo as the captured photo (already 3:4)
        setCapturedPhoto(previewPhoto);
        setPhotoTaken(true);
        setShowCamera(false);
        setShowPreview(false);
        showPreviewRef.current = false;
        setPreviewPhoto(null);

        // Get current location when photo is confirmed
        const locationName = await getCurrentLocationName();
        setCurrentLocation(locationName);

        // Save to in-progress mission data for persistence
        saveInProgressMission({
          missionId: mission.id,
          capturedPhoto: previewPhoto,
        });

        // Start synced mission progress if sync is initialized
        if (isSyncInitialized && couple?.id) {
          try {
            // Upload photo to storage first
            const uploadedPhotoUrl = await db.storage.uploadPhoto(couple.id, previewPhoto);

            if (uploadedPhotoUrl) {
              // Update capturedPhoto state to the remote URL to prevent duplicate uploads
              // when handleCompleteAndClose or auto-save runs later
              setCapturedPhoto(uploadedPhotoUrl);

              // Also update in-progress data with the remote URL
              saveInProgressMission({
                missionId: mission.id,
                capturedPhoto: uploadedPhotoUrl,
              });

              if (!thisMissionProgress) {
                // No progress for this mission - start new mission progress
                const progress = await startMissionProgress(mission.id, mission);
                if (progress) {
                  // Upload photo to the progress
                  await uploadMissionPhoto(uploadedPhotoUrl, progress.id);
                  // Update location
                  if (locationName && locationName !== t('missionDetail.location.noInfo')) {
                    await updateMissionLocation(locationName, progress.id);
                  }
                }
              } else {
                // Same mission already started (maybe by partner), just upload photo
                await uploadMissionPhoto(uploadedPhotoUrl, thisMissionProgress.id);
                if (locationName && locationName !== t('missionDetail.location.noInfo')) {
                  await updateMissionLocation(locationName, thisMissionProgress.id);
                }
              }
            }
          } catch (error) {
            console.error('Error syncing photo:', error);
            // Local save already done, continue even if sync fails
          }
        }
      } catch (error) {
        console.error('Error processing photo:', error);
        // Fallback: use the original preview photo if cropping fails
        setCapturedPhoto(previewPhoto);
        setPhotoTaken(true);
        setShowCamera(false);
        setShowPreview(false);
        showPreviewRef.current = false;
        setPreviewPhoto(null);
      }
    }
  };

  const handleRetakePhoto = () => {
    setPreviewPhoto(null);
    setShowPreview(false);
    showPreviewRef.current = false; // Reset ref for async callbacks
    setIsCapturing(false);
    setIsProcessingPhoto(false);
  };

  const handleRetakeFromDetail = async () => {
    setCapturedPhoto(null);
    setPhotoTaken(false);
    await handleTakePhoto();
  };

  const toggleCameraFacing = () => {
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  };

  const handleOpenMessageModal = () => {
    // Only open modal if user hasn't written their message yet
    if (!user1Message) {
      setShowMessageModal(true);
    }
  };

  const handleAddMessage = async () => {
    if (messageText.trim()) {
      const message = messageText.trim();
      // User can only write their own message (user1Message)
      setUser1Message(message);
      setMessageText('');
      setShowMessageModal(false);

      // Save to in-progress mission data for persistence
      saveInProgressMission({
        missionId: mission.id,
        user1Message: message,
      });

      // Sync message to partner via coupleSyncStore
      // Partner's message will arrive via real-time subscription (useEffect above)
      if (isSyncInitialized && thisMissionProgress) {
        try {
          await submitMissionMessage(message, thisMissionProgress.id);
        } catch (error) {
          console.error('Error syncing message:', error);
          // Local save already done, continue even if sync fails
        }
      } else if (isDemoMode || !isSyncInitialized) {
        // Demo mode fallback: simulate partner message after delay
        // This allows solo testing without a real partner
        setTimeout(() => {
          const partnerMessage = t('missionDetail.defaultPartnerMessage');
          setUser2Message(partnerMessage);
          saveInProgressMission({
            missionId: mission.id,
            user2Message: partnerMessage,
          });
        }, 2000);
      }
    }
  };

  const handleCompleteMission = () => {
    // Mark mission as completed and save to memory
    if (!hasCompletedRef.current && !hasTodayCompletedMission()) {
      hasCompletedRef.current = true;
      completeTodayMission(mission.id);
    }
  };

  const handleCompleteAndClose = async () => {
    // Save to memory album (only once, only by photo taker to prevent duplicates)
    // Partner should not save - only photo taker saves to avoid duplicate entries
    if (!memorySavedRef.current && capturedPhoto && user1Message && user2Message && isPhotoTaker) {
      memorySavedRef.current = true;

      // Use actual location if available
      const finalLocation = currentLocation || t('missionDetail.location.noInfo');

      // Determine message order based on couple relationship
      // Always save in couple order: user1_message = couple.user1's message, user2_message = couple.user2's message
      // Current state: user1Message = current user's message, user2Message = partner's message
      const isCurrentUserCoupleUser1 = user?.id === couple?.user1Id;
      const messageForCoupleUser1 = isCurrentUserCoupleUser1 ? user1Message : user2Message;
      const messageForCoupleUser2 = isCurrentUserCoupleUser1 ? user2Message : user1Message;

      const newMemory: CompletedMission = {
        id: `memory-${Date.now()}`,
        coupleId: couple?.id || 'sample-couple',
        missionId: mission.id,
        mission: mission,
        photoUrl: capturedPhoto,
        user1Message: messageForCoupleUser1,
        user2Message: messageForCoupleUser2,
        location: finalLocation,
        completedAt: new Date(),
      };

      // Save to database first (if not in demo mode and couple exists)
      // This ensures we use the database-generated ID for album photo references
      if (!isDemoMode && couple?.id) {
        // Check subscription limit for mission completion
        const subscriptionStore = useSubscriptionStore.getState();
        const canComplete = await subscriptionStore.canCompleteMission(couple.id);
        if (!canComplete) {
          Alert.alert(
            t('premium.limitReached.title'),
            t('premium.limitReached.completion'),
            [{ text: t('common.ok') }]
          );
          memorySavedRef.current = false; // Reset so user can try again after upgrade
          return;
        }

        try {
          // Check if photo is already a remote URL (synced from partner)
          const isRemoteUrl = capturedPhoto.startsWith('http://') || capturedPhoto.startsWith('https://');

          // Only upload if it's a local file, otherwise use the existing URL
          let finalPhotoUrl = capturedPhoto;
          if (!isRemoteUrl) {
            const uploadedPhotoUrl = await db.storage.uploadPhoto(couple.id, capturedPhoto);
            finalPhotoUrl = uploadedPhotoUrl || capturedPhoto;
          }

          // Save to completed_missions table (in couple order)
          const { data: dbMemory, error: dbError } = await db.completedMissions.create({
            couple_id: couple.id,
            photo_url: finalPhotoUrl,
            user1_message: messageForCoupleUser1,
            user2_message: messageForCoupleUser2,
            location: finalLocation,
            mission_data: {
              id: mission.id,
              title: mission.title,
              description: mission.description,
              category: mission.category,
              imageUrl: mission.imageUrl,
              tags: mission.tags,
            },
          });

          // Use database ID if available, otherwise use local ID
          if (dbMemory && !dbError) {
            newMemory.id = dbMemory.id;
            newMemory.photoUrl = finalPhotoUrl;

            // Increment completion count for subscription tracking
            await subscriptionStore.incrementCompletionCount(couple.id);
          }
        } catch (error) {
          console.error('Error saving memory to DB:', error);
          // Continue with local ID if DB fails
        }
      }

      // Save to local store (with database ID if available)
      addMemory(newMemory);
    }

    // Clear in-progress data since mission is now fully completed
    clearInProgressMission(mission.id);

    handleCompleteMission();
    handleBack();
  };

  const isComplete = photoTaken && user1Message && user2Message;
  const isWaitingForPartner = photoTaken && user1Message && !user2Message;
  // Partner waiting for photo (partner joined but photo not taken yet)
  const isWaitingForPhoto = !photoTaken && !isPhotoTaker && isSyncInitialized && thisMissionProgress;
  // Mission locked by another mission (can't start this one)
  const isMissionLockedByAnother = isOtherMissionLocked && !thisMissionProgress;

  // Mark mission as completed and auto-save when all steps are done
  useEffect(() => {
    if (isComplete && !hasCompletedRef.current && !hasTodayCompletedMission()) {
      hasCompletedRef.current = true;
      completeTodayMission(mission.id);

      // Auto-save to memory when completed via realtime sync
      // Only photo taker (isPhotoTaker) saves to avoid duplicates
      if (!memorySavedRef.current && capturedPhoto && user1Message && user2Message && isPhotoTaker) {
        memorySavedRef.current = true;

        const autoSave = async () => {
          const finalLocation = currentLocation || t('missionDetail.location.noInfo');
          const isCurrentUserCoupleUser1 = user?.id === couple?.user1Id;
          const messageForCoupleUser1 = isCurrentUserCoupleUser1 ? user1Message : user2Message;
          const messageForCoupleUser2 = isCurrentUserCoupleUser1 ? user2Message : user1Message;

          const newMemory: CompletedMission = {
            id: `memory-${Date.now()}`,
            coupleId: couple?.id || 'sample-couple',
            missionId: mission.id,
            mission: mission,
            photoUrl: capturedPhoto,
            user1Message: messageForCoupleUser1,
            user2Message: messageForCoupleUser2,
            location: finalLocation,
            completedAt: new Date(),
          };

          if (!isDemoMode && couple?.id) {
            // Check subscription limit for mission completion
            const subscriptionStore = useSubscriptionStore.getState();
            const canComplete = await subscriptionStore.canCompleteMission(couple.id);
            if (!canComplete) {
              console.log('[MissionComplete] Daily completion limit reached');
              memorySavedRef.current = false;
              return;
            }

            try {
              const isRemoteUrl = capturedPhoto.startsWith('http://') || capturedPhoto.startsWith('https://');
              let finalPhotoUrl = capturedPhoto;
              if (!isRemoteUrl) {
                const uploadedPhotoUrl = await db.storage.uploadPhoto(couple.id, capturedPhoto);
                finalPhotoUrl = uploadedPhotoUrl || capturedPhoto;
              }

              const { data: dbMemory, error: dbError } = await db.completedMissions.create({
                couple_id: couple.id,
                photo_url: finalPhotoUrl,
                user1_message: messageForCoupleUser1,
                user2_message: messageForCoupleUser2,
                location: finalLocation,
                mission_data: {
                  id: mission.id,
                  title: mission.title,
                  description: mission.description,
                  category: mission.category,
                  imageUrl: mission.imageUrl,
                  tags: mission.tags,
                },
              });

              if (dbMemory && !dbError) {
                newMemory.id = dbMemory.id;
                newMemory.photoUrl = finalPhotoUrl;

                // Increment completion count for subscription tracking
                await subscriptionStore.incrementCompletionCount(couple.id);
              }
            } catch (error) {
              console.error('Error auto-saving memory to DB:', error);
            }
          }

          addMemory(newMemory);
          clearInProgressMission(mission.id);
          console.log('[MissionComplete] Auto-saved memory on completion');
        };

        autoSave();
      }
    }
  }, [
    isComplete,
    mission,
    completeTodayMission,
    hasTodayCompletedMission,
    capturedPhoto,
    user1Message,
    user2Message,
    isPhotoTaker,
    currentLocation,
    user?.id,
    couple,
    addMemory,
    clearInProgressMission,
  ]);

  // Loading state for featured missions from DB
  if (isLoadingFeaturedMission && !localMission) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.white} />
        <Text style={styles.loadingText}>{t('common.loading')}</Text>
      </View>
    );
  }

  // Camera UI
  if (showCamera) {
    // Show preview after capturing - display as photocard (same as memories page)
    if (showPreview) {
      // Photocard width: 90% of screen (same as memories FlipCard)
      const photocardWidth = width * 0.9;

      return (
        <View style={styles.cameraContainer}>
          {/* Dark Background */}
          <View style={styles.previewBackground} />

          {/* Preview Header */}
          <View style={styles.cameraHeader}>
            <Pressable
              onPress={handleRetakePhoto}
              style={styles.cameraBackButton}
            >
              <ChevronLeft color={COLORS.white} size={24} />
            </Pressable>
            <Text style={styles.cameraTitle}>{t('missionDetail.camera.confirmTitle')}</Text>
            <View style={styles.headerSpacer} />
          </View>

          {/* Photocard Preview - same size as memories page FlipCard */}
          <View style={styles.photocardPreviewContainer}>
            <View style={[styles.photocardPreview, { width: photocardWidth }]}>
              {isProcessingPhoto ? (
                // Show loading indicator while processing
                <View style={styles.previewLoadingContainer}>
                  <ActivityIndicator size="large" color={COLORS.white} />
                  <Text style={styles.previewLoadingText}>{t('common.loading')}</Text>
                </View>
              ) : previewPhoto ? (
                <ExpoImage
                  source={{ uri: previewPhoto }}
                  style={styles.photocardPreviewImage}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={100}
                />
              ) : null}
            </View>
          </View>

          {/* Confirm Button - only show when photo is ready */}
          {!isProcessingPhoto && previewPhoto && (
            <Pressable onPress={handleConfirmPhoto} style={styles.floatingConfirmButton}>
              <Text style={styles.confirmButtonText}>{t('missionDetail.camera.usePhoto')}</Text>
            </Pressable>
          )}
        </View>
      );
    }

    // Show camera viewfinder - full screen like normal camera
    return (
      <View style={styles.cameraContainer}>
        <View
          style={styles.cameraViewfinder}
          onTouchEnd={(evt) => {
            // Handle single-finger taps for focus (pinch zoom is handled by VisionCamera)
            if (evt.nativeEvent.touches.length === 0 && evt.nativeEvent.changedTouches.length === 1) {
              const touch = evt.nativeEvent.changedTouches[0];
              handleCameraTap(touch.locationX, touch.locationY);
            }
          }}
        >
          {device ? (
            <VisionCamera
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              device={device}
              isActive={showCamera}
              photo={true}
              format={format}
              photoHdr={format?.supportsPhotoHdr}
              photoQualityBalance="quality"
              zoom={device?.neutralZoom ?? 1}
              enableZoomGesture={true}
              torch={flashEnabled && facing === 'back' ? 'on' : 'off'}
              videoStabilizationMode="cinematic-extended"
              lowLightBoost={device?.supportsLowLightBoost}
              onError={handleCameraError}
            />
          ) : (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.white} />
              <Text style={styles.loadingText}>{t('common.loading')}</Text>
            </View>
          )}

          {/* Focus Indicator - pointerEvents none so taps pass through */}
          {focusPoint && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.focusIndicator,
                {
                  left: focusPoint.x - 45,
                  top: focusPoint.y - 45,
                  transform: [
                    {
                      scale: focusAnimValue.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [1.4, 0.9, 1],
                      }),
                    },
                  ],
                  opacity: focusAnimValue.interpolate({
                    inputRange: [0, 0.3, 1],
                    outputRange: [0, 1, 1],
                  }),
                },
              ]}
            >
              <View style={styles.focusIndicatorInner} />
            </Animated.View>
          )}

        </View>

        {/* Camera Header */}
        <View style={styles.cameraHeader}>
          <Pressable
            onPress={() => {
              setShowCamera(false);
              setShowPreview(false);
              showPreviewRef.current = false;
              setPreviewPhoto(null);
            }}
            style={styles.cameraBackButton}
          >
            <X color={COLORS.white} size={24} />
          </Pressable>
          <Text style={styles.cameraTitle}>{t('missionDetail.camera.title')}</Text>
          <Pressable
            onPress={() => setFlashEnabled(!flashEnabled)}
            style={[styles.cameraBackButton, facing === 'front' && styles.cameraButtonDisabled]}
            disabled={facing === 'front'}
          >
            {flashEnabled ? (
              <Zap color={facing === 'front' ? '#666' : '#FFD700'} size={24} />
            ) : (
              <ZapOff color={facing === 'front' ? '#666' : COLORS.white} size={24} />
            )}
          </Pressable>
        </View>

        {/* Capture Button and Camera Switch */}
        <View style={styles.captureButtonContainer}>
          <View style={styles.captureButtonSpacer} />
          <Pressable
            onPress={handleCapture}
            style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]}
            disabled={isCapturing}
          >
            <View style={styles.captureButtonInner} />
          </Pressable>
          <View style={styles.cameraSwitchContainer}>
            <Pressable
              onPress={toggleCameraFacing}
              style={styles.cameraSwitchButton}
            >
              <SwitchCamera color={COLORS.white} size={28} />
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Background - Optimized with expo-image */}
      <View style={styles.backgroundImage}>
        <ExpoImage
          source={{ uri: mission.imageUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={100}
        />
        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={styles.overlay} />
      </View>


      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Pressable onPress={handleBack} style={styles.backButton}>
            <ChevronLeft color={COLORS.white} size={20} />
          </Pressable>
          <Text style={styles.headerTitle}>{t('missionDetail.headerTitle')}</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.headerLine} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Mission Info Card */}
        <View style={styles.missionCard}>
          <BlurView intensity={30} tint="light" style={styles.cardBlur}>
            <View style={styles.missionContent}>
              {/* Title */}
              <Text style={styles.missionTitle}>{mission.title}</Text>

              {/* Description */}
              <Text style={styles.missionDescription}>{mission.description}</Text>

              {/* Tags */}
              {mission.tags.length > 0 && (
                <View style={styles.tagsContainer}>
                  {mission.tags.map((tag, index) => (
                    <View key={index} style={styles.tag}>
                      <Text style={styles.tagText}>#{tag}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </BlurView>
        </View>

        {/* Additional Content Card (Affiliate links, promotional content) */}
        {additionalContent && (
          <View style={styles.additionalContentCard}>
            <BlurView intensity={30} tint="light" style={styles.cardBlur}>
              <View style={styles.additionalContentInner}>
                {renderRichContent(additionalContent)}
              </View>
            </BlurView>
          </View>
        )}

        {/* Mission Steps Card */}
        <View style={styles.stepsCard}>
          <BlurView intensity={30} tint="light" style={styles.cardBlur}>
            <View style={styles.stepsContent}>
              {/* Step 1: Photo */}
              <View style={styles.stepItem}>
                <View style={styles.stepIndicator}>
                  <View
                    style={[
                      styles.stepCircle,
                      photoTaken && styles.stepCircleComplete,
                    ]}
                  >
                    {photoTaken ? (
                      <Check color="#86efac" size={20} />
                    ) : (
                      <Text style={styles.stepNumber}>1</Text>
                    )}
                  </View>
                  <View style={styles.stepLine} />
                </View>
                <View style={styles.stepContent}>
                  <View style={styles.stepTitleRow}>
                    <Camera color={COLORS.white} size={20} />
                    <Text style={styles.stepTitle}>{t('missionDetail.steps.photo.title')}</Text>
                    {photoTaken && <Text style={styles.stepComplete}>{t('missionDetail.steps.complete')}</Text>}
                  </View>
                  <Text style={styles.stepDescription}>
                    {t('missionDetail.steps.photo.description')}
                  </Text>
                  <Text style={styles.stepDescription}>
                    {t('missionDetail.steps.photo.hint')}
                  </Text>
                  {capturedPhoto && (
                    <View style={styles.photoPreviewContainer}>
                      {/* Tap photo to enlarge */}
                      <Pressable onPress={() => setShowEnlargedPhoto(true)}>
                        <ExpoImage
                          source={{ uri: capturedPhoto }}
                          style={styles.photoPreview}
                          contentFit="cover"
                          cachePolicy="memory-disk"
                          transition={100}
                        />
                      </Pressable>
                      {/* Show retake button for both users until mission is complete */}
                      {!isComplete && (
                        <Pressable
                          onPress={handleRetakeFromDetail}
                          style={styles.detailRetakeButton}
                        >
                          <Camera color={COLORS.white} size={16} />
                          <Text style={styles.detailRetakeButtonText}>{t('missionDetail.camera.retake')}</Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              </View>

              {/* Step 2: Messages */}
              <View style={styles.stepItem}>
                <View style={styles.stepIndicator}>
                  <View
                    style={[
                      styles.stepCircle,
                      user1Message && user2Message && styles.stepCircleComplete,
                    ]}
                  >
                    {user1Message && user2Message ? (
                      <Check color="#86efac" size={20} />
                    ) : (
                      <Text style={styles.stepNumber}>2</Text>
                    )}
                  </View>
                </View>
                <View style={styles.stepContent}>
                  <View style={styles.stepTitleRow}>
                    <Edit3 color={COLORS.white} size={20} />
                    <Text style={styles.stepTitle}>{t('missionDetail.steps.message.title')}</Text>
                    {user1Message && user2Message && (
                      <Text style={styles.stepComplete}>{t('missionDetail.steps.complete')}</Text>
                    )}
                  </View>
                  <Text style={styles.stepDescription}>
                    {t('missionDetail.steps.message.description')}
                  </Text>

                  {/* User Status Cards */}
                  <View style={styles.userStatusContainer}>
                    <View style={styles.userStatus}>
                      <View
                        style={[
                          styles.userIcon,
                          user1Message && styles.userIconComplete,
                        ]}
                      >
                        <User
                          color={user1Message ? '#86efac' : 'rgba(255,255,255,0.5)'}
                          size={14}
                        />
                      </View>
                      <View style={styles.userInfo}>
                        <Text style={styles.userLabel}>{t('common.me')}</Text>
                        <Text
                          style={[
                            styles.userStatusText,
                            user1Message && styles.userStatusComplete,
                          ]}
                        >
                          {user1Message ? t('missionDetail.steps.message.written') : t('missionDetail.steps.message.notWritten')}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.userStatus}>
                      <View
                        style={[
                          styles.userIcon,
                          user2Message && styles.userIconComplete,
                        ]}
                      >
                        <User
                          color={user2Message ? '#86efac' : 'rgba(255,255,255,0.5)'}
                          size={14}
                        />
                      </View>
                      <View style={styles.userInfo}>
                        <Text style={styles.userLabel}>{t('common.partner')}</Text>
                        <Text
                          style={[
                            styles.userStatusText,
                            user2Message && styles.userStatusComplete,
                          ]}
                        >
                          {user2Message ? t('missionDetail.steps.message.written') : t('missionDetail.steps.message.notWritten')}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>

            </View>
          </BlurView>
        </View>
      </ScrollView>

      {/* Bottom CTA */}
      <BlurView intensity={40} tint="dark" style={styles.bottomBar}>
        <View style={styles.bottomContent}>
          <Pressable
            style={[
              styles.ctaButton,
              (isWaitingForPartner || isWaitingForPhoto || isMissionLockedByAnother) && styles.ctaButtonDisabled,
              isComplete && styles.ctaButtonComplete,
            ]}
            onPress={
              isComplete
                ? handleCompleteAndClose
                : isWaitingForPartner || isWaitingForPhoto || isMissionLockedByAnother
                  ? undefined
                  : photoTaken
                    ? handleOpenMessageModal
                    : handleTakePhoto
            }
            disabled={!!(isWaitingForPartner || isWaitingForPhoto || isMissionLockedByAnother)}
          >
            {isComplete ? (
              <View style={styles.ctaButtonCompleteContent}>
                <Check color="#86efac" size={18} />
                <Text style={styles.ctaButtonCompleteText}>{t('missionDetail.completeButton')}</Text>
              </View>
            ) : (
              <Text style={[
                styles.ctaButtonText,
                (isWaitingForPartner || isWaitingForPhoto || isMissionLockedByAnother) && styles.ctaButtonTextDisabled,
              ]}>
                {isMissionLockedByAnother
                  ? t('missionDetail.status.anotherInProgress')
                  : isWaitingForPartner
                    ? t('missionDetail.status.waitingPartner')
                    : isWaitingForPhoto
                      ? t('missionDetail.status.waitingPhoto')
                      : photoTaken
                        ? t('missionDetail.status.writeMessage')
                        : t('missionDetail.status.takePhoto')}
              </Text>
            )}
          </Pressable>
        </View>
      </BlurView>

      {/* Message Modal - Small Todo-list Style */}
      <Modal
        visible={showMessageModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMessageModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? -100 : 0}
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowMessageModal(false)}
          />
          <View style={[styles.modalContainer, { width: width - 48 }]}>
            <BlurView intensity={60} tint="dark" style={styles.modalBlur}>
              <View style={styles.modalContent}>
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{t('missionDetail.modal.title')}</Text>
                  <Pressable
                    onPress={() => {
                      setShowMessageModal(false);
                      setMessageText('');
                    }}
                    style={styles.modalCloseButton}
                  >
                    <X color={COLORS.white} size={20} />
                  </Pressable>
                </View>

                <View style={styles.textInputContainer}>
                  <TextInput
                    style={styles.textInput}
                    placeholder={t('missionDetail.modal.placeholder')}
                    placeholderTextColor="rgba(255,255,255,0.5)"
                    value={messageText}
                    onChangeText={setMessageText}
                    maxLength={100}
                    multiline
                    numberOfLines={4}
                  />
                  <Text style={styles.charCount}>{messageText.length}/100</Text>
                </View>

                <Pressable
                  style={[styles.submitButton, !messageText.trim() && styles.submitButtonDisabled]}
                  onPress={handleAddMessage}
                  disabled={!messageText.trim()}
                >
                  <Text style={styles.submitButtonText}>{t('common.done')}</Text>
                </Pressable>
              </View>
            </BlurView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Enlarged Photo Modal with pinch-to-zoom */}
      <Modal
        visible={showEnlargedPhoto}
        transparent
        animationType="fade"
        onRequestClose={() => {
          resetEnlargedZoom();
          setShowEnlargedPhoto(false);
        }}
      >
        <View
          style={styles.enlargedPhotoOverlay}
          onTouchMove={handleEnlargedGesture}
          onTouchEnd={handleEnlargedGestureEnd}
          onTouchCancel={handleEnlargedGestureEnd}
        >
          <View style={styles.enlargedPhotoContainer}>
            {capturedPhoto && (
              <Animated.View
                style={{
                  width: '100%',
                  height: '100%',
                  transform: [
                    { scale: enlargedScaleAnim },
                    { translateX: enlargedTranslateXAnim },
                    { translateY: enlargedTranslateYAnim },
                  ],
                }}
              >
                <ExpoImage
                  source={{ uri: capturedPhoto }}
                  style={styles.enlargedPhoto}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
              </Animated.View>
            )}
          </View>
          {/* Close button */}
          <Pressable
            style={styles.enlargedPhotoCloseButton}
            onPress={() => {
              resetEnlargedZoom();
              setShowEnlargedPhoto(false);
            }}
          >
            <X color={COLORS.white} size={28} />
          </Pressable>
          {/* Zoom indicator - only show when zoomed */}
          {enlargedScaleDisplay > 1 && (
            <View style={styles.zoomLevelIndicator}>
              <Text style={styles.zoomLevelText}>{enlargedScaleDisplay.toFixed(1)}x</Text>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: COLORS.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: COLORS.white,
    fontSize: 14,
    marginTop: 12,
    opacity: 0.7,
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
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  header: {
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: 56,
    paddingBottom: SPACING.md,
  },
  headerLine: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: SPACING.lg,
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    color: COLORS.white,
    fontWeight: '600',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: 140,
  },
  missionCard: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  cardBlur: {
    overflow: 'hidden',
  },
  missionContent: {
    padding: SPACING.lg,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  missionTitle: {
    fontSize: 28,
    color: COLORS.white,
    fontWeight: '700',
    lineHeight: 34,
    marginBottom: 12,
  },
  missionDescription: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 24,
    marginBottom: SPACING.lg,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  tagText: {
    fontSize: 12,
    color: COLORS.white,
  },
  additionalContentCard: {
    borderRadius: 24,
    overflow: 'hidden',
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  additionalContentInner: {
    padding: SPACING.lg,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  additionalContentText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    lineHeight: 22,
  },
  additionalContentLink: {
    fontSize: 14,
    color: '#60A5FA',
    lineHeight: 22,
    textDecorationLine: 'underline',
    marginVertical: 4,
  },
  additionalContentImageContainer: {
    marginVertical: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  additionalContentImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
  },
  stepsCard: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  stepsContent: {
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING.lg,
    paddingBottom: 0,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  completeBadgeContainer: {
    alignItems: 'center',
    marginTop: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  completeBadgeContainerTop: {
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  completeBadgeContainerBottom: {
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  completeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(74,222,128,0.2)',
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(134,239,172,0.4)',
    gap: 6,
  },
  completeText: {
    fontSize: 13,
    color: '#86efac',
    fontWeight: '600',
  },
  stepItem: {
    flexDirection: 'row',
    marginBottom: SPACING.lg,
  },
  stepIndicator: {
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  stepCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleComplete: {
    backgroundColor: 'rgba(74,222,128,0.3)',
    borderColor: 'rgba(134,239,172,0.4)',
  },
  stepNumber: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: '600',
  },
  stepLine: {
    width: 2,
    flex: 1,
    minHeight: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginTop: 8,
  },
  stepContent: {
    flex: 1,
    paddingBottom: 8,
  },
  stepTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  stepTitle: {
    fontSize: 15,
    color: COLORS.white,
    fontWeight: '600',
  },
  stepComplete: {
    fontSize: 13,
    color: '#86efac',
    fontWeight: '500',
  },
  stepDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    lineHeight: 21,
  },
  photoPreviewContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  photoPreview: {
    width: '80%',
    aspectRatio: 3 / 4,
    borderRadius: 12,
  },
  userStatusContainer: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  userStatus: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    gap: 8,
  },
  userIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userIconComplete: {
    backgroundColor: 'rgba(74,222,128,0.3)',
    borderColor: 'rgba(134,239,172,0.4)',
  },
  userInfo: {
    flex: 1,
  },
  userLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
  },
  userStatusText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.5)',
    fontWeight: '500',
  },
  userStatusComplete: {
    color: '#86efac',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  bottomContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.md,
    paddingBottom: 28,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  ctaButton: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 100,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  ctaButtonText: {
    fontSize: 16,
    color: COLORS.black,
    fontWeight: '600',
  },
  ctaButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  ctaButtonTextDisabled: {
    color: 'rgba(0,0,0,0.4)',
  },
  ctaButtonComplete: {
    backgroundColor: 'rgba(74, 222, 128, 0.2)',
    borderColor: 'rgba(74, 222, 128, 0.5)',
  },
  ctaButtonCompleteContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ctaButtonCompleteText: {
    fontSize: 16,
    color: '#86efac',
    fontWeight: '600',
  },
  // Camera Styles
  cameraContainer: {
    flex: 1,
    backgroundColor: COLORS.black,
  },
  cameraViewfinder: {
    flex: 1,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.lg,
    paddingTop: 56,
    paddingBottom: SPACING.md,
  },
  cameraBackButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cameraButtonDisabled: {
    opacity: 0.5,
  },
  cameraTitle: {
    fontSize: 16,
    color: COLORS.white,
    fontWeight: '600',
  },
  captureButtonContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 60,
  },
  captureButtonSpacer: {
    width: 50, // Match camera switch button width for balance
  },
  cameraSwitchContainer: {
    width: 50, // Fixed width to prevent layout shift
    alignItems: 'center',
  },
  cameraSwitchButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  zoomIndicatorContainer: {
    position: 'absolute',
    bottom: 140,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  zoomIndicator: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 20,
  },
  zoomIndicatorText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '600',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.white,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButtonInner: {
    width: '100%',
    height: '100%',
    borderRadius: 40,
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  // Preview Buttons
  previewButtonContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: SPACING.lg,
  },
  retakeButton: {
    flex: 1,
    paddingVertical: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 100,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  retakeButtonText: {
    fontSize: 16,
    color: COLORS.white,
    fontWeight: '600',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 16,
    backgroundColor: COLORS.white,
    borderRadius: 100,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    color: COLORS.black,
    fontWeight: '600',
  },
  floatingConfirmButton: {
    position: 'absolute',
    bottom: 50,
    left: SPACING.lg,
    right: SPACING.lg,
    paddingVertical: 16,
    backgroundColor: COLORS.white,
    borderRadius: 100,
    alignItems: 'center',
  },
  // Preview Frame styles (3:4 aspect ratio)
  previewBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.black,
  },
  previewCenterContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewFrameContainer: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
  },
  previewFrameImage: {
    width: '100%',
    height: '100%',
  },
  // Capture Area styles (3:4 aspect ratio)
  captureAreaOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  captureAreaDark: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  captureAreaFrame: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: COLORS.white,
    borderRadius: 16,
  },
  // Crop styles
  cropOverlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cropOverlay: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  cropFrame: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  cropCornerHandle: {
    position: 'absolute',
    width: 40,
    height: 40,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cropCornerTL: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: COLORS.white,
  },
  cropCornerTR: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 20,
    height: 20,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: COLORS.white,
  },
  cropCornerBL: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 20,
    height: 20,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: COLORS.white,
  },
  cropCornerBR: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 20,
    height: 20,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: COLORS.white,
  },
  cropGridLine: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  cropGridLineH1: {
    left: 0,
    right: 0,
    top: '33.33%',
    height: 1,
  },
  cropGridLineH2: {
    left: 0,
    right: 0,
    top: '66.66%',
    height: 1,
  },
  cropGridLineV1: {
    top: 0,
    bottom: 0,
    left: '33.33%',
    width: 1,
  },
  cropGridLineV2: {
    top: 0,
    bottom: 0,
    left: '66.66%',
    width: 1,
  },
  detailRetakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
    paddingVertical: 10,
    width: '80%',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  detailRetakeButtonText: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: '500',
  },
  // Photo Preview with Filters
  photoPreviewWrapper: {
    flex: 1,
    position: 'relative',
  },
  filterOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  bwOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(128, 128, 128, 0.3)',
  },
  previewBottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 40,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  filterScrollView: {
    marginBottom: 16,
  },
  filterScrollContent: {
    paddingHorizontal: SPACING.lg,
    gap: 12,
  },
  filterOption: {
    alignItems: 'center',
    gap: 8,
    opacity: 0.7,
  },
  filterOptionSelected: {
    opacity: 1,
  },
  filterPreviewContainer: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  filterPreviewSelected: {
    borderColor: COLORS.white,
    borderWidth: 3,
  },
  filterPreviewImage: {
    width: '100%',
    height: '100%',
  },
  filterPreviewOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  filterPreviewBw: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(128, 128, 128, 0.5)',
  },
  filterName: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    fontWeight: '500',
  },
  filterNameSelected: {
    color: COLORS.white,
    fontWeight: '600',
  },
  confirmButtonContainer: {
    paddingHorizontal: SPACING.lg,
  },
  // Modal Styles - Small Todo-list Style
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalContainer: {
    // width is set dynamically inline using (width - 48)
    maxWidth: 340,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  modalBlur: {
    overflow: 'hidden',
  },
  modalContent: {
    padding: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 17,
    color: COLORS.white,
    fontWeight: '600',
  },
  textInputContainer: {
    marginBottom: 16,
  },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 16,
    padding: 16,
    color: COLORS.white,
    fontSize: 15,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  charCount: {
    position: 'absolute',
    bottom: 8,
    right: 12,
    fontSize: 12,
    color: 'rgba(255,255,255,0.4)',
  },
  submitButton: {
    paddingVertical: 14,
    backgroundColor: COLORS.white,
    borderRadius: 100,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  submitButtonText: {
    fontSize: 15,
    color: COLORS.black,
    fontWeight: '600',
  },
  // Frame guide overlay styles for 3:4 camera viewfinder
  frameGuideOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  frameGuideDark: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  frameGuideBorder: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.6)',
    borderRadius: 16,
  },
  // Crop guide overlay styles for preview
  cropGuideOverlay: {
    position: 'absolute',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  cropGuideBorder: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    borderRadius: 12,
  },
  // Photocard preview styles (matches memories FlipCard)
  photocardPreviewContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80, // Space for header
    paddingBottom: 100, // Space for button
  },
  photocardPreview: {
    aspectRatio: 3 / 4,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  photocardPreviewImage: {
    width: '100%',
    height: '100%',
  },
  previewLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.black,
  },
  previewLoadingText: {
    color: COLORS.white,
    fontSize: 14,
    marginTop: 12,
    opacity: 0.7,
  },
  // Enlarged photo modal styles
  enlargedPhotoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  enlargedPhotoContainer: {
    width: '100%',
    height: '80%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  enlargedPhoto: {
    width: '100%',
    height: '100%',
  },
  enlargedPhotoCloseButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomLevelIndicator: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  zoomLevelText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '600',
  },
  // Focus indicator styles (tap to focus)
  focusIndicator: {
    position: 'absolute',
    width: 90,
    height: 90,
    justifyContent: 'center',
    alignItems: 'center',
  },
  focusIndicatorInner: {
    width: 90,
    height: 90,
    borderWidth: 2,
    borderColor: '#FFD700',
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  // Camera error styles
  cameraErrorText: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  cameraErrorDetail: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 40,
  },
  cameraErrorButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  cameraErrorButtonText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '600',
  },
});
