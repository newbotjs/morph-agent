import { describe, it, expect } from 'vitest';
import { TaskQueue } from '../src/task-queue';
import { Task, TaskResult } from '../src/types';

describe('TaskQueue', () => {
  it('adds tasks to the queue', () => {
    const queue = new TaskQueue();
    const tasks: Task[] = [
      { id: 't1', kind: 'callApi', params: { url: '/test' } },
      { id: 't2', kind: 'compute', params: { operation: 'add', values: [1, 2] } }
    ];
    
    queue.addMany(tasks);
    
    // Check if nextReady returns the first task (since it has no dependencies)
    const nextTask = queue.nextReady();
    expect(nextTask).not.toBeUndefined();
    expect(nextTask?.id).toBe('t1');
  });
  
  it('handles task dependencies correctly', () => {
    const queue = new TaskQueue();
    const tasks: Task[] = [
      { id: 't1', kind: 'callApi', params: { url: '/api1' } },
      { id: 't2', kind: 'callApi', params: { url: '/api2' }, dependsOn: ['t1'] },
      { id: 't3', kind: 'compute', params: { operation: 'add' }, dependsOn: ['t1', 't2'] }
    ];
    
    queue.addMany(tasks);
    
    // First, only t1 should be ready (no dependencies)
    let nextTask = queue.nextReady();
    expect(nextTask?.id).toBe('t1');
    
    // Complete t1
    queue.complete({ id: 't1', status: 'ok', output: { data: 'test' } });
    
    // Now t2 should be ready (depends only on t1)
    nextTask = queue.nextReady();
    expect(nextTask?.id).toBe('t2');
    
    // Complete t2
    queue.complete({ id: 't2', status: 'ok', output: { data: 'test2' } });
    
    // Now t3 should be ready (depends on both t1 and t2)
    nextTask = queue.nextReady();
    expect(nextTask?.id).toBe('t3');
    
    // Complete t3
    queue.complete({ id: 't3', status: 'ok', output: 42 });
    
    // Now queue should be empty
    expect(queue.isFinished()).toBe(true);
    expect(queue.nextReady()).toBeUndefined();
  });
  
  it('tracks task results', () => {
    const queue = new TaskQueue();
    queue.addMany([
      { id: 't1', kind: 'callApi', params: { url: '/test' } }
    ]);
    
    const result: TaskResult = {
      id: 't1',
      status: 'ok',
      output: { success: true, data: 'test result' }
    };
    
    queue.complete(result);
    
    // Get results and verify
    const results = queue.getResults();
    expect(results['t1']).toEqual(result);
    expect(queue.isFinished()).toBe(true);
  });
  
  it('throws error when completing non-existing task', () => {
    const queue = new TaskQueue();
    const result: TaskResult = {
      id: 'nonexistent',
      status: 'ok',
      output: { data: 'test' }
    };
    
    expect(() => queue.complete(result)).toThrow();
  });
  
  it('handles empty task list properly', () => {
    const queue = new TaskQueue();
    queue.addMany([]);
    
    expect(queue.isFinished()).toBe(true);
    expect(queue.nextReady()).toBeUndefined();
    expect(queue.getResults()).toEqual({});
  });
}); 