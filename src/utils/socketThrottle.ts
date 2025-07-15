interface ThrottleData {
  lastEmitTime: number;
  pendingData: any;
  timeoutId: NodeJS.Timeout | null;
}

export class SocketThrottle {
  private throttleMap: Map<string, ThrottleData> = new Map();
  
  /**
   * Throttle socket events to a maximum frequency
   * @param key Unique key for this throttle (e.g., `${userId}-${eventName}`)
   * @param data The data to emit
   * @param emitFn The function to call when emitting
   * @param delay Minimum milliseconds between emits
   */
  throttle(key: string, data: any, emitFn: () => void, delay: number): void {
    const now = Date.now();
    const throttleData = this.throttleMap.get(key);
    
    if (!throttleData) {
      // First event - emit immediately
      this.throttleMap.set(key, {
        lastEmitTime: now,
        pendingData: null,
        timeoutId: null,
      });
      emitFn();
      return;
    }
    
    const timeSinceLastEmit = now - throttleData.lastEmitTime;
    
    if (timeSinceLastEmit >= delay) {
      // Enough time has passed - emit immediately
      throttleData.lastEmitTime = now;
      throttleData.pendingData = null;
      if (throttleData.timeoutId) {
        clearTimeout(throttleData.timeoutId);
        throttleData.timeoutId = null;
      }
      emitFn();
    } else {
      // Too soon - save data and schedule for later
      throttleData.pendingData = data;
      
      // Clear existing timeout if any
      if (throttleData.timeoutId) {
        clearTimeout(throttleData.timeoutId);
      }
      
      // Schedule emit for when delay has passed
      const remainingDelay = delay - timeSinceLastEmit;
      throttleData.timeoutId = setTimeout(() => {
        throttleData.lastEmitTime = Date.now();
        throttleData.pendingData = null;
        throttleData.timeoutId = null;
        emitFn();
      }, remainingDelay);
    }
  }
  
  /**
   * Clean up throttle data for a specific key
   */
  cleanup(key: string): void {
    const throttleData = this.throttleMap.get(key);
    if (throttleData?.timeoutId) {
      clearTimeout(throttleData.timeoutId);
    }
    this.throttleMap.delete(key);
  }
  
  /**
   * Clean up all throttle data
   */
  cleanupAll(): void {
    for (const [key, data] of this.throttleMap.entries()) {
      if (data.timeoutId) {
        clearTimeout(data.timeoutId);
      }
    }
    this.throttleMap.clear();
  }
}

// Singleton instance
export const socketThrottle = new SocketThrottle();