import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Executor } from '../src/executor';
import { CapabilityStrategy, CapabilityKind, RuntimeEnv, Task, TaskResult } from '../src/types';

const MOCK_CAPABILITY_KIND: CapabilityKind = 'mockKind' as CapabilityKind;
const MOCK_OTHER_KIND: CapabilityKind = 'otherKind' as CapabilityKind;

describe('Executor', () => {
  let mockStrategy: CapabilityStrategy;
  let mockOtherStrategy: CapabilityStrategy;
  let mockRuntimeEnv: RuntimeEnv;
  let executor: Executor;

  beforeEach(() => {
    
    mockStrategy = {
      kind: MOCK_CAPABILITY_KIND,
      description: 'Mock capability for testing',
      signature: 'mockCapability(param: string)',
      run: vi.fn().mockResolvedValue({ success: true, data: 'test result' }),
    };

    mockOtherStrategy = {
      kind: MOCK_OTHER_KIND,
      description: 'Another mock capability',
      signature: 'otherCapability(param: number)',
      run: vi.fn().mockResolvedValue({ success: true, data: 'other result' }),
    };

    mockRuntimeEnv = {
      fetch: vi.fn(),
      wait: vi.fn().mockImplementation((ms) => new Promise(resolve => setTimeout(resolve, ms))),
    };

    executor = new Executor([mockStrategy, mockOtherStrategy], mockRuntimeEnv);
  });

  it('should execute a task with the correct strategy', async () => {
    const task: Task = {
      id: 'task1',
      kind: MOCK_CAPABILITY_KIND,
      params: { data: 'test' },
    };

    const result = await executor.runTask(task);

    expect(result.status).toBe('ok');
    expect(mockStrategy.run).toHaveBeenCalledWith({ data: 'test' }, mockRuntimeEnv);
    expect(result.id).toBe('task1');
    expect(result.output).toEqual({ success: true, data: 'test result' });
  });

  it('should return an error when strategy is not found', async () => {
    const task: Task = {
      id: 'task2',
      kind: 'nonExistentKind' as CapabilityKind,
      params: { data: 'test' },
    };

    const result = await executor.runTask(task);

    expect(result.status).toBe('error');
    expect(result.id).toBe('task2');
    expect(result.error).toContain('No strategy registered for capability kind: nonExistentKind');
  });

  it('should handle errors thrown during task execution', async () => {
    mockStrategy.run = vi.fn().mockRejectedValue(new Error('Execution failed'));

    const task: Task = {
      id: 'task3',
      kind: MOCK_CAPABILITY_KIND,
      params: { data: 'test' },
    };

    const result = await executor.runTask(task);

    expect(result.status).toBe('error');
    expect(result.id).toBe('task3');
    expect(result.error).toBe('Execution failed');
  });

  it('should convert non-Error exceptions to strings', async () => {
    mockStrategy.run = vi.fn().mockRejectedValue('String exception');

    const task: Task = {
      id: 'task4',
      kind: MOCK_CAPABILITY_KIND,
      params: { data: 'test' },
    };

    const result = await executor.runTask(task);

    expect(result.status).toBe('error');
    expect(result.id).toBe('task4');
    expect(result.error).toBe('String exception');
  });

  it('should execute multiple tasks with different strategies', async () => {
    const task1: Task = {
      id: 'task-first',
      kind: MOCK_CAPABILITY_KIND,
      params: { data: 'test1' },
    };

    const task2: Task = {
      id: 'task-second',
      kind: MOCK_OTHER_KIND,
      params: { value: 42 },
    };

    const result1 = await executor.runTask(task1);
    const result2 = await executor.runTask(task2);

    expect(result1.status).toBe('ok');
    expect(result1.id).toBe('task-first');
    expect(mockStrategy.run).toHaveBeenCalledWith({ data: 'test1' }, mockRuntimeEnv);

    expect(result2.status).toBe('ok');
    expect(result2.id).toBe('task-second');
    expect(mockOtherStrategy.run).toHaveBeenCalledWith({ value: 42 }, mockRuntimeEnv);
  });
}); 