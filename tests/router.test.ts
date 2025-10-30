/**
 * @fileoverview Tests for router with mocked OpenAI
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createUiInferRouter } from '../src/router.js';
import type { Component, RouterResponse } from '../src/types.js';

// Mock OpenAI
const mockCreate = vi.fn();

vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      constructor(config: any) {}
      chat = {
        completions: {
          create: mockCreate
        }
      }
    }
  };
});

describe('createUiInferRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('route', () => {
    it('should route prompt to component', async () => {
      const mockResponse: RouterResponse = {
        componentId: 'EventDetailView',
        props: { eventId: '123' },
        message: 'Showing event details'
      };

      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify(mockResponse)
          }
        }]
      });

      const components: Component[] = [
        {
          id: 'EventDetailView',
          description: 'Shows event details',
          properties: [
            { name: 'eventId', type: 'string', description: 'Event ID', required: true }
          ]
        }
      ];

      const router = createUiInferRouter({
        model: 'gpt-4o-mini',
        components,
        apiKey: 'test-key'
      });

      const result = await router.route({ prompt: 'Show event 123' });

      expect(result.componentId).toBe('EventDetailView');
      expect(result.props.eventId).toBe('123');
      expect(mockCreate).toHaveBeenCalledOnce();
    });

    it('should handle JSON parse errors with fallback', async () => {
      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: 'invalid json'
          }
        }]
      });

      const router = createUiInferRouter({
        componentDefault: 'FallbackComponent',
        components: []
      });

      const result = await router.route({ prompt: 'test' });

      expect(result.componentId).toBe('FallbackComponent');
      expect(result.props.message).toBeDefined();
    });

    it('should update headers from suggestedHeaders', async () => {
      const mockResponse: RouterResponse = {
        componentId: 'MainPage',
        props: {},
        suggestedHeaders: {
          currentPath: 'main',
          method: 'GET'
        }
      };

      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify(mockResponse)
          }
        }]
      });

      const router = createUiInferRouter({
        components: [],
        apiKey: 'test-key'
      });

      await router.route({ prompt: 'Go to main page' });

      const headers = router.getHeaders();
      expect(headers.currentPath).toBe('main');
      expect(headers.method).toBe('GET');
    });

    it('should update headers from component contexts', async () => {
      const mockResponse: RouterResponse = {
        componentId: 'EventListView',
        props: {}
      };

      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify(mockResponse)
          }
        }]
      });

      const components: Component[] = [
        {
          id: 'EventListView',
          contexts: [{ currentPath: 'event', methods: ['GET'] }]
        }
      ];

      const router = createUiInferRouter({
        components,
        apiKey: 'test-key'
      });

      await router.route({ prompt: 'Show events' });

      const headers = router.getHeaders();
      expect(headers.currentPath).toBe('event');
      expect(headers.method).toBe('GET');
    });

    it('should update headers from component defaultPath/defaultMethod', async () => {
      const mockResponse: RouterResponse = {
        componentId: 'EventCreateForm',
        props: {}
      };

      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify(mockResponse)
          }
        }]
      });

      const components: Component[] = [
        {
          id: 'EventCreateForm',
          defaultPath: 'event',
          defaultMethod: 'POST'
        }
      ];

      const router = createUiInferRouter({
        components,
        apiKey: 'test-key'
      });

      await router.route({ prompt: 'Create event' });

      const headers = router.getHeaders();
      expect(headers.currentPath).toBe('event');
      expect(headers.method).toBe('POST');
    });

    it('should update memory from props', async () => {
      const mockResponse: RouterResponse = {
        componentId: 'EventDetailView',
        props: {
          eventId: '123',
          title: 'Test Event',
          start: '2025-01-01T10:00:00Z',
          attendees: ['user@example.com']
        }
      };

      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify(mockResponse)
          }
        }]
      });

      const router = createUiInferRouter({
        components: [],
        apiKey: 'test-key'
      });

      await router.route({ prompt: 'Show event 123' });

      const memory = router.getMemory();
      expect(memory.eventId).toBe('123');
      expect(memory.title).toBe('Test Event');
      expect(memory.start).toBe('2025-01-01T10:00:00Z');
      expect(memory.attendees).toEqual(['user@example.com']);
    });

    it('should add turns to history', async () => {
      const mockResponse: RouterResponse = {
        componentId: 'MainPage',
        props: {}
      };

      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify(mockResponse)
          }
        }]
      });

      const router = createUiInferRouter({
        components: [],
        apiKey: 'test-key'
      });

      await router.route({ prompt: 'Hello' });

      const history = router.getHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history.some(t => t.role === 'user' && t.content === 'Hello')).toBe(true);
      expect(history.some(t => t.role === 'assistant')).toBe(true);
    });

    it('should include system instruction in messages', async () => {
      const mockResponse: RouterResponse = {
        componentId: 'MainPage',
        props: {}
      };

      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify(mockResponse)
          }
        }]
      });

      const customInstruction = 'Custom system instruction';
      const router = createUiInferRouter({
        components: [],
        systemInstruction: customInstruction,
        apiKey: 'test-key'
      });

      await router.route({ prompt: 'test' });

      const callArgs = mockCreate.mock.calls[0][0];
      const systemMessages = callArgs.messages.filter((m: any) => m.role === 'system');
      expect(systemMessages.some((m: any) => m.content.includes(customInstruction))).toBe(true);
    });

    it('should include components, headers, and memory in messages', async () => {
      const mockResponse: RouterResponse = {
        componentId: 'EventDetailView',
        props: {}
      };

      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify(mockResponse)
          }
        }]
      });

      const components: Component[] = [
        { id: 'EventDetailView', description: 'Test component' }
      ];

      const router = createUiInferRouter({
        components,
        apiKey: 'test-key'
      });

      router.setHeaders({ currentPath: 'event/123' });

      await router.route({ prompt: 'test' });

      const callArgs = mockCreate.mock.calls[0][0];
      const messagesStr = JSON.stringify(callArgs.messages);
      
      expect(messagesStr).toContain('EventDetailView');
      expect(messagesStr).toContain('event/123');
    });
  });

  describe('state management methods', () => {
    it('should manage headers', () => {
      const router = createUiInferRouter({ components: [] });

      router.setHeaders({ currentPath: 'event/123', method: 'GET' });
      const headers = router.getHeaders();

      expect(headers.currentPath).toBe('event/123');
      expect(headers.method).toBe('GET');

      router.clearHeaders();
      const clearedHeaders = router.getHeaders();

      expect(clearedHeaders.currentPath).toBeNull();
      expect(clearedHeaders.method).toBeNull();
    });

    it('should manage memory', async () => {
      const mockResponse: RouterResponse = {
        componentId: 'MainPage',
        props: { eventId: '123' }
      };

      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify(mockResponse)
          }
        }]
      });

      const router = createUiInferRouter({
        components: [],
        apiKey: 'test-key'
      });

      await router.route({ prompt: 'Set event 123' });

      const memory = router.getMemory();
      expect(memory.eventId).toBe('123');

      router.clearMemory();
      expect(router.getMemory()).toEqual({});
    });

    it('should manage history', () => {
      const router = createUiInferRouter({ components: [] });

      router.addToHistory({ role: 'user', content: 'Test' });
      const history = router.getHistory();

      expect(history).toHaveLength(1);
      expect(history[0].content).toBe('Test');

      router.clearHistory();
      expect(router.getHistory()).toEqual([]);
    });

    it('should get last headers delta', async () => {
      const mockResponse: RouterResponse = {
        componentId: 'MainPage',
        props: {}
      };

      mockCreate.mockResolvedValue({
        choices: [{
          message: {
            content: JSON.stringify(mockResponse)
          }
        }]
      });

      const router = createUiInferRouter({
        components: [],
        apiKey: 'test-key'
      });

      router.setHeaders({ currentPath: 'event/123' });
      const delta = router.getLastHeadersDelta();

      expect(delta).not.toBeNull();
      expect(delta?.changedKeys).toContain('currentPath');
    });
  });
});

