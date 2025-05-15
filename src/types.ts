// Base primitives — no Node dependencies
export type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export interface LLMSession {
  /**
   * Generates a response from the LLM based on the provided prompt
   * 
   * @param prompt - The input prompt to send to the LLM
   * @returns A promise that resolves to the generated text response
   * @example
   * ```ts
   * const response = await llmSession.generate("Tell me about TypeScript");
   * ```
   */
  generate(prompt: string): Promise<string>;
}

// ----- Task system -----
export type CapabilityKind = 'callApi' | 'compute' | 'delay' /* … */;

/**
 * Represents a task to be executed by the agent
 * 
 * @example
 * ```ts
 * const task: Task = {
 *   id: 'fetch-weather',
 *   kind: 'callApi',
 *   params: { url: 'https://api.weather.com/current', method: 'GET' },
 *   dependsOn: ['location-task']
 * };
 * ```
 */
export interface Task<P extends Record<string, any> = Record<string, any>> {
  id: string;
  kind: CapabilityKind;
  params: P;
  dependsOn?: string[];
}

/**
 * Represents the result of an executed task
 * 
 * @example
 * ```ts
 * const result: TaskResult = {
 *   id: 'fetch-weather',
 *   status: 'ok',
 *   output: { temperature: 22, conditions: 'sunny' }
 * };
 * ```
 */
export interface TaskResult<R extends Json = Json> {
  id: string;
  status: 'ok' | 'error';
  output?: R;
  error?: string;
  _observed?: boolean; // Internal flag for agent loop
}

// ----- UI -----
/**
 * Describes a UI component to be rendered
 * 
 * @example
 * ```ts
 * const mapComponent: UiDescriptor = {
 *   id: 'weather-map',
 *   type: 'Map',
 *   props: { center: [48.8566, 2.3522], zoom: 10 },
 *   events: ['click', 'zoom']
 * };
 * ```
 */
export interface UiDescriptor<P extends Json = Json> {
  id: string;
  type: string;      // e.g.: 'Map', 'Chart'
  props: P;
  events?: string[];
}

// ----- Thinking Directive -----
/**
 * Represents a thinking directive from the LLM, outlining a plan of tasks.
 * The agent is expected to execute the first task, then re-prompt the LLM.
 */
export interface ThinkingDirective {
  // planId?: string; // Optional: For LLM to track multi-turn plans
  tasks: Task[];
}

// ----- Agent Events & Callback -----
export type AgentEventType =
  | 'llmResponse'         // New raw response from LLM as it's received
  | 'parsedDirectives'    // After parsing an LLM response, contains new tasks, UI, and thinking directives
  | 'thinkingDirective'   // When a ::Thinking directive is specifically identified and about to be processed
  | 'taskStart'           // When a task is about to be executed
  | 'taskResult'          // When a task completes with its result
  | 'uiDirective'         // When a new UI directive is identified
  | 'agentEnd';           // When the agent has finished all processing for the current chat turn

export interface LLMResponseEventData {
  rawText: string;
}

export interface ParsedDirectivesEventData {
  tasks: Task[];
  ui: UiDescriptor[];
  thinkingDirective?: ThinkingDirective; // Added thinking directive
  rawText: string; // The raw text from which these were parsed
}

export interface ThinkingDirectiveEventData {
  directive: ThinkingDirective;
}

export interface TaskStartEventData {
  task: Task;
}

// TaskResult is used directly for taskResult event data

export interface UiDirectiveEventData {
  uiDescriptor: UiDescriptor;
}

// ----- History Entry Types -----
export type HistoryRole = 'user' | 'assistant' | 'tool';

export interface BaseHistoryEntry {
  role: HistoryRole;
  timestamp?: number; // Optional: for ordering or debugging
}

export interface UserHistoryEntry extends BaseHistoryEntry {
  role: 'user';
  content: string;
}

export interface AssistantHistoryEntry extends BaseHistoryEntry {
  role: 'assistant';
  content: string; // Raw LLM response, may contain directives
}

export interface ToolHistoryEntry extends BaseHistoryEntry {
  role: 'tool';
  id: string; // Corresponds to Task id
  status: 'ok' | 'error';
  output?: Json; // Output of the tool if status is 'ok'
  error?: string;  // Error message if status is 'error'
}

export type HistoryEntry = UserHistoryEntry | AssistantHistoryEntry | ToolHistoryEntry;

export interface AgentEndEventData {
  history: HistoryEntry[]; // Updated to use HistoryEntry[]
  finalText: string; // The last raw text response from the LLM for this turn
  finalUi: UiDescriptor[]; // All UI descriptors accumulated during this turn
}

export interface AgentEvent {
  type: AgentEventType;
  data: LLMResponseEventData | ParsedDirectivesEventData | ThinkingDirectiveEventData | TaskStartEventData | TaskResult | UiDirectiveEventData | AgentEndEventData;
}

export type AgentChatCallback = (event: AgentEvent) => void;

// ----- Agent options -----
/**
 * Configuration options for an agent
 * 
 * @example
 * ```ts
 * const options: AgentOptions = {
 *   llm: openAiSession,
 *   capabilities: [callApiStrategy, computeStrategy],
 *   uiAdapter: webUiAdapter,
 *   systemPrompt: "You are a helpful assistant...",
 *   runtimeEnv: myCustomEnv // Optional
 * };
 * ```
 */
export interface AgentOptions {
  llm: LLMSession;
  capabilities: CapabilityStrategy<any, any>[];
  uiAdapter?: UiAdapter;
  systemPrompt?: string;
  runtimeEnv?: RuntimeEnv; // Added optional runtimeEnv
  onEvent?: AgentChatCallback; // Callback for streaming events
}

// ----- Strategy interface -----
/**
 * Defines a capability strategy for executing a specific kind of task
 * 
 * @example
 * ```ts
 * const callApiStrategy: CapabilityStrategy = {
 *   kind: 'callApi',
 *   async run(params, env) {
 *     const response = await env.fetch(params.url, params.options);
 *     return await response.json();
 *   }
 * };
 * ```
 */
export interface CapabilityStrategy<
  P extends Record<string, any> = Record<string, any>,
  R extends Json = Json
> {
  kind: CapabilityKind;
  /**
   * A short description of what the capability does.
   * This is used by the LLM to understand when to use this capability.
   */
  description: string;
  /**
   * A signature hint for the LLM, indicating the expected parameters.
   * This helps the LLM to correctly format the Task directive's params.
   * e.g., "url: string, method?: 'GET' | 'POST', body?: object"
   */
  signature: string;
  run(params: P, env: RuntimeEnv): Promise<R>;
}

// ----- Runtime environment (edge-safe) -----
/**
 * Provides runtime capabilities in an edge-compatible way
 * 
 * @example
 * ```ts
 * const env: RuntimeEnv = {
 *   fetch: globalThis.fetch,
 *   wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
 *   kv: cloudflareKV
 * };
 * ```
 */
export interface RuntimeEnv {
  fetch: typeof fetch;            // required
  wait: (ms: number) => Promise<void>;
  // Optional additions (e.g., KV, D1) declared by the host app
  [k: string]: unknown;
}

// ----- UI adapter -----
/**
 * Adapter for rendering UI components in different environments
 * 
 * @example
 * ```ts
 * const webUiAdapter: UiAdapter = {
 *   mount(desc) { // rendering logic },
 *   update(desc) { // update logic },
 *   unmount(id) { // cleanup logic },
 *   emit(event) { // event handling }
 * };
 * ```
 */
export interface UiAdapter {
  mount(desc: UiDescriptor): void;
  update(desc: UiDescriptor): void;
  unmount(id: string): void;
  emit(event: { id: string; name: string; payload: Json }): void;
} 