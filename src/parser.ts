import { Task, UiDescriptor } from './types';

/**
 * Result of parsing a message containing directives
 */
export interface ParsedMessage {
  rawText: string;
  tasks: Task[];
  ui: UiDescriptor[];
}

/**
 * Parse a string containing ::Task{…} and ::Ui{…} directives.
 * The original raw string is returned along with extracted tasks and UI elements.
 * 
 * @param raw - The raw string to parse
 * @returns An object containing the original raw text, tasks, and UI descriptors
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

  // Regex to find directives and capture their type and content.
  const directiveRegex = /::(?<type>Task|Ui)\s*\{(?<content>(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*)\}/g;

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
        }
      } catch (error) {
        console.error(`Failed to parse ${type} directive content: "${match.groups?.content}". Error:`, error);
      }
    }
  }
  
  // Return the original raw text, along with parsed tasks and ui elements
  return { rawText: raw, tasks, ui };
} 