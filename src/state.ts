/**
 * @fileoverview State management for the UI inference router
 */

import type { ConversationTurn, HeadersDelta, RouterState } from './types.js';
import { computeHeadersDelta } from './utils.js';

/**
 * Creates and manages router state
 * 
 * @description
 * Manages persistent state for a router instance including headers,
 * entity memory, and conversation history. Each router instance should
 * be created per user session.
 * 
 * @example
 * ```typescript
 * const stateManager = createStateManager({
 *   initialHistory: [{ role: 'user', content: 'Hello' }]
 * });
 * 
 * stateManager.setHeaders({ currentPath: 'event/123' });
 * const headers = stateManager.getHeaders();
 * ```
 */
export function createStateManager(initialHistory: ConversationTurn[] = []) {
  const state: RouterState = {
    headers: {
      currentPath: null,
      method: null,
      locale: 'fr-FR',
    },
    lastHeadersDelta: null,
    // Light memory of entities detected in previous turns (titles, dates, ids, attendees...)
    entities: {},
    // Short history (optional) for conversational context
    history: [...initialHistory]
  };

  /**
   * Sets headers partially, computing delta automatically
   * 
   * @param partial - Partial headers to merge with current headers
   */
  function setHeaders(partial: Partial<RouterState['headers']>) {
    const prev = { ...state.headers };
    state.headers = { ...state.headers, ...partial };
    state.lastHeadersDelta = computeHeadersDelta(prev, state.headers);
  }

  /**
   * Gets current headers
   * 
   * @returns Copy of current headers
   */
  function getHeaders(): RouterState['headers'] {
    return { ...state.headers };
  }

  /**
   * Clears headers to default values
   */
  function clearHeaders() {
    state.headers = { currentPath: null, method: null, locale: 'fr-FR' };
    state.lastHeadersDelta = null;
  }

  /**
   * Gets current entity memory
   * 
   * @returns Copy of current entities
   */
  function getMemory(): Record<string, any> {
    return { ...state.entities };
  }

  /**
   * Clears entity memory
   */
  function clearMemory() {
    state.entities = {};
  }

  /**
   * Gets conversation history
   * 
   * @returns Copy of current history
   */
  function getHistory(): ConversationTurn[] {
    return [...state.history];
  }

  /**
   * Adds a turn to conversation history
   * 
   * @param turn - Conversation turn to add
   */
  function addToHistory(turn: ConversationTurn) {
    state.history.push(turn);
  }

  /**
   * Clears conversation history
   */
  function clearHistory() {
    state.history = [];
  }

  /**
   * Gets the last headers delta
   * 
   * @returns Last headers delta or null
   */
  function getLastHeadersDelta(): HeadersDelta | null {
    return state.lastHeadersDelta;
  }

  /**
   * Gets the internal state (for router logic)
   * 
   * @returns Internal state
   */
  function getState(): RouterState {
    return state;
  }

  return {
    setHeaders,
    getHeaders,
    clearHeaders,
    getMemory,
    clearMemory,
    getHistory,
    addToHistory,
    clearHistory,
    getLastHeadersDelta,
    getState
  };
}

