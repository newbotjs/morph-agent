/**
 * @fileoverview Main router logic for UI inference
 */

import OpenAI from 'openai';
import type {
  Component,
  ConversationTurn,
  RouterResponse,
  UiInferRouter,
  UiInferRouterConfig
} from './types.js';
import { createStateManager } from './state.js';
import { compactComponentsForLLM, hintFromPath, pickCompatibleComponents, computeHeadersDelta } from './utils.js';

/**
 * Creates a UI inference router instance
 * 
 * @description
 * Creates a router that uses LLM inference (no validation) to predict which UI component
 * to render based on user prompts. Maintains persistent headers (currentPath, method, locale, etc.)
 * and minimal entity memory between turns. The LLM chooses a component.id and returns props
 * ready for the frontend.
 * 
 * @example
 * ```typescript
 * const router = createUiInferRouter({
 *   model: 'gpt-4o-mini',
 *   components: [
 *     {
 *       id: 'EventDetailView',
 *       description: 'Shows event details',
 *       properties: [
 *         { name: 'eventId', type: 'string', description: 'Event ID', required: true }
 *       ]
 *     }
 *   ]
 * });
 * 
 * const result = await router.route({ prompt: 'Show event 123' });
 * // Returns: { componentId: 'EventDetailView', props: { eventId: '123' }, ... }
 * ```
 * 
 * @param config - Router configuration
 * @returns Router instance with route method and state management methods
 */
export function createUiInferRouter({
  model = 'gpt-4o-mini',
  apiKey = '',
  timezone = 'UTC',
  components = [],
  componentDefault = 'DisambiguationCard',
  systemInstruction = `You are a strict UI router.
- You only perform prediction/inference from a user prompt + headers + entity memory.
- You DO NOT VALIDATE, you DO NOT CORRECT. You infer the best intention and most probable props.
- You choose a component.id that EXISTS in the provided list.
- You return ONLY JSON.
- If information is missing, you base yourself on previous memory (state.entities) and/or leave props absent.
- You must stay consistent with headers (ex: currentPath=event/46792 → we're talking about this eventId=46792).
- Normalize dates to ISO 8601 when possible (server timezone provided).`,
  initialHistory = []
}: UiInferRouterConfig = {}): UiInferRouter {
  const client = new OpenAI({
    apiKey: apiKey || (globalThis as any).process?.env?.OPENAI_API_KEY
  });

  // Create state manager
  const stateManager = createStateManager(initialHistory);
  const state = stateManager.getState();

  /**
   * Routes a user prompt to a component using LLM inference
   * 
   * @param params - Route parameters
   * @param params.prompt - User prompt text
   * @returns Router response with component ID and props
   */
  async function route({ prompt }: { prompt: string }): Promise<RouterResponse> {
    // Prepare minimal context to send to LLM
    const headers = stateManager.getHeaders();
    const pathHint = hintFromPath(headers);
    const memory = stateManager.getMemory();

    // Restrict universe to compatible components to reduce hallucination
    const candidates = pickCompatibleComponents(components, headers);
    const componentsForLLM = compactComponentsForLLM(candidates);

    // Optional short history (truncate to stay light)
    const historyTail = state.history.slice(-6);

    // Output specification requested (no validation behind it)
    const outputSpec = {
      description: "Respond only in JSON. No free text outside JSON.",
      shape: {
        componentId: "string",
        props: "object",
        message: "string(optional, natural chatbot message explaining what it did)",
        suggestedHeaders: "object(optional, {currentPath?, method?, locale?} if user changes context/route)"
      }
    };

    const developerPreamble = [
      systemInstruction,
      `Server timezone: ${timezone}`,
      `AUTO NAVIGATION: The user can change context/route at any time in their sentence.
- Each component has "contexts" that indicate the currentPath and method to use.
- When you choose a component, look at its contexts and suggest the corresponding currentPath/method via suggestedHeaders.
- Example: if a component has contexts: [{currentPath:"main",methods:["GET"]}], and the user asks "main page", return:
  - componentId: "MainPage"
  - suggestedHeaders: {currentPath:"main",method:"GET"}
- Current headers are just a starting context, deduce the correct currentPath from the chosen component's contexts.`,
      `Rules for interpreting currentPath:
- "event/<id>" implies we're referring to this event by default.
- method can indicate the action: GET (read), PUT/PATCH (modify), POST (create on collection), DELETE (delete).`,
      `Inference tasks:
- Analyze user intention in their sentence.
- Distinguish between:
  * "main page/home" → MainPage (currentPath: main)
  * "event list/today's events" → EventListView (currentPath: event, filter by date)
  * "details of a specific event" → EventDetailView (currentPath: event/<id>, requires eventId)
  * "create an event" → EventCreateForm (currentPath: event, method: POST)
  * "modify an event" → EventEditor (currentPath: event/<id>, method: PUT/PATCH)
- Choose componentId from provided candidates that best matches the intention.
- IMPORTANT: After choosing a component, look at its "contexts" and suggest the corresponding currentPath/method in suggestedHeaders.
- Analyze user prompt to extract values corresponding to described properties.
- Use property descriptions to understand context and extract correct information.
- Infer most probable props based on descriptions and provided examples.
- For array properties (especially complex objects): READ the property description carefully - it contains detailed schemas, examples, and rules for each array item.
- When generating arrays of objects, ensure each object matches the exact structure described in the property definition.
- Use memory (state.entities) if user omits info already mentioned.
- If info is unknown, omit it (no invention, no placeholder).
- Add a natural and conversational message explaining what you did.`,
      `Required output (JSON only) with keys: componentId, props, message, suggestedHeaders.`,
    ].join('\n');

    const messages = [
      { role: 'system' as const, content: developerPreamble },
      { role: 'system' as const, content: `Candidate components: ${JSON.stringify(componentsForLLM)}` },
      { role: 'system' as const, content: `Headers: ${JSON.stringify(headers)}` },
      { role: 'system' as const, content: `Headers delta: ${JSON.stringify(state.lastHeadersDelta)}` },
      { role: 'system' as const, content: `Path hint: ${JSON.stringify(pathHint)}` },
      { role: 'system' as const, content: `Memory (state.entities): ${JSON.stringify(memory)}` },
      // Compact history
      ...historyTail.map(turn => ({
        role: turn.role as 'user' | 'assistant',
        content: turn.content
      })),
      { role: 'user' as const, content: prompt },
      { role: 'system' as const, content: `Respect this output specification: ${JSON.stringify(outputSpec)}` }
    ];

    // Single call: LLM → JSON (no validation)
    const resp = await client.chat.completions.create({
      model,
      messages,
      response_format: { type: 'json_object' }
    });

    const text = resp.choices[0]?.message?.content || '{}';
    let json: RouterResponse;
    try {
      json = JSON.parse(text);
    } catch {
      // Minimal fallback if model doesn't return clean JSON
      json = {
        componentId: componentDefault,
        props: { message: "I'm not sure. Can you clarify?" }
      };
    }

    // Priority 1: Headers suggested by LLM (context change detected)
    if (json?.suggestedHeaders && typeof json.suggestedHeaders === 'object') {
      const suggested = json.suggestedHeaders;
      const nextHeaders: Partial<typeof headers> = {};
      if (suggested.currentPath !== undefined) {
        nextHeaders.currentPath = suggested.currentPath;
      }
      if (suggested.method !== undefined) {
        nextHeaders.method = suggested.method;
      }
      if (suggested.locale !== undefined) {
        nextHeaders.locale = suggested.locale;
      }
      if (Object.keys(nextHeaders).length > 0) {
        stateManager.setHeaders(nextHeaders);
      }
    }
    // Priority 2: Deduce from chosen component's contexts
    else if (json?.componentId) {
      const selected = components.find(c => c.id === json.componentId);
      if (selected?.contexts && selected.contexts.length > 0) {
        // Take first context as reference
        const ctx = selected.contexts[0];
        const nextHeaders: Partial<typeof headers> = {};
        if (ctx.currentPath && stateManager.getHeaders().currentPath !== ctx.currentPath) {
          nextHeaders.currentPath = ctx.currentPath;
        }
        if (ctx.methods && ctx.methods.length > 0 && !ctx.methods.includes(stateManager.getHeaders().method || '')) {
          nextHeaders.method = ctx.methods[0]; // Take first method
        }
        if (Object.keys(nextHeaders).length > 0) {
          stateManager.setHeaders(nextHeaders);
        }
      }
      // Priority 3: Auto-switch if component has defaultPath/defaultMethod
      else if (selected && (selected.defaultPath || selected.defaultMethod)) {
        const nextHeaders: Partial<typeof headers> = {};
        if (selected.defaultPath && !String(stateManager.getHeaders().currentPath || '').startsWith(selected.defaultPath)) {
          nextHeaders.currentPath = selected.defaultPath;
        }
        if (selected.defaultMethod && stateManager.getHeaders().method !== selected.defaultMethod) {
          nextHeaders.method = selected.defaultMethod;
        }
        if (Object.keys(nextHeaders).length > 0) {
          stateManager.setHeaders(nextHeaders);
        }
      }
    }

    // Merge memory (WITHOUT validation) - extract entities from props
    if (json?.props && typeof json.props === 'object') {
      // Remember important properties for next turns
      const importantProps = ['eventId', 'title', 'start', 'attendees', 'durationMinutes'];
      const newEntities: Record<string, any> = {};
      for (const prop of importantProps) {
        if (json.props[prop] !== undefined) {
          newEntities[prop] = json.props[prop];
        }
      }
      const currentEntities = stateManager.getMemory();
      state.entities = { ...currentEntities, ...newEntities };
    }

    // Remember this turn (prompt + raw output) to help next turns
    const currentHeaders = stateManager.getHeaders();
    const headersDelta = state.lastHeadersDelta || computeHeadersDelta(currentHeaders, currentHeaders);
    stateManager.addToHistory({
      role: 'user',
      content: prompt,
      timestamp: new Date().toISOString(),
      headers: { ...currentHeaders },
      headersDelta
    });
    stateManager.addToHistory({
      role: 'assistant',
      content: text,
      timestamp: new Date().toISOString(),
      headers: { ...currentHeaders },
      headersDelta
    });

    return json;
  }

  return {
    // Public API
    route,
    setHeaders: stateManager.setHeaders,
    getHeaders: stateManager.getHeaders,
    clearHeaders: stateManager.clearHeaders,
    getMemory: stateManager.getMemory,
    clearMemory: stateManager.clearMemory,
    getHistory: stateManager.getHistory,
    addToHistory: stateManager.addToHistory,
    clearHistory: stateManager.clearHistory,
    getLastHeadersDelta: stateManager.getLastHeadersDelta
  };
}

