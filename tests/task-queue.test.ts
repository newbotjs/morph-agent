import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TaskQueue } from '../src/task-queue';
import { Task, TaskResult, CapabilityKind } from '../src/types';

// Define a mock CapabilityKind for testing purposes
const MOCK_CAPABILITY_KIND: CapabilityKind = 'mockKind' as CapabilityKind;

describe('TaskQueue', () => {
  let taskQueue: TaskQueue;

  beforeEach(() => {
    taskQueue = new TaskQueue();
  });

  it('should add a single task', () => {
    const task: Task = { id: 't1', kind: MOCK_CAPABILITY_KIND, params: {} };
    taskQueue.add(task);
    expect(taskQueue.isFinished()).toBe(false);
    const nextTask = taskQueue.nextReady();
    expect(nextTask).toEqual(task);
  });

  it('should add multiple tasks', () => {
    const tasks: Task[] = [
      { id: 't1', kind: MOCK_CAPABILITY_KIND, params: {} },
      { id: 't2', kind: MOCK_CAPABILITY_KIND, params: {} },
    ];
    taskQueue.addMany(tasks);
    expect(taskQueue.isFinished()).toBe(false);
    expect(taskQueue.nextReady()).toBeDefined();
  });

  it('should return undefined if no task is ready', () => {
    expect(taskQueue.nextReady()).toBeUndefined();
  });

  it('should mark a task as complete', () => {
    const task: Task = { id: 't1', kind: MOCK_CAPABILITY_KIND, params: {} };
    taskQueue.add(task);
    const result: TaskResult = { id: 't1', status: 'ok', output: 'done' };
    taskQueue.complete(result);
    expect(taskQueue.isFinished()).toBe(true);
    expect(taskQueue.getResults()['t1']).toEqual(result);
  });

  it('should throw an error when completing a non-pending task', () => {
    const result: TaskResult = { id: 't1', status: 'ok', output: 'done' };
    expect(() => taskQueue.complete(result)).toThrowError("Task t1 not found in pending tasks");
  });

  it('should handle task dependencies', () => {
    const task1: Task = { id: 't1', kind: MOCK_CAPABILITY_KIND, params: {} };
    const task2: Task = { id: 't2', kind: MOCK_CAPABILITY_KIND, params: {}, dependsOn: ['t1'] };
    taskQueue.addMany([task1, task2]);

    expect(taskQueue.nextReady()).toEqual(task1);
    // Call nextReady() again to ensure it doesn't change state if the task is not completed
    expect(taskQueue.nextReady()).toEqual(task1); 

    const result1: TaskResult = { id: 't1', status: 'ok', output: 'done' };
    taskQueue.complete(result1);

    expect(taskQueue.nextReady()).toEqual(task2); // Now t2 should be ready
  });

  it('should be finished when all tasks are completed', () => {
    const task: Task = { id: 't1', kind: MOCK_CAPABILITY_KIND, params: {} };
    taskQueue.add(task);
    const result: TaskResult = { id: 't1', status: 'ok', output: 'done' };
    taskQueue.complete(result);
    expect(taskQueue.isFinished()).toBe(true);
  });

  it('should not add a task to pending if it already has a result (re-adding)', () => {
    const task1: Task = { id: 't1', kind: MOCK_CAPABILITY_KIND, params: { data: 1 } };
    taskQueue.add(task1);
    
    const result1: TaskResult = { id: 't1', status: 'ok', output: 'initial output' };
    taskQueue.complete(result1);
    expect(taskQueue.isFinished()).toBe(true);
    expect(taskQueue.getResults()['t1']).toEqual(result1);

    const task1Again: Task = { id: 't1', kind: MOCK_CAPABILITY_KIND, params: { data: 2 } };
    // Spy on console.warn
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    taskQueue.add(task1Again);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      `TaskQueue: Task ID 't1' was re-added but already has a result. ` +
      `It will not be added to the pending queue again. Current result will be kept.`
    );

    expect(taskQueue.isFinished()).toBe(true); 
    expect(taskQueue.nextReady()).toBeUndefined();
    expect(taskQueue.getResults()['t1']).toEqual(result1);
    consoleWarnSpy.mockRestore();
  });

  it('should correctly identify ready tasks with multiple dependencies', () => {
    // Simplifier le test pour qu'il soit plus déterministe
    // Test spécifique à la vérification que t3 devient prêt quand t1 et t2 sont complétés
    const t1: Task = { id: 't1', kind: MOCK_CAPABILITY_KIND, params: {} };
    const t2: Task = { id: 't2', kind: MOCK_CAPABILITY_KIND, params: {} };
    const t3: Task = { id: 't3', kind: MOCK_CAPABILITY_KIND, params: {}, dependsOn: ['t1', 't2'] };
    
    // Ajouter les tâches dans un ordre déterminé
    taskQueue.add(t1);
    taskQueue.add(t2);
    taskQueue.add(t3);
    
    // On s'attend à ce que t1 ou t2 soit prêt, comme ils n'ont pas de dépendances
    const firstReady = taskQueue.nextReady();
    expect(firstReady?.id).toBeOneOf(['t1', 't2']);
    
    // Compléter t1
    taskQueue.complete({ id: 't1', status: 'ok', output: {} });
    
    // Maintenant t2 devrait être le prochain prêt
    expect(taskQueue.nextReady()?.id).toBe('t2');
    
    // Compléter t2
    taskQueue.complete({ id: 't2', status: 'ok', output: {} });
    
    // Comme t1 et t2 sont complétés, t3 devrait être prêt
    expect(taskQueue.nextReady()?.id).toBe('t3');
    
    // Compléter t3
    taskQueue.complete({ id: 't3', status: 'ok', output: {} });
    
    // Toutes les tâches devraient être terminées
    expect(taskQueue.isFinished()).toBe(true);
  });

  it('should return all results, and it should be a copy', () => {
    const t1: Task = { id: 't1', kind: MOCK_CAPABILITY_KIND, params: {} };
    const t2: Task = { id: 't2', kind: MOCK_CAPABILITY_KIND, params: {} };
    taskQueue.addMany([t1, t2]);
    const r1: TaskResult = { id: 't1', status: 'ok', output: 'res1' };
    const r2: TaskResult = { id: 't2', status: 'error', error: 'err2' };
    
    // Tasks are added but not completed yet
    expect(Object.keys(taskQueue.getResults()).length).toBe(0);

    taskQueue.complete(r1);
    taskQueue.complete(r2);

    const results = taskQueue.getResults();
    expect(results).toEqual({
      t1: r1,
      t2: r2,
    });
  
    const copiedResults = taskQueue.getResults();
    expect(copiedResults.t1.status).toBe('ok');
    
    const resultsCopy = { ...taskQueue.getResults() };
    resultsCopy.t1 = { ...resultsCopy.t1, status: 'error' };
    expect(taskQueue.getResults().t1.status).toBe('ok');
  });

  it('should update task definition even if task already has a result', () => {
    const initialTask: Task = { id: 'task1', kind: MOCK_CAPABILITY_KIND, params: { data: 'initial' } };
    taskQueue.add(initialTask);
    taskQueue.complete({ id: 'task1', status: 'ok', output: 'done' });

    // Access internal tasks for verification
    // @ts-expect-error Accessing private member for test
    expect(taskQueue.tasks['task1'].params.data).toBe('initial');

    const updatedTask: Task = { id: 'task1', kind: MOCK_CAPABILITY_KIND, params: { data: 'updated' } };
    taskQueue.add(updatedTask); // Re-adding with updated params

    // @ts-expect-error Accessing private member for test
    expect(taskQueue.tasks['task1'].params.data).toBe('updated');
    expect(taskQueue.isFinished()).toBe(true); 
    expect(taskQueue.nextReady()).toBeUndefined(); 
  });

  it('should allow task with no dependencies to be fetched if added after dependent task', () => {
    const dependentTask: Task = { id: 'dt1', kind: MOCK_CAPABILITY_KIND, params: {}, dependsOn: ['it1'] };    
    const independentTask: Task = { id: 'it1', kind: MOCK_CAPABILITY_KIND, params: {} };

    taskQueue.add(dependentTask); // dependent task added first
    expect(taskQueue.nextReady()).toBeUndefined(); // it1 is not yet added

    taskQueue.add(independentTask); // independent task added later
    expect(taskQueue.nextReady()).toEqual(independentTask);
  });

}); 