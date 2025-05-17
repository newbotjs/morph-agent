import { describe, it, expect, beforeEach } from 'vitest';
import { CapabilityRegistry } from '../src/registry';
import { CapabilityStrategy, CapabilityKind, RuntimeEnv } from '../src/types';

const MOCK_CAPABILITY_KIND_A: CapabilityKind = 'mockKindA' as CapabilityKind;
const MOCK_CAPABILITY_KIND_B: CapabilityKind = 'mockKindB' as CapabilityKind;

describe('CapabilityRegistry', () => {
  let registry: CapabilityRegistry;
  let mockStrategyA: CapabilityStrategy;
  let mockStrategyB: CapabilityStrategy;

  beforeEach(() => {
    registry = new CapabilityRegistry();
    mockStrategyA = {
      kind: MOCK_CAPABILITY_KIND_A,
      description: 'Mock strategy A',
      signature: 'mockA(params: any)',
      run: async (params: any, env: RuntimeEnv) => ({ result: 'A' }),
    };
    mockStrategyB = {
      kind: MOCK_CAPABILITY_KIND_B,
      description: 'Mock strategy B',
      signature: 'mockB(params: any)',
      run: async (params: any, env: RuntimeEnv) => ({ result: 'B' }),
    };
  });

  it('should register a single capability strategy', () => {
    registry.register(mockStrategyA);
    expect(registry.get(MOCK_CAPABILITY_KIND_A)).toBe(mockStrategyA);
    expect(registry.has(MOCK_CAPABILITY_KIND_A)).toBe(true);
  });

  it('should return undefined for a non-existent strategy', () => {
    expect(registry.get('nonExistentKind' as CapabilityKind)).toBeUndefined();
    expect(registry.has('nonExistentKind' as CapabilityKind)).toBe(false);
  });

  it('should register multiple capability strategies', () => {
    registry.registerAll([mockStrategyA, mockStrategyB]);
    expect(registry.get(MOCK_CAPABILITY_KIND_A)).toBe(mockStrategyA);
    expect(registry.has(MOCK_CAPABILITY_KIND_A)).toBe(true);
    expect(registry.get(MOCK_CAPABILITY_KIND_B)).toBe(mockStrategyB);
    expect(registry.has(MOCK_CAPABILITY_KIND_B)).toBe(true);
  });

  it('should overwrite a strategy if registered with the same kind', () => {
    registry.register(mockStrategyA);
    const newMockStrategyA: CapabilityStrategy = {
      kind: MOCK_CAPABILITY_KIND_A, // Same kind
      description: 'New Mock strategy A',
      signature: 'newMockA(params: any)',
      run: async (params: any, env: RuntimeEnv) => ({ result: 'New A' }),
    };
    registry.register(newMockStrategyA);
    expect(registry.get(MOCK_CAPABILITY_KIND_A)).toBe(newMockStrategyA);
    expect(registry.get(MOCK_CAPABILITY_KIND_A)?.description).toBe('New Mock strategy A');
  });

  it('should get all registered strategies', () => {
    registry.registerAll([mockStrategyA, mockStrategyB]);
    const allStrategies = registry.getAll();
    expect(allStrategies).toHaveLength(2);
    expect(allStrategies).toContain(mockStrategyA);
    expect(allStrategies).toContain(mockStrategyB);
  });

  it('should return an empty array if no strategies are registered when getting all', () => {
    const allStrategies = registry.getAll();
    expect(allStrategies).toHaveLength(0);
    expect(allStrategies).toEqual([]);
  });

  it('has method should work correctly', () => {
    expect(registry.has(MOCK_CAPABILITY_KIND_A)).toBe(false);
    registry.register(mockStrategyA);
    expect(registry.has(MOCK_CAPABILITY_KIND_A)).toBe(true);
    expect(registry.has(MOCK_CAPABILITY_KIND_B)).toBe(false);
  });
}); 