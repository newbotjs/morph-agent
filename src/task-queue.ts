import { Task, TaskResult } from './types';

/**
 * Manages a queue of tasks with dependency tracking
 * 
 * Handles task dependencies using a simple DAG (Directed Acyclic Graph)
 * and provides methods to add tasks, get the next ready task,
 * mark tasks as complete, and retrieve results.
 */
export class TaskQueue {
  private tasks: Record<string, Task> = {};
  private taskResults: Record<string, TaskResult> = {};
  private pending: Set<string> = new Set();
  
  /**
   * Add a single task to the queue.
   * If a task with the same ID already has a result, it will not be added to the pending queue again,
   * effectively preventing re-execution of already completed tasks even if re-issued by the LLM.
   * The task definition will still be updated in case parameters changed.
   * 
   * @param task - Task to add to the queue
   * @example
   * ```ts
   * taskQueue.add({
   *   id: 't1',
   *   kind: 'callApi',
   *   params: { url: '/data' }
   * });
   * ```
   */
  add(task: Task): void {
    this.tasks[task.id] = task; // Update task definition regardless
    
    // Only add to pending if no result already exists for this task ID
    if (this.taskResults.hasOwnProperty(task.id)) {
      console.warn(
        `TaskQueue: Task ID '${task.id}' was re-added but already has a result. ` +
        `It will not be added to the pending queue again. Current result will be kept.`
      );
      // Optionally, decide if we need to clear the old result if re-execution with new params was intended
      // For now, we prevent re-execution by not adding to pending.
      return;
    }
    this.pending.add(task.id);
  }

  /**
   * Add multiple tasks to the queue
   * 
   * @param tasks - Array of tasks to add to the queue
   * @example
   * ```ts
   * taskQueue.addMany([
   *   { id: 't1', kind: 'callApi', params: { url: '/data' } },
   *   { id: 't2', kind: 'compute', params: { input: 'data' }, dependsOn: ['t1'] }
   * ]);
   * ```
   */
  addMany(tasks: Task[]): void {
    for (const task of tasks) {
      this.add(task);
    }
  }
  
  /**
   * Get the next ready task (all dependencies resolved)
   * 
   * @returns The next task ready for execution or undefined if none is ready
   * @example
   * ```ts
   * const nextTask = taskQueue.nextReady();
   * if (nextTask) {
   *   // Execute the task
   * }
   * ```
   */
  nextReady(): Task | undefined {
    const readyTaskId = Array.from(this.pending).find(taskId => {
      const task = this.tasks[taskId];
      // Task is ready if it has no dependencies or all dependencies are completed
      return !task.dependsOn || task.dependsOn.every(depId => depId in this.taskResults);
    });
    
    return readyTaskId ? this.tasks[readyTaskId] : undefined;
  }
  
  /**
   * Mark a task as complete with its result
   * 
   * @param result - The result of the completed task
   * @example
   * ```ts
   * taskQueue.complete({
   *   id: 't1',
   *   status: 'ok',
   *   output: { data: 'response' }
   * });
   * ```
   */
  complete(result: TaskResult): void {
    const taskId = result.id;
    
    if (!this.pending.has(taskId)) {
      throw new Error(`Task ${taskId} not found in pending tasks`);
    }
    
    this.taskResults[taskId] = result;
    this.pending.delete(taskId);
  }
  
  /**
   * Check if all tasks are finished
   * 
   * @returns True if no more tasks are pending execution
   * @example
   * ```ts
   * if (taskQueue.isFinished()) {
   *   console.log('All tasks completed');
   * }
   * ```
   */
  isFinished(): boolean {
    return this.pending.size === 0;
  }
  
  /**
   * Get all task results
   * 
   * @returns Record of all task results by task ID
   * @example
   * ```ts
   * const allResults = taskQueue.getResults();
   * console.log(`Task t1 result:`, allResults.t1.output);
   * ```
   */
  getResults(): Record<string, TaskResult> {
    return { ...this.taskResults };
  }
} 