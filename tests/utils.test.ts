/**
 * @fileoverview Tests for utility functions
 */

import { describe, it, expect } from 'vitest';
import { computeHeadersDelta, hintFromPath, compactComponentsForLLM, pickCompatibleComponents } from '../src/utils.js';
import type { Component } from '../src/types.js';

describe('computeHeadersDelta', () => {
  it('should compute delta when headers change', () => {
    const prev = { currentPath: 'event/123', method: 'GET', locale: 'fr-FR' };
    const curr = { currentPath: 'event/456', method: 'GET', locale: 'fr-FR' };
    const delta = computeHeadersDelta(prev, curr);

    expect(delta.changedKeys).toEqual(['currentPath']);
    expect(delta.previous.currentPath).toBe('event/123');
    expect(delta.current.currentPath).toBe('event/456');
  });

  it('should compute delta when multiple headers change', () => {
    const prev = { currentPath: 'event/123', method: 'GET', locale: 'fr-FR' };
    const curr = { currentPath: 'event/456', method: 'POST', locale: 'en-US' };
    const delta = computeHeadersDelta(prev, curr);

    expect(delta.changedKeys).toContain('currentPath');
    expect(delta.changedKeys).toContain('method');
    expect(delta.changedKeys).toContain('locale');
  });

  it('should return empty delta when headers are the same', () => {
    const prev = { currentPath: 'event/123', method: 'GET' };
    const curr = { currentPath: 'event/123', method: 'GET' };
    const delta = computeHeadersDelta(prev, curr);

    expect(delta.changedKeys).toEqual([]);
  });

  it('should handle null/undefined values', () => {
    const prev = { currentPath: null, method: 'GET' };
    const curr = { currentPath: 'event/123', method: 'GET' };
    const delta = computeHeadersDelta(prev, curr);

    expect(delta.changedKeys).toEqual(['currentPath']);
    expect(delta.previous.currentPath).toBeNull();
    expect(delta.current.currentPath).toBe('event/123');
  });
});

describe('hintFromPath', () => {
  it('should extract entity type and ID from path', () => {
    const headers = { currentPath: 'event/46792' };
    const hint = hintFromPath(headers);

    expect(hint).toEqual({ entityType: 'event', entityId: '46792' });
  });

  it('should extract from user path', () => {
    const headers = { currentPath: 'user/123' };
    const hint = hintFromPath(headers);

    expect(hint).toEqual({ entityType: 'user', entityId: '123' });
  });

  it('should return null for invalid path', () => {
    const headers = { currentPath: 'invalid' };
    const hint = hintFromPath(headers);

    expect(hint).toBeNull();
  });

  it('should return null for null currentPath', () => {
    const headers = { currentPath: null };
    const hint = hintFromPath(headers);

    expect(hint).toBeNull();
  });

  it('should handle paths with dashes in entity ID', () => {
    const headers = { currentPath: 'event/123-abc' };
    const hint = hintFromPath(headers);

    expect(hint).toEqual({ entityType: 'event', entityId: '123-abc' });
  });
});

describe('compactComponentsForLLM', () => {
  it('should compact component definitions', () => {
    const components: Component[] = [
      {
        id: 'EventDetailView',
        version: '1.0.0',
        description: 'Shows event details',
        properties: [
          {
            name: 'eventId',
            type: 'string',
            description: 'Event ID',
            required: true,
            examples: ['123']
          }
        ],
        contexts: [{ currentPath: 'event/123', methods: ['GET'] }],
        defaultPath: 'event',
        defaultMethod: 'GET'
      }
    ];

    const compacted = compactComponentsForLLM(components);

    expect(compacted).toHaveLength(1);
    expect(compacted[0]).toEqual({
      id: 'EventDetailView',
      version: '1.0.0',
      description: 'Shows event details',
      properties: [
        {
          name: 'eventId',
          type: 'string',
          description: 'Event ID',
          required: true,
          examples: ['123']
        }
      ],
      contexts: [{ currentPath: 'event/123', methods: ['GET'] }],
      defaultPath: 'event',
      defaultMethod: 'GET'
    });
  });

  it('should handle components without properties', () => {
    const components: Component[] = [
      {
        id: 'SimpleComponent',
        description: 'Simple component'
      }
    ];

    const compacted = compactComponentsForLLM(components);

    expect(compacted[0].properties).toBeUndefined();
  });

  it('should preserve legacy propsHints', () => {
    const components: Component[] = [
      {
        id: 'LegacyComponent',
        propsHints: ['eventId', 'title']
      }
    ];

    const compacted = compactComponentsForLLM(components);

    expect(compacted[0].propsHints).toEqual(['eventId', 'title']);
  });
});

describe('pickCompatibleComponents', () => {
  it('should return all components', () => {
    const components: Component[] = [
      { id: 'Component1' },
      { id: 'Component2' },
      { id: 'Component3' }
    ];
    const headers = { currentPath: 'event/123', method: 'GET', locale: 'fr-FR' };

    const compatible = pickCompatibleComponents(components, headers);

    expect(compatible).toEqual(components);
  });

  it('should return empty array for empty input', () => {
    const components: Component[] = [];
    const headers = { currentPath: null, method: null, locale: 'fr-FR' };

    const compatible = pickCompatibleComponents(components, headers);

    expect(compatible).toEqual([]);
  });
});

