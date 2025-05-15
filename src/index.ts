// Export core types
export * from './types';

// Export main classes
export { Agent } from './agent';
export { Executor } from './executor';
export { TaskQueue } from './task-queue';
export { CapabilityRegistry } from './registry';

// Export parsers
export { parseDirectives, type ParsedMessage } from './parser';

// Sample strategies exports
export * from './strategies';

/**
 * LLM Agent - A minimalist, portable library for building LLM agents
 * 
 * This library provides the building blocks for creating LLM agents that can:
 * - Parse and execute task directives embedded in LLM responses (::Task{})
 * - Render UI components (::Ui{})
 * - Execute a Reason → Plan → Act → Observe loop
 * 
 * Design goals:
 * - No framework dependencies (React, Vue, etc.)
 * - Compatible with Edge/Serverless/Browsers
 * - Runs on Node.js, Deno, Cloudflare Workers, browsers
 * - Extensible via strategies and adapters
 */ 