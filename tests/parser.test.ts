import { describe, it, expect } from 'vitest';
import { parseDirectives } from '../src/parser';

describe('parseDirectives', () => {
  it('extracts a task directive from text', () => {
    const raw = 'Call the API ::Task{id:"t1",kind:"callApi",params:{url:"/api/data"}}';
    const parsed = parseDirectives(raw);
    
    expect(parsed.plainText).toBe('Call the API');
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].id).toBe('t1');
    expect(parsed.tasks[0].kind).toBe('callApi');
    expect(parsed.tasks[0].params).toEqual({ url: '/api/data' });
  });
  
  it('extracts a UI directive from text', () => {
    const raw = 'Show a map ::Ui{id:"map1",type:"Map",props:{center:[48.8566, 2.3522],zoom:10}}';
    const parsed = parseDirectives(raw);
    
    expect(parsed.plainText).toBe('Show a map');
    expect(parsed.ui).toHaveLength(1);
    expect(parsed.ui[0].id).toBe('map1');
    expect(parsed.ui[0].type).toBe('Map');
    expect(parsed.ui[0].props).toEqual({ center: [48.8566, 2.3522], zoom: 10 });
  });
  
  it('extracts multiple directives from text', () => {
    const raw = 'Let me check ::Task{id:"t1",kind:"callApi",params:{url:"/api/weather"}} and display ::Ui{id:"weather",type:"Chart",props:{data:[]}}';
    const parsed = parseDirectives(raw);
    
    expect(parsed.plainText).toBe('Let me check and display');
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.ui).toHaveLength(1);
    expect(parsed.tasks[0].id).toBe('t1');
    expect(parsed.ui[0].id).toBe('weather');
  });
  
  it('handles directives with nested objects', () => {
    const raw = '::Task{id:"t1",kind:"callApi",params:{url:"/api",headers:{"Content-Type":"application/json"}}}';
    const parsed = parseDirectives(raw);
    
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].params).toEqual({
      url: '/api',
      headers: { 'Content-Type': 'application/json' }
    });
  });
  
  it('returns empty arrays when no directives are found', () => {
    const raw = 'Just a simple text without any directives';
    const parsed = parseDirectives(raw);
    
    expect(parsed.plainText).toBe('Just a simple text without any directives');
    expect(parsed.tasks).toEqual([]);
    expect(parsed.ui).toEqual([]);
  });
  
  it('gracefully handles malformed directives', () => {
    // This should not throw but should skip the malformed directive
    const raw = 'Good ::Task{id:"t1"} and bad ::Task{malformed}';
    const parsed = parseDirectives(raw);
    
    expect(parsed.tasks).toHaveLength(1);
    expect(parsed.tasks[0].id).toBe('t1');
  });
}); 