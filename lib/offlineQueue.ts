import AsyncStorage from '@react-native-async-storage/async-storage';

const OFFLINE_QUEUE_KEY = '@daydate_offline_queue';

export type OfflineOperationType =
  | 'ADD_TODO'
  | 'TOGGLE_TODO'
  | 'UPDATE_TODO'
  | 'DELETE_TODO'
  | 'ADD_BOOKMARK'
  | 'REMOVE_BOOKMARK';

export interface OfflineOperation {
  id: string;
  type: OfflineOperationType;
  payload: Record<string, unknown>;
  timestamp: number;
  retryCount: number;
}

class OfflineQueueManager {
  private queue: OfflineOperation[] = [];
  private isProcessing = false;
  private listeners: Set<(queue: OfflineOperation[]) => void> = new Set();

  async initialize(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
        console.log('[OfflineQueue] Loaded', this.queue.length, 'pending operations');
      }
    } catch (error) {
      console.error('[OfflineQueue] Failed to load queue:', error);
      this.queue = [];
    }
  }

  async add(type: OfflineOperationType, payload: Record<string, unknown>): Promise<string> {
    const operation: OfflineOperation = {
      id: `op-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      payload,
      timestamp: Date.now(),
      retryCount: 0,
    };

    this.queue.push(operation);
    await this.persist();
    this.notifyListeners();

    console.log('[OfflineQueue] Added operation:', type);
    return operation.id;
  }

  async remove(operationId: string): Promise<void> {
    this.queue = this.queue.filter(op => op.id !== operationId);
    await this.persist();
    this.notifyListeners();
  }

  async clear(): Promise<void> {
    this.queue = [];
    await this.persist();
    this.notifyListeners();
  }

  getQueue(): OfflineOperation[] {
    return [...this.queue];
  }

  getPendingCount(): number {
    return this.queue.length;
  }

  hasPendingOperations(): boolean {
    return this.queue.length > 0;
  }

  async incrementRetry(operationId: string): Promise<void> {
    const operation = this.queue.find(op => op.id === operationId);
    if (operation) {
      operation.retryCount++;
      await this.persist();
    }
  }

  // Subscribe to queue changes
  subscribe(listener: (queue: OfflineOperation[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => listener([...this.queue]));
  }

  private async persist(): Promise<void> {
    try {
      await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.error('[OfflineQueue] Failed to persist queue:', error);
    }
  }

  setProcessing(isProcessing: boolean): void {
    this.isProcessing = isProcessing;
  }

  getIsProcessing(): boolean {
    return this.isProcessing;
  }
}

export const offlineQueue = new OfflineQueueManager();
