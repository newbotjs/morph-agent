/**
 * @fileoverview Tests for state management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createStateManager } from '../src/state.js';
import type { ConversationTurn } from '../src/types.js';

describe('createStateManager', () => {
  let stateManager: ReturnType<typeof createStateManager>;

  beforeEach(() => {
    stateManager = createStateManager();
  });

  describe('headers management', () => {
    it('should initialize with default headers', () => {
      const headers = stateManager.getHeaders();

      expect(headers).toEqual({
        currentPath: null,
        method: null,
        locale: 'fr-FR'
      });
    });

    it('should set headers partially', () => {
      stateManager.setHeaders({ currentPath: 'event/123' });

      const headers = stateManager.getHeaders();
      expect(headers.currentPath).toBe('event/123');
      expect(headers.method).toBeNull();
      expect(headers.locale).toBe('fr-FR');
    });

    it('should update headers and compute delta', () => {
      stateManager.setHeaders({ currentPath: 'event/123', method: 'GET' });
      const delta1 = stateManager.getLastHeadersDelta();

      stateManager.setHeaders({ currentPath: 'event/456' });
      const delta2 = stateManager.getLastHeadersDelta();

      expect(delta1?.changedKeys).toContain('currentPath');
      expect(delta1?.changedKeys).toContain('method');
      expect(delta2?.changedKeys).toEqual(['currentPath']);
      expect(delta2?.previous.currentPath).toBe('event/123');
      expect(delta2?.current.currentPath).toBe('event/456');
    });

    it('should clear headers to default', () => {
      stateManager.setHeaders({ currentPath: 'event/123', method: 'GET' });
      stateManager.clearHeaders();

      const headers = stateManager.getHeaders();
      expect(headers).toEqual({
        currentPath: null,
        method: null,
        locale: 'fr-FR'
      });
      expect(stateManager.getLastHeadersDelta()).toBeNull();
    });
  });

  describe('memory management', () => {
    it('should initialize with empty memory', () => {
      const memory = stateManager.getMemory();

      expect(memory).toEqual({});
    });

    it('should get memory copy', () => {
      const state = stateManager.getState();
      state.entities = { eventId: '123', title: 'Test' };

      const memory = stateManager.getMemory();
      expect(memory).toEqual({ eventId: '123', title: 'Test' });
      expect(memory).not.toBe(state.entities); // Should be a copy
    });

    it('should clear memory', () => {
      const state = stateManager.getState();
      state.entities = { eventId: '123' };

      stateManager.clearMemory();

      expect(stateManager.getMemory()).toEqual({});
    });
  });

  describe('history management', () => {
    it('should initialize with empty history by default', () => {
      const history = stateManager.getHistory();

      expect(history).toEqual([]);
    });

    it('should initialize with provided history', () => {
      const initialHistory: ConversationTurn[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' }
      ];

      const manager = createStateManager(initialHistory);
      const history = manager.getHistory();

      expect(history).toHaveLength(2);
      expect(history[0].content).toBe('Hello');
    });

    it('should add turns to history', () => {
      const turn: ConversationTurn = {
        role: 'user',
        content: 'Show event 123',
        timestamp: '2025-01-01T00:00:00Z'
      };

      stateManager.addToHistory(turn);

      const history = stateManager.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0]).toEqual(turn);
    });

    it('should get history copy', () => {
      stateManager.addToHistory({ role: 'user', content: 'Test' });

      const history1 = stateManager.getHistory();
      const history2 = stateManager.getHistory();

      expect(history1).toEqual(history2);
      expect(history1).not.toBe(history2); // Should be copies
    });

    it('should clear history', () => {
      stateManager.addToHistory({ role: 'user', content: 'Test 1' });
      stateManager.addToHistory({ role: 'user', content: 'Test 2' });

      stateManager.clearHistory();

      expect(stateManager.getHistory()).toEqual([]);
    });
  });

  describe('headers delta', () => {
    it('should return null when no changes', () => {
      expect(stateManager.getLastHeadersDelta()).toBeNull();
    });

    it('should track headers delta', () => {
      stateManager.setHeaders({ currentPath: 'event/123' });
      const delta = stateManager.getLastHeadersDelta();

      expect(delta).not.toBeNull();
      expect(delta?.changedKeys).toContain('currentPath');
    });
  });
});

