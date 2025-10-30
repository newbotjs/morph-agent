/**
 * @fileoverview Type definitions for the UI inference router
 */

/**
 * Property definition for a component
 */
export interface ComponentProperty {
  name: string;
  type: string;
  description: string;
  required?: boolean;
  examples?: string[];
}

/**
 * Component definition with properties and routing contexts
 */
export interface Component {
  id: string;
  version?: string;
  description?: string;
  properties?: ComponentProperty[];
  contexts?: Array<{ currentPath?: string; methods?: string[] }>;
  // Legacy support
  propsHints?: string[];
  // Optional: when this component is selected, switch headers accordingly
  defaultPath?: string;
  defaultMethod?: string;
}

/**
 * A conversation turn (user or assistant message)
 */
export interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  headers?: {
    currentPath?: string | null;
    method?: string | null;
    locale?: string;
  };
  // Optional diff of headers compared to previous turn
  headersDelta?: {
    changedKeys: string[];
    previous: { [k: string]: any };
    current: { [k: string]: any };
  };
}

/**
 * Configuration for creating a UI inference router
 */
export interface UiInferRouterConfig {
  model?: string;
  apiKey?: string;
  timezone?: string;
  components?: Component[];
  componentDefault?: string;
  systemInstruction?: string;
  initialHistory?: ConversationTurn[];
}

/**
 * Headers delta representing changes between two header states
 */
export interface HeadersDelta {
  changedKeys: string[];
  previous: { [k: string]: any };
  current: { [k: string]: any };
}

/**
 * Router state containing headers, entities memory, and conversation history
 */
export interface RouterState {
  headers: {
    currentPath: string | null;
    method: string | null;
    locale: string;
  };
  lastHeadersDelta: HeadersDelta | null;
  entities: Record<string, any>;
  history: ConversationTurn[];
}

/**
 * Path hint extracted from currentPath header
 */
export interface PathHint {
  entityType: string;
  entityId: string;
}

/**
 * Router response from LLM inference
 */
export interface RouterResponse {
  componentId: string;
  props: Record<string, any>;
  message?: string;
  suggestedHeaders?: {
    currentPath?: string;
    method?: string;
    locale?: string;
  };
}

/**
 * Public API returned by createUiInferRouter
 */
export interface UiInferRouter {
  route: (params: { prompt: string }) => Promise<RouterResponse>;
  setHeaders: (partial: Partial<RouterState['headers']>) => void;
  getHeaders: () => RouterState['headers'];
  clearHeaders: () => void;
  getMemory: () => Record<string, any>;
  clearMemory: () => void;
  getHistory: () => ConversationTurn[];
  addToHistory: (turn: ConversationTurn) => void;
  clearHistory: () => void;
  getLastHeadersDelta: () => HeadersDelta | null;
}

