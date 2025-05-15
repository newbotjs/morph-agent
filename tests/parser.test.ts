import { describe, it, expect } from 'vitest';
import { parseDirectives } from '../src/parser';

describe('parseDirectives', () => {
  it('extracts a task directive from text', () => {
    const raw = 'Call the API ```Task\n{"id":"t1","kind":"callApi","params":{"url":"/api/data"}}\n```';
    const parsed = parseDirectives(raw);
    
    expect(parsed.rawText).toBe(raw);
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].id).toBe('t1');
    expect(parsed.tasks[0].kind).toBe('callApi');
    expect(parsed.tasks[0].params).toEqual({ url: '/api/data' });
  });
  
  it('extracts a UI directive from text', () => {
    const raw = 'Show a map ```Ui\n{"id":"map1","type":"Map","props":{"center":[48.8566, 2.3522],"zoom":10}}\n```';
    const parsed = parseDirectives(raw);
    
    expect(parsed.rawText).toBe(raw);
    expect(parsed.ui).toHaveLength(1);
    expect(parsed.ui[0].id).toBe('map1');
    expect(parsed.ui[0].type).toBe('Map');
    expect(parsed.ui[0].props).toEqual({ center: [48.8566, 2.3522], zoom: 10 });
  });
  
  it('extracts multiple directives from text', () => {
    const raw = 'Let me check ```Task\n{"id":"t1","kind":"callApi","params":{"url":"/api/weather"}}\n``` and display ```Ui\n{"id":"weather","type":"Chart","props":{"data":[]}}\n```';
    const parsed = parseDirectives(raw);
    
    expect(parsed.rawText).toBe(raw);
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.ui).toHaveLength(1);
    expect(parsed.tasks[0].id).toBe('t1');
    expect(parsed.ui[0].id).toBe('weather');
  });
  
  it('handles directives with nested objects in JSON', () => {
    const raw = '```Task\n{"id":"t1","kind":"callApi","params":{"url":"/api","headers":{"Content-Type":"application/json"}}}\n```';
    const parsed = parseDirectives(raw);
    
    expect(parsed.rawText).toBe(raw);
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].params).toEqual({
      url: '/api',
      headers: { 'Content-Type': 'application/json' }
    });
  });
  
  it('returns empty arrays when no directives are found', () => {
    const raw = 'Just a simple text without any directives';
    const parsed = parseDirectives(raw);
    
    expect(parsed.rawText).toBe(raw);
    expect(parsed.tasks).toEqual([]);
    expect(parsed.ui).toEqual([]);
  });
  
  it('gracefully handles malformed JSON in directives', () => {
    const raw = 'Good ```Task\n{"id":"t1","kind":"callApi"}\n``` and bad ```Task\n{malformed_json_missing_quotes_on_key: true}\n```';
    const parsed = parseDirectives(raw);
    
    expect(parsed.rawText).toBe(raw);
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].id).toBe('t1');
  });

  it('extracts a thinking directive from text', () => {
    const raw = 'Let me think... ```Thinking\n{"tasks":[{"id":"t1_think","kind":"compute","params":{"val":1}}]}```';
    const parsed = parseDirectives(raw);

    expect(parsed.rawText).toBe(raw);
    expect(parsed.thinkingDirective).toBeDefined();
    expect(parsed.thinkingDirective?.tasks).toHaveLength(1);
    expect(parsed.thinkingDirective?.tasks[0].id).toBe('t1_think');
    expect(parsed.thinkingDirective?.tasks[0].kind).toBe('compute');
  });

  it('handles directives with extra newlines in JSON payload', () => {
    const raw = '```Task\n{\n  "id": "tExtraNewline",\n  "kind": "callApi",\n  "params": {\n    "url": "/api/test"\n  }\n}\n```';
    const parsed = parseDirectives(raw);

    expect(parsed.rawText).toBe(raw);
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].id).toBe('tExtraNewline');
    expect(parsed.tasks[0].params).toEqual({ url: '/api/test' });
  });

   it('handles empty JSON payload gracefully', () => {
    const raw = 'Some text with ```Task\n{}\n```';
    const parsed = parseDirectives(raw);
    expect(parsed.rawText).toBe(raw);
    // Assuming an empty JSON {} is a valid Task object with missing fields but doesn't break parsing.
    // The parser currently logs a warning for invalid task structure.
    // Depending on stricter validation, this test might need adjustment.
    // For now, checking if tasks array is populated or not based on current lenient parsing.
    expect(parsed.tasks).toHaveLength(1); // or 0, depending on how empty payload is treated
    // If it's treated as an invalid task and skipped:
    // expect(parsed.tasks).toHaveLength(0);
  });

  it('ignores directives with unknown kinds', () => {
    const raw = '```UnknownDirective\n{"data":"some_value"}\n```';
    const parsed = parseDirectives(raw);
    expect(parsed.rawText).toBe(raw);
    expect(parsed.tasks).toHaveLength(0);
    expect(parsed.ui).toHaveLength(0);
    expect(parsed.thinkingDirective).toBeUndefined();
  });

}); 