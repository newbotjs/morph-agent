/**
 * @fileoverview Tests for utility functions
 */

import { describe, it, expect } from 'vitest';
import { computeHeadersDelta, hintFromPath, compactComponentsForLLM, pickCompatibleComponents, generateArrayItemDescription } from '../src/utils.js';
import type { Component, ComponentProperty } from '../src/types.js';

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

  it('should generate detailed description for properties with itemSchema', () => {
    const components: Component[] = [
      {
        id: 'GenerateBlocks',
        description: 'Generate blocks',
        properties: [
          {
            name: 'blocks',
            type: 'array',
            description: 'Array of blocks',
            itemSchema: {
              itemStructure: {
                requiredFields: ['id', 'type'],
                optionalFields: ['level']
              },
              availableTypes: [
                {
                  type: 'show_text',
                  label: 'Show Text',
                  description: 'Display text',
                  schema: {
                    properties: {
                      text: { type: 'string', title: 'Text' }
                    },
                    required: ['text']
                  }
                }
              ],
              examples: [
                { id: 'block_1', type: 'show_text', data: { text: 'Hello' } }
              ]
            }
          }
        ]
      }
    ];

    const compacted = compactComponentsForLLM(components);

    expect(compacted[0].properties).toBeDefined();
    expect(compacted[0].properties![0].name).toBe('blocks');
    expect(compacted[0].properties![0].type).toBe('array');
    // The description should be enhanced with schema details
    const description = compacted[0].properties![0].description;
    expect(description).toContain('Array of blocks');
    expect(description).toContain('AVAILABLE ITEM TYPES');
    expect(description).toContain('show_text');
    expect(description).toContain('Show Text');
    expect(description).toContain('CRITICAL RULES');
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

describe('generateArrayItemDescription', () => {
  it('should return original description when itemSchema is not provided', () => {
    const property: ComponentProperty = {
      name: 'items',
      type: 'array',
      description: 'Simple array of items'
    };

    const result = generateArrayItemDescription(property);

    expect(result).toBe('Simple array of items');
  });

  it('should generate description with item structure', () => {
    const property: ComponentProperty = {
      name: 'blocks',
      type: 'array',
      description: 'Array of blocks',
      itemSchema: {
        itemStructure: {
          requiredFields: ['id', 'type'],
          optionalFields: ['level']
        }
      }
    };

    const result = generateArrayItemDescription(property);

    expect(result).toContain('Array of blocks');
    expect(result).toContain('Required fields');
    expect(result).toContain('id');
    expect(result).toContain('type');
    expect(result).toContain('Optional fields');
    expect(result).toContain('level');
  });

  it('should generate description with available types and schemas', () => {
    const property: ComponentProperty = {
      name: 'blocks',
      type: 'array',
      description: 'Array of blocks',
      itemSchema: {
        availableTypes: [
          {
            type: 'show_text',
            label: 'Show Text',
            description: 'Display a message',
            schema: {
              type: 'object',
              properties: {
                text: {
                  type: 'string',
                  title: 'Message Text',
                  description: 'The text to display'
                },
                position: {
                  type: 'string',
                  enum: ['top', 'bottom'],
                  default: 'bottom'
                }
              },
              required: ['text']
            }
          },
          {
            type: 'set_variable',
            label: 'Set Variable',
            description: 'Set a variable',
            schema: {
              type: 'object',
              properties: {
                variableId: { type: 'string', title: 'Variable ID' },
                value: { type: 'string', title: 'Value' }
              },
              required: ['variableId', 'value']
            }
          }
        ]
      }
    };

    const result = generateArrayItemDescription(property);

    expect(result).toContain('AVAILABLE ITEM TYPES');
    expect(result).toContain('show_text');
    expect(result).toContain('Show Text');
    expect(result).toContain('Display a message');
    expect(result).toContain('set_variable');
    expect(result).toContain('Set Variable');
    expect(result).toContain('text (string) (required)');
    expect(result).toContain('position (string)');
    expect(result).toContain('variableId (string) (required)');
    expect(result).toContain('values: top, bottom');
    expect(result).toContain('default: "bottom"');
  });

  it('should include examples in description', () => {
    const property: ComponentProperty = {
      name: 'blocks',
      type: 'array',
      description: 'Array of blocks',
      itemSchema: {
        examples: [
          { id: 'block_1', type: 'show_text', data: { text: 'Hello' } },
          { id: 'block_2', type: 'set_variable', data: { variableId: 'gold', value: '100' } }
        ]
      }
    };

    const result = generateArrayItemDescription(property);

    expect(result).toContain('Example items structure:');
    expect(result).toContain('block_1');
    expect(result).toContain('show_text');
    expect(result).toContain('Hello');
    expect(result).toContain('block_2');
    expect(result).toContain('gold');
  });

  it('should include critical rules', () => {
    const property: ComponentProperty = {
      name: 'blocks',
      type: 'array',
      description: 'Array of blocks',
      itemSchema: {
        itemStructure: {
          requiredFields: ['id', 'type']
        }
      }
    };

    const result = generateArrayItemDescription(property);

    expect(result).toContain('CRITICAL RULES:');
    expect(result).toContain('Required fields');
    expect(result).toContain('id, type');
  });

  it('should handle types without schema', () => {
    const property: ComponentProperty = {
      name: 'blocks',
      type: 'array',
      description: 'Array of blocks',
      itemSchema: {
        availableTypes: [
          {
            type: 'conditional_branch',
            label: 'Conditional Branch',
            description: 'Branch based on condition'
            // No schema provided
          }
        ]
      }
    };

    const result = generateArrayItemDescription(property);

    expect(result).toContain('conditional_branch');
    expect(result).toContain('Conditional Branch');
    expect(result).toContain('no schema defined');
    expect(result).toContain('empty object {}');
  });

  it('should handle empty properties in schema', () => {
    const property: ComponentProperty = {
      name: 'blocks',
      type: 'array',
      description: 'Array of blocks',
      itemSchema: {
        availableTypes: [
          {
            type: 'simple_block',
            schema: {
              type: 'object',
              properties: {}
            }
          }
        ]
      }
    };

    const result = generateArrayItemDescription(property);

    expect(result).toContain('simple_block');
    expect(result).toContain('no schema defined');
  });

  it('should generate complete description with all components', () => {
    const property: ComponentProperty = {
      name: 'blocks',
      type: 'array',
      description: 'Array of blocks',
      itemSchema: {
        itemStructure: {
          requiredFields: ['id', 'type', 'data'],
          optionalFields: ['level']
        },
        availableTypes: [
          {
            type: 'show_text',
            label: 'Show Text',
            description: 'Display text',
            schema: {
              properties: {
                text: { type: 'string', title: 'Text' }
              },
              required: ['text']
            }
          }
        ],
        examples: [
          { id: 'block_1', type: 'show_text', data: { text: 'Hi' }, level: 0 }
        ]
      }
    };

    const result = generateArrayItemDescription(property);

    // Check all sections are present
    expect(result).toContain('Array of blocks');
    expect(result).toContain('Each item MUST have this exact structure:');
    expect(result).toContain('AVAILABLE ITEM TYPES');
    expect(result).toContain('Example items structure:');
    expect(result).toContain('CRITICAL RULES:');
  });
});

