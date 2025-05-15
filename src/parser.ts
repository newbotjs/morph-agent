import { Task, UiDescriptor, ThinkingDirective } from './types';

/**
 * Result of parsing a message containing directives
 */
export interface ParsedMessage {
  rawText: string;
  tasks: Task[];
  ui: UiDescriptor[];
  thinkingDirective?: ThinkingDirective;
}

const DIRECTIVE_PATTERN = /```(Task|Ui|Thinking)\n([\s\S]*?)\n```/g;

/**
 * Parses a raw text string from an LLM to extract tasks, UI components, and thinking directives.
 * It looks for specific patterns like ```Task\n{...}```, ```Ui\n{...}```, and ```Thinking\n{...}```.
 * The content within the braces is expected to be valid JSON.
 *
 * @param rawText - The raw text output from the LLM.
 * @returns An object containing the original raw text, and arrays of parsed tasks, UI descriptors, and an optional thinking directive.
 * @example
 * ```ts
 * const result = parseDirectives("Some text from LLM ```Task\n{\"id\":\"t1\",\"kind\":\"api\"}``` and ```Ui\n{\"id\":\"ui1\",\"type\":\"Button\"}```");
 * console.log(result.tasks); // [{id: "t1", kind: "api"}]
 * console.log(result.ui);    // [{id: "ui1", type: "Button"}]
 * ```
 */
export function parseDirectives(rawText: string): ParsedMessage {
  const tasks: Task[] = [];
  const ui: UiDescriptor[] = [];
  let thinkingDirective: ThinkingDirective | undefined;

  let match;
  // Reset lastIndex for global regex
  DIRECTIVE_PATTERN.lastIndex = 0; 
  
  while ((match = DIRECTIVE_PATTERN.exec(rawText)) !== null) {
    const directiveKind = match[1];
    const jsonPayload = match[2].trim();

    try {
      // Attempt to parse the JSON payload
      const payload = JSON.parse(jsonPayload);

      if (directiveKind === 'Task') {
        // Validate task structure if necessary
        if (payload.id && payload.kind) {
          tasks.push(payload as Task);
        } else {
          console.warn('Invalid Task structure:', payload);
        }
      } else if (directiveKind === 'Ui') {
        // Validate UI descriptor structure if necessary
        if (payload.id && payload.type) {
          ui.push(payload as UiDescriptor);
        } else {
          console.warn('Invalid Ui structure:', payload);
        }
      } else if (directiveKind === 'Thinking') {
        // Validate Thinking directive structure
        if (Array.isArray(payload.tasks)) {
          thinkingDirective = payload as ThinkingDirective;
        } else {
          console.warn('Invalid Thinking structure:', payload);
        }
      }
    } catch (error) {
      console.warn(
        `Failed to parse JSON for ${directiveKind} directive: ${jsonPayload}`,
        error,
      );
    }
  }

  return {
    rawText,
    tasks,
    ui,
    thinkingDirective,
  };
} 