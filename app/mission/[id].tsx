import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Pressable,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Image as RNImage,
  GestureResponderEvent,
} from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { BlurView } from 'expo-blur';
import { CameraView, useCameraPermissions } from 'expo-camera';
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
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { COLORS, SPACING, RADIUS, TYPOGRAPHY } from '@/constants/design';
import { useMissionStore } from '@/stores/missionStore';
import { useMemoryStore } from '@/stores/memoryStore';
import { useAuthStore } from '@/stores/authStore';
import { useCoupleSyncStore } from '@/stores/coupleSyncStore';
import { db, isDemoMode } from '@/lib/supabase';
import type { CompletedMission, Mission } from '@/types';

const { width, height } = Dimensions.get('window');

export default function MissionDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [photoTaken, setPhotoTaken] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [user1Message, setUser1Message] = useState<string | null>(null);
  const [user2Message, setUser2Message] = useState<string | null>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [isCapturing, setIsCapturing] = useState(false);

  // Track if current user is the photo taker (user1 in mission progress)
  const [isPhotoTaker, setIsPhotoTaker] = useState(true);

  // Zoom state for pinch-to-zoom (0 = 1x default, 1 = max zoom ~4x)
  const [zoom, setZoom] = useState(0);
  const lastPinchDistance = useRef<number | null>(null);

  // Photo aspect ratio state - always 3:4 portrait frame
  const [photoAspectRatio, setPhotoAspectRatio] = useState<number>(3 / 4); // Always portrait 3:4
  // Track if captured photo is landscape (for cover mode display)
  const [isLandscapePhoto, setIsLandscapePhoto] = useState(false);

  // Location state for photo
  const [currentLocation, setCurrentLocation] = useState<string | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

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
  } = useCoupleSyncStore();

  // Find mission in today's missions, kept missions, or provide a fallback
  const mission: Mission =
    todayMissions.find((m) => m.id === id) ||
    keptMissions.find((m) => m.id === id) ||
    {
      id: id || 'unknown',
      title: '미션을 찾을 수 없습니다',
      description: '이 미션은 더 이상 사용할 수 없습니다.',
      category: 'home' as const,
      tags: [],
      imageUrl: '',
      isPremium: false,
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
        setUser1Message('완료됨');
        setUser2Message('완료됨');
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

  // Pinch-to-zoom gesture handler
  const handlePinchMove = (evt: GestureResponderEvent) => {
    const touches = evt.nativeEvent.touches;
    if (touches.length === 2) {
      const touch1 = touches[0];
      const touch2 = touches[1];

      const dx = touch1.pageX - touch2.pageX;
      const dy = touch1.pageY - touch2.pageY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (lastPinchDistance.current !== null) {
        const diff = distance - lastPinchDistance.current;
        // Adjust zoom based on pinch distance change
        setZoom((prevZoom) => {
          const newZoom = prevZoom + diff * 0.003; // Sensitivity factor
          return Math.max(0, Math.min(1, newZoom));
        });
      }
      lastPinchDistance.current = distance;
    }
  };

  const handlePinchEnd = () => {
    lastPinchDistance.current = null;
  };

  const handleTakePhoto = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert(
          '카메라 권한 필요',
          '사진을 촬영하려면 카메라 권한이 필요합니다.',
          [{ text: '확인' }]
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
        const photo = await cameraRef.current.takePictureAsync({
          quality: 1.0, // Maximum quality at capture
          skipProcessing: true,
        });

        if (photo) {
          // Get original image dimensions
          RNImage.getSize(photo.uri, async (originalWidth: number, originalHeight: number) => {
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

              // Step 2: Calculate crop to match what was visible in preview
              // The preview uses "cover" mode, so we need to crop to the visible region
              const screenAspect = width / height;
              const imageAspect = currentWidth / currentHeight;

              let visibleWidth = currentWidth;
              let visibleHeight = currentHeight;
              let offsetX = 0;
              let offsetY = 0;

              if (imageAspect > screenAspect) {
                // Image is wider than screen - sides were cropped in preview
                visibleWidth = Math.round(currentHeight * screenAspect);
                offsetX = Math.round((currentWidth - visibleWidth) / 2);
              } else {
                // Image is taller than screen - top/bottom were cropped in preview
                visibleHeight = Math.round(currentWidth / screenAspect);
                offsetY = Math.round((currentHeight - visibleHeight) / 2);
              }

              // Step 3: Now crop to 3:4 within the visible region
              // Frame guide is 85% of screen width, centered
              const frameRatio = 0.85;
              const targetAspect = 3 / 4;

              // Calculate frame position within visible region
              const frameWidthInImage = Math.round(visibleWidth * frameRatio);
              const frameHeightInImage = Math.round(frameWidthInImage / targetAspect);

              // Center the frame within the visible region
              const frameOffsetX = Math.round((visibleWidth - frameWidthInImage) / 2);
              // Account for the -40 pixel vertical offset of the frame guide
              const verticalOffsetRatio = 40 / height;
              const frameOffsetY = Math.round((visibleHeight - frameHeightInImage) / 2 - visibleHeight * verticalOffsetRatio);

              // Final crop coordinates (relative to full image)
              const cropX = Math.max(0, offsetX + frameOffsetX);
              const cropY = Math.max(0, offsetY + frameOffsetY);
              const cropWidth = Math.min(frameWidthInImage, currentWidth - cropX);
              const cropHeight = Math.min(frameHeightInImage, currentHeight - cropY);

              manipulations.push({
                crop: {
                  originX: cropX,
                  originY: cropY,
                  width: cropWidth,
                  height: cropHeight,
                },
              });

              // Step 4: Flip horizontally for selfie (front camera)
              if (facing === 'front') {
                manipulations.push({ flip: ImageManipulator.FlipType.Horizontal });
              }

              // Apply all manipulations
              const result = await ImageManipulator.manipulateAsync(
                photo.uri,
                manipulations,
                { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG } // High quality compression
              );

              // Set the cropped image - always 3:4 portrait
              setPhotoAspectRatio(3 / 4);
              setIsLandscapePhoto(false);
              setPreviewPhoto(result.uri);
              setShowPreview(true);
            } catch (manipError) {
              console.error('Image manipulation error:', manipError);
              setPhotoAspectRatio(3 / 4);
              setIsLandscapePhoto(false);
              setPreviewPhoto(photo.uri);
              setShowPreview(true);
            }
          }, (error: Error) => {
            console.error('Failed to get original image size:', error);
            setPhotoAspectRatio(3 / 4);
            setIsLandscapePhoto(false);
            setPreviewPhoto(photo.uri);
            setShowPreview(true);
          });
        }
      } catch (error) {
        console.error('Failed to take picture:', error);
        Alert.alert('오류', '사진 촬영에 실패했습니다. 다시 시도해주세요.');
      } finally {
        setIsCapturing(false);
      }
    }
  };

  // Function to get current location with reverse geocoding
  const getCurrentLocationName = async (): Promise<string> => {
    try {
      setIsLoadingLocation(true);

      // Request location permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        console.log('Location permission denied');
        return '위치 정보 없음';
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
        // Build location string (Korean format: district + city or name)
        const parts: string[] = [];

        // Try to get the most specific location name
        if (address.name && !address.name.match(/^\d/)) {
          // If name exists and doesn't start with number (not just street number)
          parts.push(address.name);
        } else if (address.street) {
          parts.push(address.street);
        }

        if (address.district) {
          parts.push(address.district);
        } else if (address.subregion) {
          parts.push(address.subregion);
        }

        if (address.city) {
          parts.push(address.city);
        }

        // Return formatted location (최대 2-3 요소만)
        if (parts.length > 0) {
          return parts.slice(0, 2).join(', ');
        }

        // Fallback to region if no specific location
        if (address.region) {
          return address.region;
        }
      }

      return '위치 정보 없음';
    } catch (error) {
      console.error('Error getting location:', error);
      return '위치 정보 없음';
    } finally {
      setIsLoadingLocation(false);
    }
  };

  const handleConfirmPhoto = async () => {
    if (previewPhoto) {
      setCapturedPhoto(previewPhoto);
      setPhotoTaken(true);
      setShowCamera(false);
      setShowPreview(false);
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
            if (!thisMissionProgress) {
              // No progress for this mission - start new mission progress
              const progress = await startMissionProgress(mission.id, mission);
              if (progress) {
                // Upload photo to the progress
                await uploadMissionPhoto(uploadedPhotoUrl, progress.id);
                // Update location
                if (locationName && locationName !== '위치 정보 없음') {
                  await updateMissionLocation(locationName, progress.id);
                }
              }
            } else {
              // Same mission already started (maybe by partner), just upload photo
              await uploadMissionPhoto(uploadedPhotoUrl, thisMissionProgress.id);
              if (locationName && locationName !== '위치 정보 없음') {
                await updateMissionLocation(locationName, thisMissionProgress.id);
              }
            }
          }
        } catch (error) {
          console.error('Error syncing photo:', error);
          // Local save already done, continue even if sync fails
        }
      }
    }
  };

  const handleRetakePhoto = () => {
    setPreviewPhoto(null);
    setShowPreview(false);
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
          const partnerMessage = '너와 함께여서 행복해 💕';
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
      const finalLocation = currentLocation || '위치 정보 없음';

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
    router.back();
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
          const finalLocation = currentLocation || '위치 정보 없음';
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

  // Camera UI
  if (showCamera) {
    // Show preview after capturing
    if (showPreview && previewPhoto) {
      // Calculate preview dimensions based on current photo aspect ratio
      // Max dimensions for preview area
      const maxPreviewWidth = width * 0.85;
      const maxPreviewHeight = maxPreviewWidth * (4 / 3);

      // Calculate actual preview size based on photo aspect ratio
      let previewWidth: number;
      let previewHeight: number;

      if (photoAspectRatio >= 1) {
        // Landscape or square - fit to width
        previewWidth = maxPreviewWidth;
        previewHeight = previewWidth / photoAspectRatio;
        // If height exceeds max, scale down
        if (previewHeight > maxPreviewHeight) {
          previewHeight = maxPreviewHeight;
          previewWidth = previewHeight * photoAspectRatio;
        }
      } else {
        // Portrait - fit to height first, then check width
        previewHeight = maxPreviewHeight;
        previewWidth = previewHeight * photoAspectRatio;
        // If width exceeds max, scale down
        if (previewWidth > maxPreviewWidth) {
          previewWidth = maxPreviewWidth;
          previewHeight = previewWidth / photoAspectRatio;
        }
      }

      const previewTop = (height - previewHeight) / 2 - 40;

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
            <Text style={styles.cameraTitle}>사진 확인</Text>
            <View style={styles.headerSpacer} />
          </View>

          {/* Photo Preview - adapts to photo aspect ratio */}
          <View style={[styles.previewFrameContainer, {
            position: 'absolute',
            top: previewTop,
            left: (width - previewWidth) / 2,
            width: previewWidth,
            height: previewHeight
          }]}>
            <ExpoImage
              source={{ uri: previewPhoto }}
              style={styles.previewFrameImage}
              contentFit="contain"
              cachePolicy="memory-disk"
              transition={100}
            />
          </View>

          {/* Confirm Button */}
          <Pressable onPress={handleConfirmPhoto} style={styles.floatingConfirmButton}>
            <Text style={styles.confirmButtonText}>사용하기</Text>
          </Pressable>
        </View>
      );
    }

    // Show camera viewfinder with 3:4 frame guide
    // Calculate 3:4 frame dimensions (width 3, height 4)
    const frameWidth = width * 0.85;
    const frameHeight = frameWidth * (4 / 3);
    const frameTop = (height - frameHeight) / 2 - 40; // Offset for header/buttons

    return (
      <View style={styles.cameraContainer}>
        <View
          style={styles.cameraViewfinder}
          onTouchMove={handlePinchMove}
          onTouchEnd={handlePinchEnd}
          onTouchCancel={handlePinchEnd}
        >
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing={facing}
            mode="picture"
            zoom={zoom}
          />
        </View>

        {/* 3:4 Frame Guide Overlay */}
        <View style={styles.frameGuideOverlay} pointerEvents="none">
          {/* Top dark area */}
          <View style={[styles.frameGuideDark, { top: 0, left: 0, right: 0, height: frameTop }]} />
          {/* Bottom dark area */}
          <View style={[styles.frameGuideDark, { top: frameTop + frameHeight, left: 0, right: 0, bottom: 0 }]} />
          {/* Left dark area */}
          <View style={[styles.frameGuideDark, { top: frameTop, left: 0, width: (width - frameWidth) / 2, height: frameHeight }]} />
          {/* Right dark area */}
          <View style={[styles.frameGuideDark, { top: frameTop, right: 0, width: (width - frameWidth) / 2, height: frameHeight }]} />
          {/* Frame border */}
          <View style={[styles.frameGuideBorder, {
            top: frameTop,
            left: (width - frameWidth) / 2,
            width: frameWidth,
            height: frameHeight
          }]} />
        </View>

        {/* Camera Header */}
        <View style={styles.cameraHeader}>
          <Pressable
            onPress={() => {
              setShowCamera(false);
              setShowPreview(false);
              setPreviewPhoto(null);
            }}
            style={styles.cameraBackButton}
          >
            <X color={COLORS.white} size={24} />
          </Pressable>
          <Text style={styles.cameraTitle}>사진 촬영</Text>
          <Pressable
            onPress={toggleCameraFacing}
            style={styles.cameraBackButton}
          >
            <SwitchCamera color={COLORS.white} size={24} />
          </Pressable>
        </View>

        {/* Zoom Level Indicator - 1.0x to 4.0x */}
        {zoom > 0.01 && (
          <View style={styles.zoomIndicatorContainer}>
            <View style={styles.zoomIndicator}>
              <Text style={styles.zoomIndicatorText}>
                {(1.0 + zoom * 3.0).toFixed(1)}x
              </Text>
            </View>
          </View>
        )}

        {/* Capture Button */}
        <View style={styles.captureButtonContainer}>
          <Pressable
            onPress={handleCapture}
            style={[styles.captureButton, isCapturing && styles.captureButtonDisabled]}
            disabled={isCapturing}
          >
            <View style={styles.captureButtonInner} />
          </Pressable>
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
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeft color={COLORS.white} size={20} />
          </Pressable>
          <Text style={styles.headerTitle}>미션 상세</Text>
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
                    <Text style={styles.stepTitle}>사진 촬영하기</Text>
                    {photoTaken && <Text style={styles.stepComplete}>완료</Text>}
                  </View>
                  <Text style={styles.stepDescription}>
                    두 분의 특별한 순간을 사진으로 담아주세요.
                  </Text>
                  <Text style={styles.stepDescription}>
                    지금 이 순간의 설렘과 행복을 사진에 담아{'\n'}추억으로 만들어보세요.
                  </Text>
                  {capturedPhoto && (
                    <View style={styles.photoPreviewContainer}>
                      <ExpoImage
                        source={{ uri: capturedPhoto }}
                        style={[styles.photoPreview, { aspectRatio: photoAspectRatio }]}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                        transition={100}
                      />
                      {/* Only show retake button to the photo taker, not the partner */}
                      {!isComplete && isPhotoTaker && (
                        <Pressable
                          onPress={handleRetakeFromDetail}
                          style={styles.detailRetakeButton}
                        >
                          <Camera color={COLORS.white} size={16} />
                          <Text style={styles.detailRetakeButtonText}>다시 찍기</Text>
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
                    <Text style={styles.stepTitle}>서로에게 한마디 작성하기</Text>
                    {user1Message && user2Message && (
                      <Text style={styles.stepComplete}>완료</Text>
                    )}
                  </View>
                  <Text style={styles.stepDescription}>
                    이 순간 상대방에게 전하고 싶은 마음을 글로 남겨보세요. 진심이 담긴 메시지가 더 특별한 추억을{'\n'}만듭니다.
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
                        <Text style={styles.userLabel}>나</Text>
                        <Text
                          style={[
                            styles.userStatusText,
                            user1Message && styles.userStatusComplete,
                          ]}
                        >
                          {user1Message ? '작성 완료' : '미작성'}
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
                        <Text style={styles.userLabel}>상대방</Text>
                        <Text
                          style={[
                            styles.userStatusText,
                            user2Message && styles.userStatusComplete,
                          ]}
                        >
                          {user2Message ? '작성 완료' : '미작성'}
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
                <Text style={styles.ctaButtonCompleteText}>미션 완료! 🎉</Text>
              </View>
            ) : (
              <Text style={[
                styles.ctaButtonText,
                (isWaitingForPartner || isWaitingForPhoto || isMissionLockedByAnother) && styles.ctaButtonTextDisabled,
              ]}>
                {isMissionLockedByAnother
                  ? '다른 미션 진행 중'
                  : isWaitingForPartner
                    ? '상대방 대기 중...'
                    : isWaitingForPhoto
                      ? '사진 대기 중...'
                      : photoTaken
                        ? '서로에게 한마디 작성'
                        : '사진 촬영'}
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
          style={styles.modalOverlay}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setShowMessageModal(false)}
          />
          <View style={styles.modalContainer}>
            <BlurView intensity={60} tint="dark" style={styles.modalBlur}>
              <View style={styles.modalContent}>
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>서로에게 한마디</Text>
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
                    placeholder="상대방에게 전하고 싶은 말을 적어주세요"
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
                  <Text style={styles.submitButtonText}>완료</Text>
                </Pressable>
              </View>
            </BlurView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.black,
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
    alignItems: 'center',
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
    width: width - 48,
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
});
