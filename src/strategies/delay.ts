import { CapabilityStrategy, Json } from '../types';

/**
 * Parameters for the Delay capability
 */
export interface DelayParams {
  /**
   * Duration to wait in milliseconds
   */
  ms: number;
  
  [k: string]: Json | undefined;
}

/**
 * Response from the Delay capability
 */
export interface DelayResult {
  /**
   * The duration that was waited
   */
  waited: number;
  
  /**
   * Timestamp when the delay completed
   */
  completedAt: number;
  
  /**
   * Allow additional properties to satisfy Json constraint
   */
  [k: string]: number;
}

/**
 * Strategy for waiting a specified amount of time
 * 
 * This strategy provides a capability to pause execution for a given duration.
 */
export const DelayStrategy: CapabilityStrategy<DelayParams, DelayResult> = {
  kind: 'delay',
  
  async run({ ms }, env) {
    const startTime = Date.now();
    
    // Use the environment's wait function
    await env.wait(ms);
    
    const completedAt = Date.now();
    
    return {
      waited: ms,
      completedAt,
    };
  },
}; 