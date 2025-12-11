import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ImageBackground,
  Dimensions,
  Pressable,
  ScrollView,
  Alert,
} from 'react-native';
import {
  User,
  Heart,
  Settings,
  ChevronRight,
  RotateCcw,
  Megaphone,
  Headphones,
  LogOut,
  Trash2,
} from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { COLORS, SPACING } from '@/constants/design';
import { useBackground } from '@/contexts';
import { useAuthStore, useOnboardingStore, useMissionStore } from '@/stores';
import { useCoupleSyncStore } from '@/stores/coupleSyncStore';

const { width, height } = Dimensions.get('window');


type MenuItemType = {
  icon: React.ComponentType<{ color: string; size: number }>;
  label: string;
  onPress: () => void;
};

type MenuSectionType = {
  title: string;
  items: MenuItemType[];
};

export default function MoreScreen() {
  const { backgroundImage } = useBackground();
  const router = useRouter();
  const resetOnboarding = useOnboardingStore((state) => state.reset);
  const setIsOnboardingComplete = useAuthStore((state) => state.setIsOnboardingComplete);
  const resetAllTodayMissions = useMissionStore((state) => state.resetAllTodayMissions);
  const resetAuth = useAuthStore((state) => state.reset);
  const coupleSyncCleanup = useCoupleSyncStore((state) => state.cleanup);

  const handleDevReset = () => {
    Alert.alert(
      '개발자 리셋',
      '온보딩 상태를 초기화하고 처음부터 다시 시작하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '초기화',
          style: 'destructive',
          onPress: async () => {
            resetOnboarding();
            setIsOnboardingComplete(false);
            // Reset home tutorial so it shows again after onboarding
            await AsyncStorage.removeItem('hasSeenHomeTutorial');
            router.replace('/(auth)/onboarding');
          },
        },
      ]
    );
  };

  const handleMissionReset = () => {
    Alert.alert(
      '미션 리셋',
      '오늘의 미션과 완료 상태를 모두 초기화하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '리셋',
          style: 'destructive',
          onPress: () => {
            resetAllTodayMissions();
            Alert.alert(
              '리셋 완료',
              '미션이 초기화되었습니다. 미션 탭으로 이동하여 새로운 미션을 생성하세요.',
              [{ text: '확인' }]
            );
          },
        },
      ]
    );
  };

  const handleFullReset = () => {
    Alert.alert(
      '⚠️ 완전 리셋',
      '모든 데이터를 초기화합니다.\n\n• 온보딩 데이터\n• 페어링 정보\n• 커플 동기화 데이터\n• 미션 데이터\n• 모든 로컬 저장소\n\n정말 초기화하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '완전 초기화',
          style: 'destructive',
          onPress: async () => {
            // 1. 커플 동기화 정리
            coupleSyncCleanup();
            // 2. 온보딩 리셋
            resetOnboarding();
            // 3. 미션 리셋
            resetAllTodayMissions();
            // 4. Auth 리셋
            resetAuth();
            // 5. AsyncStorage 완전 삭제
            await AsyncStorage.clear();

            Alert.alert(
              '초기화 완료',
              '모든 데이터가 초기화되었습니다. 앱을 다시 시작합니다.',
              [
                {
                  text: '확인',
                  onPress: () => router.replace('/(auth)/onboarding'),
                },
              ]
            );
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert(
      '로그아웃',
      '정말 로그아웃 하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '로그아웃',
          style: 'destructive',
          onPress: async () => {
            resetOnboarding();
            setIsOnboardingComplete(false);
            await AsyncStorage.removeItem('hasSeenHomeTutorial');
            router.replace('/(auth)/onboarding');
          },
        },
      ]
    );
  };

  const menuSections: MenuSectionType[] = [
    {
      title: '프로필',
      items: [
        { icon: User, label: '내 프로필', onPress: () => router.push('/more/my-profile') },
        { icon: Heart, label: '커플 프로필', onPress: () => router.push('/more/couple-profile') },
      ],
    },
    {
      title: '설정',
      items: [
        { icon: Settings, label: '설정', onPress: () => router.push('/more/settings') },
      ],
    },
    {
      title: '지원',
      items: [
        { icon: Megaphone, label: '공지사항', onPress: () => router.push('/more/announcements') },
        { icon: Headphones, label: '고객센터', onPress: () => router.push('/more/customer-service') },
      ],
    },
    {
      title: '개발자',
      items: [
        { icon: RotateCcw, label: '온보딩 리셋', onPress: handleDevReset },
        { icon: RotateCcw, label: '미션 리셋', onPress: handleMissionReset },
        { icon: Trash2, label: '완전 리셋', onPress: handleFullReset },
      ],
    },
  ];

  const renderMenuItem = (
    item: MenuItemType,
    isLast: boolean,
    itemIndex: number
  ) => {
    const IconComponent = item.icon;

    return (
      <Pressable
        key={itemIndex}
        style={[
          styles.menuItem,
          !isLast && styles.menuItemBorder,
        ]}
        onPress={item.onPress}
      >
        <View style={styles.menuItemLeft}>
          <IconComponent color="rgba(255, 255, 255, 0.8)" size={22} />
          <Text style={styles.menuItemLabel}>{item.label}</Text>
        </View>
        <ChevronRight color="rgba(255, 255, 255, 0.4)" size={20} />
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      {/* Background */}
      <ImageBackground
        source={backgroundImage}
        defaultSource={require('@/assets/images/backgroundimage.png')}
        style={styles.backgroundImage}
        imageStyle={styles.backgroundImageStyle}
        blurRadius={40}
      />
      <View style={styles.overlay} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>더보기</Text>
        </View>

        {/* Menu Sections */}
        {menuSections.map((section, sectionIndex) => (
          <View key={sectionIndex} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.menuCard}>
              {section.items.map((item, itemIndex) => {
                const isLast = itemIndex === section.items.length - 1;
                return renderMenuItem(item, isLast, itemIndex);
              })}
            </View>
          </View>
        ))}

        {/* Logout Button - Red Glass Style */}
        <Pressable style={styles.logoutButton} onPress={handleLogout}>
          <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
          <LogOut color="#ff4444" size={20} />
          <Text style={styles.logoutButtonText}>로그아웃</Text>
        </Pressable>
      </ScrollView>
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
  backgroundImageStyle: {
    transform: [{ scale: 1.0 }],
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: SPACING.lg,
    paddingTop: 64,
    paddingBottom: 120,
  },
  header: {
    marginBottom: SPACING.xl,
  },
  headerTitle: {
    fontSize: 32,
    color: COLORS.white,
    fontWeight: '700',
    lineHeight: 38,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.6)',
    fontWeight: '500',
    marginBottom: SPACING.sm,
    marginLeft: SPACING.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuCard: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.lg,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuItemLabel: {
    fontSize: 16,
    color: COLORS.white,
    marginLeft: SPACING.md,
    fontWeight: '400',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.sm,
    marginTop: SPACING.xl,
    marginHorizontal: SPACING.xs,
    paddingVertical: 16,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.3)',
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ff4444',
  },
});
