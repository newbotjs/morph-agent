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

/**
 * Parse a string containing ::Task{…}, ::Ui{…}, and ::Thinking{…} directives.
 * The original raw string is returned along with extracted tasks, UI elements, and thinking directives.
 * 
 * @param raw - The raw string to parse
 * @returns An object containing the original raw text, tasks, UI descriptors, and thinking directive
 * @example
 * ```ts
 * const rawInput = "Let\'s check flights ::Task{id:\'t1\',kind:\'callApi\',params:{url:\'/flights\'}}";
 * const parsed = parseDirectives(rawInput);
 * console.log(parsed.rawText); // "Let\'s check flights ::Task{id:\'t1\',kind:\'callApi\',params:{url:\'/flights\'}}"
 * console.log(parsed.tasks[0].id); // \'t1\'
 * ```
 */
export function parseDirectives(raw: string): ParsedMessage {
  const tasks: Task[] = [];
  const ui: UiDescriptor[] = [];
  let thinkingDirective: ThinkingDirective | undefined;

  // Regex to find directives and capture their type and content.
  const directiveRegex = /::(?<type>Task|Ui|Thinking)\s*\{(?<content>(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}/g;

  let match;
  while ((match = directiveRegex.exec(raw)) !== null) {
    const type = match.groups?.type;
    const rawContent = match.groups?.content?.trim() ?? "";

    if (type) {
      try {
        // Only add quotes around keys that are not already quoted
        const objectBody = rawContent.replace(/(?<!["'])\b(\w+)\s*:/g, '"$1":');
        const parsedData = JSON.parse(rawContent === "" ? "{}" : `{${objectBody}}`);

        if (type === 'Task') {
          tasks.push(parsedData as Task);
        } else if (type === 'Ui') {
          ui.push(parsedData as UiDescriptor);
        } else if (type === 'Thinking') {
          thinkingDirective = parsedData as ThinkingDirective;
        }
      } catch (error) {
        console.error(`Failed to parse ${type} directive content: "${match.groups?.content}". Error:`, error);
      }
    }
  }
  
  // Return the original raw text, along with parsed tasks, UI elements, and thinking directive
  return { rawText: raw, tasks, ui, thinkingDirective };
} 