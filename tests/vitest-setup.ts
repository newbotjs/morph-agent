import { expect } from 'vitest';

// Helper Vitest matcher
expect.extend({
  toBeOneOf(received: any, expectedArray: any[]) {
    const pass = expectedArray.includes(received);
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be one of [${expectedArray.join(', ')}]`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be one of [${expectedArray.join(', ')}]`,
        pass: false,
      };
    }
  },
});

declare module 'vitest' {
  interface AsymmetricMatchersContaining {
    toBeOneOf(expected: any[]): void;
  }
  interface Assertion {
    toBeOneOf(expected: any[]): void;
  }
} 