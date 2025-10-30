/**
 * @fileoverview Utility functions for the UI inference router
 */

import type { Component, HeadersDelta, PathHint, RouterState } from './types.js';

/**
 * Computes the delta between two header states
 * 
 * @description
 * Compares two header objects and returns only the keys that changed,
 * along with their previous and current values.
 * 
 * @example
 * ```typescript
 * const prev = { currentPath: 'event/123', method: 'GET' };
 * const curr = { currentPath: 'event/456', method: 'GET' };
 * const delta = computeHeadersDelta(prev, curr);
 * // Returns: { changedKeys: ['currentPath'], previous: { currentPath: 'event/123' }, current: { currentPath: 'event/456' } }
 * ```
 * 
 * @param prev - Previous headers state
 * @param curr - Current headers state
 * @returns Headers delta with changed keys and their values
 */
export function computeHeadersDelta(prev: any, curr: any): HeadersDelta {
  const keys = Array.from(new Set([
    ...Object.keys(prev || {}),
    ...Object.keys(curr || {})
  ]));
  const changedKeys = keys.filter(k => prev?.[k] !== curr?.[k]);
  const previous: Record<string, any> = {};
  const current: Record<string, any> = {};
  for (const k of changedKeys) {
    previous[k] = prev?.[k];
    current[k] = curr?.[k];
  }
  return { changedKeys, previous, current };
}

/**
 * Extracts entity type and ID from a currentPath header
 * 
 * @description
 * Parses a path like "event/46792" to extract the entity type ("event")
 * and entity ID ("46792"). This is a server-side hint without validation.
 * 
 * @example
 * ```typescript
 * const hint = hintFromPath({ currentPath: 'event/46792' });
 * // Returns: { entityType: 'event', entityId: '46792' }
 * 
 * const hint2 = hintFromPath({ currentPath: 'user/123' });
 * // Returns: { entityType: 'user', entityId: '123' }
 * 
 * const hint3 = hintFromPath({ currentPath: 'invalid' });
 * // Returns: null
 * ```
 * 
 * @param headers - Headers object containing currentPath
 * @returns Path hint with entity type and ID, or null if path doesn't match pattern
 */
export function hintFromPath(headers: { currentPath?: string | null }): PathHint | null {
  const hp = headers?.currentPath || '';
  // ex: "event/46792" → { entityType:"event", entityId:"46792" }
  const m = hp.match(/^([a-zA-Z_-]+)\/(\w[\w-]*)$/);
  if (!m) return null;
  return { entityType: m[1], entityId: m[2] };
}

/**
 * Compacts component definitions for LLM input to reduce token usage
 * 
 * @description
 * Reduces component definitions to only essential information needed
 * for LLM inference, excluding unnecessary metadata.
 * 
 * @example
 * ```typescript
 * const components = [
 *   {
 *     id: 'EventDetailView',
 *     version: '1.0.0',
 *     description: 'Shows event details',
 *     properties: [{ name: 'eventId', type: 'string', description: 'Event ID' }]
 *   }
 * ];
 * const compacted = compactComponentsForLLM(components);
 * // Returns minimal structure with only id, version, description, properties, etc.
 * ```
 * 
 * @param list - Array of component definitions
 * @returns Array of compacted component definitions
 */
export function compactComponentsForLLM(list: Component[]): Array<Partial<Component>> {
  // Only send essential info to limit tokens
  return list.map(c => ({
    id: c.id,
    version: c.version,
    description: c.description,
    properties: c.properties ? c.properties.map(p => ({
      name: p.name,
      type: p.type,
      description: p.description,
      required: p.required,
      examples: p.examples
    })) : undefined,
    // Legacy support
    propsHints: c.propsHints,
    contexts: c.contexts,
    // Give the model a hint that this component implies a route/method switch
    defaultPath: c.defaultPath,
    defaultMethod: c.defaultMethod
  }));
}

/**
 * Picks compatible components based on headers
 * 
 * @description
 * Currently returns all components for auto-navigation. The LLM itself
 * filters by contexts via suggestedHeaders. This function can be extended
 * to pre-filter components if needed.
 * 
 * @example
 * ```typescript
 * const components = [component1, component2, component3];
 * const headers = { currentPath: 'event/123', method: 'GET' };
 * const compatible = pickCompatibleComponents(components, headers);
 * // Returns: all components (no filtering for now)
 * ```
 * 
 * @param list - Array of component definitions
 * @param headers - Current headers state
 * @returns Array of compatible components (currently returns all)
 */
export function pickCompatibleComponents(
  list: Component[],
  headers: RouterState['headers']
): Component[] {
  // Auto navigation: send ALL components to LLM so it can deduce the correct currentPath
  // Context filtering is now done by the LLM itself via suggestedHeaders
  return list;
}

