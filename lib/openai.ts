// OpenAI Service
import type { Mission } from "@/types";
import type { OnboardingData } from "@/stores/onboardingStore";
import type { TodayMood } from "@/stores/missionStore";

const OPENAI_API_KEY = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
export interface UserPreferences { mbti?: string; activityTypes?: string[]; dateWorries?: string[]; }
