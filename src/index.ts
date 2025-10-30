/**
 * @fileoverview Public API exports for the UI inference router
 */

export { createUiInferRouter } from './router.js';
export { generateArrayItemDescription } from './utils.js';
export type {
  ArrayItemSchema,
  Component,
  ComponentProperty,
  ConversationTurn,
  HeadersDelta,
  PathHint,
  RouterResponse,
  RouterState,
  UiInferRouter,
  UiInferRouterConfig
} from './types.js';
