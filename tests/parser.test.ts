import { describe, it, expect, vi } from 'vitest';
import { parseDirectives } from '../src/parser';
import { Task, UiDescriptor, ThinkingDirective, CapabilityKind } from '../src/types';

const MOCK_CAPABILITY_KIND: CapabilityKind = 'mockKind' as CapabilityKind;

describe('parseDirectives', () => {
  it('should parse a Task directive', () => {
    const rawText = `Some text before \`\`\`Task
{"id":"t1","kind":"${MOCK_CAPABILITY_KIND}","params":{"foo":"bar"}}
\`\`\` Some text after`;
    const result = parseDirectives(rawText);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]).toEqual<Task>({
      id: 't1',
      kind: MOCK_CAPABILITY_KIND,
      params: { foo: 'bar' },
    });
    expect(result.rawText).toBe(rawText);
  });

  it('should parse a Ui directive', () => {
    const rawText = `\`\`\`Ui
{"id":"ui1","type":"Button","props":{"label":"Click me"}}
\`\`\``;
    const result = parseDirectives(rawText);
    expect(result.ui).toHaveLength(1);
    expect(result.ui[0]).toEqual<UiDescriptor>({
      id: 'ui1',
      type: 'Button',
      props: { label: 'Click me' },
    });
  });

  it('should parse a Thinking directive', () => {
    const rawText = `\`\`\`Thinking
{"tasks":[{"id":"task1","kind":"${MOCK_CAPABILITY_KIND}","params":{}}]}
\`\`\``;
    const result = parseDirectives(rawText);
    expect(result.thinkingDirective).toBeDefined();
    expect(result.thinkingDirective?.tasks).toHaveLength(1);
    expect(result.thinkingDirective?.tasks[0]).toEqual<Task>({
      id: 'task1',
      kind: MOCK_CAPABILITY_KIND,
      params: {},
    });
  });

  it('should parse multiple directives of different kinds', () => {
    const rawText = `Text with a task: \`\`\`Task
{"id":"t1","kind":"${MOCK_CAPABILITY_KIND}","params":{"data":123}}
\`\`\` and a UI: \`\`\`Ui
{"id":"ui1","type":"Display","props":{"value":456}}
\`\`\``;
    const result = parseDirectives(rawText);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].id).toBe('t1');
    expect(result.ui).toHaveLength(1);
    expect(result.ui[0].id).toBe('ui1');
    expect(result.thinkingDirective).toBeUndefined();
  });

  it('should handle malformed JSON in a directive and warn', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rawText = '```Task\n{"id":"t1",kind":"badJSON"}\n```'; // Missing quote for kind value
    const result = parseDirectives(rawText);
    expect(result.tasks).toHaveLength(0);
    expect(consoleWarnSpy).toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Failed to parse JSON for Task directive: {"id":"t1",kind":"badJSON"}',
      expect.any(Error)
    );
    consoleWarnSpy.mockRestore();
  });

  it('should handle invalid Task structure and warn', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rawText = '```Task\n{"identifier":"t1","action":"test"}\n```'; // Missing id and kind
    const result = parseDirectives(rawText);
    expect(result.tasks).toHaveLength(0);
    expect(consoleWarnSpy).toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Invalid Task structure:', 
      { identifier: 't1', action: 'test' }
    );
    consoleWarnSpy.mockRestore();
  });

   it('should handle invalid Ui structure and warn', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rawText = '```Ui\n{"identifier":"ui1","component":"Button"}\n```'; // Missing id and type
    const result = parseDirectives(rawText);
    expect(result.ui).toHaveLength(0);
    expect(consoleWarnSpy).toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Invalid Ui structure:',
      { identifier: 'ui1', component: 'Button' }
    );
    consoleWarnSpy.mockRestore();
  });

  it('should handle invalid Thinking structure and warn', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rawText = '```Thinking\n{"actions":[]}\n```'; // Missing tasks array
    const result = parseDirectives(rawText);
    expect(result.thinkingDirective).toBeUndefined();
    expect(consoleWarnSpy).toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Invalid Thinking structure:',
        { actions: [] }
    );
    consoleWarnSpy.mockRestore();
  });

  it('should return empty arrays and undefined for thinkingDirective if no directives are present', () => {
    const rawText = 'Just some plain text without any directives.';
    const result = parseDirectives(rawText);
    expect(result.tasks).toEqual([]);
    expect(result.ui).toEqual([]);
    expect(result.thinkingDirective).toBeUndefined();
    expect(result.rawText).toBe(rawText);
  });

  it('should handle directives with extra whitespace around JSON', () => {
    const rawText = `\`\`\`Task
  {"id":"t1","kind":"${MOCK_CAPABILITY_KIND}","params":{}}  
\`\`\``;
    const result = parseDirectives(rawText);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].id).toBe('t1');
  });

  it('should correctly parse when multiple directives of the same kind exist', () => {
    const rawText = `\`\`\`Task
{"id":"t1","kind":"${MOCK_CAPABILITY_KIND}","params":{}}
\`\`\`
\`\`\`Task
{"id":"t2","kind":"${MOCK_CAPABILITY_KIND}","params":{}}
\`\`\``;
    const result = parseDirectives(rawText);
    expect(result.tasks).toHaveLength(2);
    expect(result.tasks[0].id).toBe('t1');
    expect(result.tasks[1].id).toBe('t2');
  });

  it('should only parse the first Thinking directive if multiple are present', () => {
    const rawText = `\`\`\`Thinking
{"tasks":[{"id":"think1","kind":"${MOCK_CAPABILITY_KIND}"}]}
\`\`\`
\`\`\`Thinking
{"tasks":[{"id":"think2","kind":"${MOCK_CAPABILITY_KIND}"}]}
\`\`\``;
    const result = parseDirectives(rawText);
    expect(result.thinkingDirective).toBeDefined();
    expect(result.thinkingDirective?.tasks[0].id).toBe('think2');
  });

  it('should handle text between directives', () => {
    const rawText = `Some introductory text.
\`\`\`Task
{"id":"t1","kind":"${MOCK_CAPABILITY_KIND}","params":{"p1":"v1"}}
\`\`\`
Some text in between.
\`\`\`Ui
{"id":"ui1","type":"Info","props":{"message":"Hello"}}
\`\`\`
Concluding text.`;
    const result = parseDirectives(rawText);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].id).toBe('t1');
    expect(result.ui).toHaveLength(1);
    expect(result.ui[0].id).toBe('ui1');
    expect(result.rawText).toBe(rawText);
  });
}); 