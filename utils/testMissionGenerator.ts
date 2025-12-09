/**
 * Test utility for mission generation with OpenAI
 *
 * Usage:
 * 1. Import this function in your component
 * 2. Call it with sample data to test AI mission generation
 * 3. Check console for results
 */

import { generateMissionsWithAI, generateMissionsFallback } from '@/services/missionGenerator';
import type { MissionGenerationAnswers } from '@/stores/missionStore';

export async function testMissionGeneration() {
  console.log('🎯 Starting mission generation test...');

  // Sample test data
  const testAnswers: MissionGenerationAnswers = {
    canMeetToday: true,
    todayMoods: ['romantic', 'fun'],
  };

  try {
    console.log('📝 Test input:', testAnswers);

    const missions = await generateMissionsWithAI({
      todayAnswers: testAnswers,
    });

    console.log('✅ AI Mission generation successful!');
    console.log('🎉 Generated missions:', missions);

    missions.forEach((mission, index) => {
      console.log(`\n📌 Mission ${index + 1}:`);
      console.log(`   Title: ${mission.title}`);
      console.log(`   Description: ${mission.description}`);
      console.log(`   Category: ${mission.category}`);
      console.log(`   Difficulty: ${mission.difficulty}`);
      console.log(`   Tags: ${mission.tags.join(', ')}`);
    });

    return missions;
  } catch (error) {
    console.error('❌ AI mission generation failed:', error);
    console.log('🔄 Using fallback missions instead...');

    const fallbackMissions = generateMissionsFallback(testAnswers.todayMoods);
    console.log('✅ Fallback missions:', fallbackMissions);

    return fallbackMissions;
  }
}

// Sample test scenarios
export const testScenarios: Record<string, MissionGenerationAnswers> = {
  romanticDate: {
    canMeetToday: true,
    todayMoods: ['romantic', 'deep_talk'],
  },
  funAndAdventure: {
    canMeetToday: true,
    todayMoods: ['fun', 'adventure'],
  },
  healingAtHome: {
    canMeetToday: false,
    todayMoods: ['healing', 'deep_talk'],
  },
  quickFun: {
    canMeetToday: true,
    todayMoods: ['fun'],
  },
};

export async function testAllScenarios() {
  console.log('🧪 Testing all scenarios...\n');

  for (const [name, scenario] of Object.entries(testScenarios)) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Testing: ${name}`);
    console.log(`${'='.repeat(50)}`);

    try {
      const missions = await generateMissionsWithAI({
        todayAnswers: scenario,
      });

      console.log(`✅ ${name} - Success! Generated ${missions.length} missions`);
    } catch (error) {
      console.error(`❌ ${name} - Failed:`, error);
    }

    // Wait a bit between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('\n🏁 All scenarios tested!');
}
