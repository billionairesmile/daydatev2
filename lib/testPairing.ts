/**
 * Test Mode Pairing System
 *
 * For cross-device testing without Supabase.
 * Uses deterministic IDs based on pairing code so both devices
 * get matching coupleId even without shared storage.
 *
 * Flow:
 * 1. User A creates code -> coupleId is derived from code
 * 2. User B enters same code -> gets same coupleId
 * 3. Both devices now have matching couple data locally
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const PAIRING_CODES_KEY = 'test_pairing_codes';
const CODE_EXPIRY_HOURS = 24;

export interface TestPairingCode {
  code: string;
  creatorId: string;
  creatorNickname: string;
  coupleId: string;
  status: 'pending' | 'connected';
  joinerId?: string;
  joinerNickname?: string;
  createdAt: string;
  expiresAt: string;
}

/**
 * Generate a deterministic UUID-like ID from a pairing code.
 * This ensures both devices get the same coupleId from the same code.
 */
export function generateDeterministicId(code: string, prefix: string = 'couple'): string {
  // Simple hash function to create consistent ID from code
  let hash = 0;
  const str = `${prefix}-${code}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Convert to hex and pad to create UUID-like format
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  return `${hex.slice(0, 8)}-${code}-4000-8000-${hex.slice(0, 12).padEnd(12, '0')}`;
}

/**
 * Generate deterministic user ID for test mode
 */
export function generateTestUserId(code: string, role: 'creator' | 'joiner'): string {
  return generateDeterministicId(code, `test-${role}`);
}

/**
 * Get all pairing codes from AsyncStorage (local only)
 */
async function getAllCodes(): Promise<TestPairingCode[]> {
  try {
    const data = await AsyncStorage.getItem(PAIRING_CODES_KEY);
    if (!data) return [];

    const codes: TestPairingCode[] = JSON.parse(data);

    // Filter out expired codes
    const now = new Date();
    return codes.filter(c => new Date(c.expiresAt) > now);
  } catch (error) {
    console.error('[TestPairing] Error getting codes:', error);
    return [];
  }
}

/**
 * Save pairing codes to AsyncStorage
 */
async function saveCodes(codes: TestPairingCode[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PAIRING_CODES_KEY, JSON.stringify(codes));
  } catch (error) {
    console.error('[TestPairing] Error saving codes:', error);
  }
}

/**
 * Create a new pairing code (called by code creator)
 * Returns deterministic coupleId based on the code
 */
export async function createTestPairingCode(
  code: string,
  creatorId: string,
  creatorNickname: string
): Promise<TestPairingCode> {
  const codes = await getAllCodes();

  // Remove any existing code from same creator
  const filteredCodes = codes.filter(c => c.creatorId !== creatorId);

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + CODE_EXPIRY_HOURS);

  // Generate deterministic coupleId from code
  const coupleId = generateDeterministicId(code, 'couple');

  const newCode: TestPairingCode = {
    code,
    creatorId,
    creatorNickname,
    coupleId,
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  filteredCodes.push(newCode);
  await saveCodes(filteredCodes);

  console.log('[TestPairing] Created code:', code);
  console.log('[TestPairing] Deterministic coupleId:', coupleId);
  return newCode;
}

/**
 * Join using a pairing code (called by joiner)
 * For cross-device testing: creates local data with deterministic coupleId
 * No lookup needed - we generate matching IDs from the code itself
 */
export async function joinTestPairingCode(
  code: string,
  joinerId: string,
  joinerNickname: string
): Promise<TestPairingCode> {
  // Generate deterministic coupleId from code (same as creator will have)
  const coupleId = generateDeterministicId(code, 'couple');

  // Generate deterministic creator ID (for partner reference)
  const creatorId = generateDeterministicId(code, 'test-creator');

  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + CODE_EXPIRY_HOURS);

  // Create pairing data (stored locally on joiner's device)
  const pairingData: TestPairingCode = {
    code,
    creatorId,
    creatorNickname: 'Partner', // Will be shown on joiner's device
    coupleId,
    status: 'connected',
    joinerId,
    joinerNickname,
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  // Save locally
  const codes = await getAllCodes();
  codes.push(pairingData);
  await saveCodes(codes);

  console.log('[TestPairing] Joined with code:', code);
  console.log('[TestPairing] Deterministic coupleId:', coupleId);
  console.log('[TestPairing] Joiner:', joinerId);

  return pairingData;
}

/**
 * Check if a pairing code has been connected (called by creator polling)
 * For cross-device: just check local status
 */
export async function checkTestPairingStatus(code: string): Promise<TestPairingCode | null> {
  const codes = await getAllCodes();
  const found = codes.find(c => c.code === code);
  return found || null;
}

/**
 * Get pairing code by creator ID
 */
export async function getTestPairingByCreator(creatorId: string): Promise<TestPairingCode | null> {
  const codes = await getAllCodes();
  return codes.find(c => c.creatorId === creatorId) || null;
}

/**
 * Mark pairing as connected (for single-device simulation)
 */
export async function markTestPairingConnected(
  code: string,
  joinerId: string,
  joinerNickname: string
): Promise<TestPairingCode | null> {
  const codes = await getAllCodes();
  const index = codes.findIndex(c => c.code === code);

  if (index === -1) {
    return null;
  }

  codes[index] = {
    ...codes[index],
    status: 'connected',
    joinerId,
    joinerNickname,
  };

  await saveCodes(codes);
  return codes[index];
}

/**
 * Clear all test pairing codes (for debugging/reset)
 */
export async function clearAllTestPairingCodes(): Promise<void> {
  await AsyncStorage.removeItem(PAIRING_CODES_KEY);
  console.log('[TestPairing] Cleared all codes');
}

export default {
  generateDeterministicId,
  generateTestUserId,
  createTestPairingCode,
  joinTestPairingCode,
  checkTestPairingStatus,
  getTestPairingByCreator,
  markTestPairingConnected,
  clearAllTestPairingCodes,
};
