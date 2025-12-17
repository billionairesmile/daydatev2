import { useState, useEffect, useCallback, useRef } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { offlineQueue, OfflineOperation } from './offlineQueue';

export interface NetworkState {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string | null;
}

export interface UseNetworkResult {
  isOnline: boolean;
  networkState: NetworkState;
  pendingOperations: number;
  hasPendingSync: boolean;
}

// Global network state for non-hook usage
let globalIsOnline = true;
const networkListeners: Set<(isOnline: boolean) => void> = new Set();

export function getIsOnline(): boolean {
  return globalIsOnline;
}

export function subscribeToNetwork(listener: (isOnline: boolean) => void): () => void {
  networkListeners.add(listener);
  return () => networkListeners.delete(listener);
}

// Initialize network monitoring
let isInitialized = false;
export async function initializeNetworkMonitoring(): Promise<void> {
  if (isInitialized) return;
  isInitialized = true;

  // Initialize offline queue
  await offlineQueue.initialize();

  // Get initial state
  const state = await NetInfo.fetch();
  globalIsOnline = state.isConnected === true && state.isInternetReachable !== false;

  // Subscribe to network changes
  NetInfo.addEventListener((state) => {
    const wasOnline = globalIsOnline;
    globalIsOnline = state.isConnected === true && state.isInternetReachable !== false;

    // Notify listeners only on change
    if (wasOnline !== globalIsOnline) {
      console.log('[Network] Status changed:', globalIsOnline ? 'Online' : 'Offline');
      networkListeners.forEach(listener => listener(globalIsOnline));
    }
  });

  console.log('[Network] Monitoring initialized, status:', globalIsOnline ? 'Online' : 'Offline');
}

// React hook for network state
export function useNetwork(): UseNetworkResult {
  const [networkState, setNetworkState] = useState<NetworkState>({
    isConnected: true,
    isInternetReachable: null,
    type: null,
  });
  const [pendingOperations, setPendingOperations] = useState(0);

  useEffect(() => {
    // Get initial state
    NetInfo.fetch().then((state) => {
      setNetworkState({
        isConnected: state.isConnected ?? true,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
      });
    });

    // Subscribe to network state changes
    const unsubscribeNetwork = NetInfo.addEventListener((state) => {
      setNetworkState({
        isConnected: state.isConnected ?? true,
        isInternetReachable: state.isInternetReachable,
        type: state.type,
      });
    });

    // Subscribe to offline queue changes
    const unsubscribeQueue = offlineQueue.subscribe((queue) => {
      setPendingOperations(queue.length);
    });

    // Get initial queue count
    setPendingOperations(offlineQueue.getPendingCount());

    return () => {
      unsubscribeNetwork();
      unsubscribeQueue();
    };
  }, []);

  const isOnline = networkState.isConnected && networkState.isInternetReachable !== false;

  return {
    isOnline,
    networkState,
    pendingOperations,
    hasPendingSync: pendingOperations > 0,
  };
}
