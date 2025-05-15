import { CapabilityStrategy } from './types';

/**
 * Registry for capability strategies
 * 
 * Provides a central place to register and retrieve capability strategies
 * that can be used by the executor to run tasks.
 */
export class CapabilityRegistry {
  private strategies = new Map<string, CapabilityStrategy>();
  
  /**
   * Register a capability strategy
   * 
   * @param strategy - The capability strategy to register
   * @returns This registry instance for method chaining
   * @example
   * ```ts
   * const registry = new CapabilityRegistry()
   *   .register(callApiStrategy)
   *   .register(computeStrategy);
   * ```
   */
  register(strategy: CapabilityStrategy): this {
    this.strategies.set(strategy.kind, strategy);
    return this;
  }
  
  /**
   * Register multiple capability strategies at once
   * 
   * @param strategies - Array of capability strategies to register
   * @returns This registry instance for method chaining
   * @example
   * ```ts
   * const registry = new CapabilityRegistry()
   *   .registerAll([callApiStrategy, computeStrategy, delayStrategy]);
   * ```
   */
  registerAll(strategies: CapabilityStrategy[]): this {
    for (const strategy of strategies) {
      this.register(strategy);
    }
    return this;
  }
  
  /**
   * Get a registered capability strategy by kind
   * 
   * @param kind - The kind of capability strategy to retrieve
   * @returns The registered strategy or undefined if not found
   * @example
   * ```ts
   * const apiStrategy = registry.get('callApi');
   * if (apiStrategy) {
   *   await apiStrategy.run(params, env);
   * }
   * ```
   */
  get(kind: string): CapabilityStrategy | undefined {
    return this.strategies.get(kind);
  }
  
  /**
   * Get all registered capability strategies
   * 
   * @returns Array of all registered capability strategies
   * @example
   * ```ts
   * const allStrategies = registry.getAll();
   * const executor = new Executor(allStrategies, env);
   * ```
   */
  getAll(): CapabilityStrategy[] {
    return Array.from(this.strategies.values());
  }
  
  /**
   * Check if a capability strategy is registered
   * 
   * @param kind - The kind of capability strategy to check
   * @returns True if the strategy is registered, false otherwise
   * @example
   * ```ts
   * if (registry.has('callApi')) {
   *   console.log('API capability is available');
   * }
   * ```
   */
  has(kind: string): boolean {
    return this.strategies.has(kind);
  }
} 