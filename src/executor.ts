import { CapabilityKind, CapabilityStrategy, RuntimeEnv, Task, TaskResult } from './types';

/**
 * Executes tasks using registered capability strategies
 * 
 * The Executor delegates task execution to the appropriate strategy based on the task's kind.
 * It provides a unified interface for running tasks in the context of a runtime environment.
 */
export class Executor {
  private strategies: Record<CapabilityKind, CapabilityStrategy>;
  
  /**
   * Creates a new Executor with registered capability strategies
   * 
   * @param strategies - Map of capability strategies by kind
   * @param env - Runtime environment providing platform capabilities
   */
  constructor(
    strategies: CapabilityStrategy[],
    private env: RuntimeEnv,
  ) {
    // Index strategies by their kind for quick lookup
    this.strategies = strategies.reduce((acc, strategy) => {
      acc[strategy.kind] = strategy;
      return acc;
    }, {} as Record<CapabilityKind, CapabilityStrategy>);
  }
  
  /**
   * Executes a task using the appropriate registered strategy
   * 
   * @param task - The task to execute
   * @returns A promise resolving to the task result
   * @example
   * ```ts
   * const executor = new Executor([callApiStrategy, computeStrategy], env);
   * const result = await executor.runTask({
   *   id: 'fetch-data',
   *   kind: 'callApi',
   *   params: { url: '/api/data' }
   * });
   * ```
   */
  async runTask(task: Task): Promise<TaskResult> {
    try {
      const { id, kind, params } = task;
      const strategy = this.strategies[kind];
      
      if (!strategy) {
        return {
          id,
          status: 'error',
          error: `No strategy registered for capability kind: ${kind}`
        };
      }
      
      const output = await strategy.run(params, this.env);
      
      return {
        id,
        status: 'ok',
        output
      };
    } catch (error) {
      return {
        id: task.id,
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
} 