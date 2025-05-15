import { CapabilityStrategy, Json } from '../types';

/**
 * Parameters for the Compute capability
 */
export interface ComputeParams {
  /**
   * The operation to perform
   */
  operation: 'add' | 'subtract' | 'multiply' | 'divide' | 'average' | 'format';
  
  /**
   * Array of numbers to operate on
   */
  values?: number[];
  
  /**
   * Format string when using the format operation
   */
  format?: string;
  
  /**
   * Value to format when using the format operation
   */
  value?: Json;
  
  /**
   * Allow additional properties to satisfy Json constraint
   */
  [k: string]: Json | undefined;
}

/**
 * Response from the Compute capability
 */
export interface ComputeResult {
  /**
   * The computed result
   */
  result: number | string;
  
  /**
   * Allow additional properties to satisfy Json constraint
   */
  [k: string]: number | string;
}

/**
 * Strategy for performing simple computations
 * 
 * This strategy provides basic arithmetic operations and string formatting.
 */
export const ComputeStrategy: CapabilityStrategy<ComputeParams, ComputeResult> = {
  kind: 'compute',
  description: 'Perform simple arithmetic operations and string formatting',
  signature: 'operation: "add" | "subtract" | "multiply" | "divide" | "average" | "format", values: number[], format: string, value: Json',
  
  async run({ operation, values = [], format = '', value }, _env) {
    let result: number | string;
    
    switch (operation) {
      case 'add':
        result = values.reduce((sum, val) => sum + val, 0);
        break;
        
      case 'subtract':
        result = values.length > 0 ? values.reduce((diff, val, idx) => 
          idx === 0 ? val : diff - val, 0) : 0;
        break;
        
      case 'multiply':
        result = values.reduce((product, val) => product * val, 1);
        break;
        
      case 'divide':
        if (values.length < 2 || values[1] === 0) {
          throw new Error('Division requires at least two values and divisor cannot be zero');
        }
        result = values[0] / values[1];
        break;
        
      case 'average':
        result = values.length > 0 
          ? values.reduce((sum, val) => sum + val, 0) / values.length
          : 0;
        break;
        
      case 'format':
        if (typeof format !== 'string') {
          throw new Error('Format operation requires a format string');
        }
        
        // Simple placeholder replacement
        result = format.replace(/\{(\w+)\}/g, (_match, key) => {
          if (value && typeof value === 'object' && value !== null && !Array.isArray(value)) {
            const obj = value as Record<string, Json>;
            return key in obj ? String(obj[key]) : '';
          }
          return '';
        });
        break;
        
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
    
    return { result };
  },
}; 