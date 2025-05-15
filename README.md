# LLM Agent Library

A minimalist, portable JavaScript/TypeScript library for building tooled LLM agents.

This library allows you to create agents that can:
- Understand user instructions in natural language.
- Reason to determine the necessary tasks to accomplish the instruction.
- Plan and trigger these tasks using declarative tags embedded in messages (e.g., `::Task{}`).
- Display interactive UIs (e.g., maps, charts) via `::Ui{}` tags.
- Loop through task results to refine future actions (Reason → Plan → Act → Observe).

## Key Features

- **Minimalist:** No dependency on heavy UI frameworks (React, Vue, etc.).
- **Portable:** Compatible with Edge, Serverless, and modern browsers.
- **Versatile:** Runs on Node.js, Deno, Cloudflare Workers.
- **Extensible:** Easily extendable via a system of strategies (`CapabilityStrategy`) and adapters (`UiAdapter`, `RuntimeEnv`).
- **Edge-friendly:** All I/O dependencies are injected via a runtime adapter.
- **TypeScript:** Written in strict TypeScript, targeting `es2020`, ESM by default.

## Project Structure

```
llm-agent/
├─ src/                 ← Source code
│  ├─ types.ts            ← Shared contracts and type definitions
│  ├─ parser.ts           ← Parses ::Task{} / ::Ui{} directives
│  ├─ task-queue.ts       ← Manages task DAG and execution order
│  ├─ executor.ts         ← Delegates tasks to registered strategies
│  ├─ registry.ts         ← Registers and provides capabilities
│  ├─ agent.ts            ← Implements the Reason→Plan→Act→Observe loop
│  ├─ strategies/         ← Built-in capability strategies (callApi, delay, etc.)
│  └─ index.ts            ← Public API (exports)
├─ tests/               ← Unit tests (using Vitest)
│  ├─ parser.test.ts
│  ├─ task-queue.test.ts
│  └─ vitest.config.ts
├─ tsup.config.ts       ← tsup configuration for bundling
└─ package.json         ← Project metadata and dependencies
```

## Core Concepts

### 1. Directives

The agent communicates and plans tasks using special directives embedded in text:

- **`::Task{...}`:** Defines a task to be executed.
  - `id`: Unique identifier for the task.
  - `kind`: The type of capability to use (e.g., 'callApi', 'compute').
  - `params`: Parameters specific to the task kind.
  - `dependsOn`: Optional array of task IDs that must complete before this task can run.
  ```
  Example: "Okay, I will search for flights: ::Task{id:"flightSearch",kind:"callApi",params:{url:"/api/flights",query:"Paris to London"}}"
  ```

- **`::Ui{...}`:** Describes an interactive UI component to be rendered.
  - `id`: Unique identifier for the UI component.
  - `type`: The type of UI component (e.g., 'Map', 'Chart').
  - `props`: Properties for the UI component.
  - `events`: Optional array of event names the UI component can emit.
  ```
  Example: "Here is a map of the location: ::Ui{id:"map1",type:"Map",props:{center:[48.85, 2.35],zoom:12}}"
  ```

### 2. Agent Loop (Reason → Plan → Act → Observe)

The `Agent` class orchestrates the core logic:

1.  **Reason:** The agent receives a user message. It builds a prompt (potentially including system instructions and available capabilities) and sends it to an LLM.
2.  **Plan:** The LLM's response, a string potentially containing `::Task{}` and `::Ui{}` directives, is parsed.
3.  **Act:**
    *   Tasks are added to a `TaskQueue` which respects dependencies.
    *   The `Executor` runs ready tasks by invoking the appropriate `CapabilityStrategy`.
    *   Task results are collected.
4.  **Observe:**
    *   If new task results are available, the agent might form a new prompt including these results and loop back to the **Reason** step to get a refined plan from the LLM.
    *   If no new tasks or significant results, the agent finalizes its response.
    *   UI descriptors are passed to a `UiAdapter` for rendering.

### 3. Capabilities and Strategies

Capabilities define what an agent can *do*. Each capability is implemented as a `CapabilityStrategy`.

- **`CapabilityStrategy<P, R>` Interface:**
  - `kind`: A string identifying the capability (e.g., 'callApi').
  - `run(params: P, env: RuntimeEnv): Promise<R>`: The function that executes the task.
    - `params`: Task-specific parameters.
    - `env`: A `RuntimeEnv` object providing access to edge-safe I/O (like `fetch`, `wait`).

**Example: `CallApiStrategy`**
```typescript
// src/strategies/call-api.ts
import { CapabilityStrategy, Json } from '../types';

export interface CallApiParams {
  url: string;
  method?: string;
  body?: Json;
  headers?: Record<string, string>;
  [k: string]: Json | undefined;
}

export interface CallApiResult {
  status: number;
  json: Json;
  [k: string]: Json | number;
}

export const CallApiStrategy: CapabilityStrategy<CallApiParams, CallApiResult> = {
  kind: 'callApi',
  async run({ url, method = 'GET', body, headers = {} }, env) {
    // ... uses env.fetch ...
    return { status: response.status, json: await response.json() };
  },
};
```

### 4. Runtime Environment (`RuntimeEnv`)

To ensure portability (especially for edge functions), the library does not directly use Node.js-specific APIs like `fs` or `process`. Instead, it relies on a `RuntimeEnv` object passed to strategies.

- **`RuntimeEnv` Interface:**
  - `fetch: typeof fetch;` (required)
  - `wait: (ms: number) => Promise<void>;` (required)
  - Can be extended with other host-provided capabilities (e.g., KV stores, database access).

### 5. UI Adapters (`UiAdapter`)

For rendering UI components (`::Ui{}` directives), an optional `UiAdapter` can be provided to the agent. This adapter is responsible for translating `UiDescriptor` objects into actual UI elements in the host environment.

- **`UiAdapter` Interface:**
  - `mount(desc: UiDescriptor): void;`
  - `update(desc: UiDescriptor): void;`
  - `unmount(id: string): void;`
  - `emit(event: { id: string; name: string; payload: Json }): void;`

## Installation

```bash
npm install llm-agent # or pnpm add / yarn add
```

## Usage

Here's a basic example of how to set up and use the agent:

```typescript
import {
  Agent,
  LLMSession,
  RuntimeEnv,
  UiAdapter,
  UiDescriptor,
  CapabilityStrategy,
  Json // Import Json type if needed for custom strategies or LLMSession
} from 'llm-agent'; // Adjust path if using locally

// 1. Define your LLM Session
// This is how the agent interacts with your chosen Large Language Model.
class MyLLMSession implements LLMSession {
  async generate(prompt: string): Promise<string> {
    // Replace with your actual LLM API call
    console.log("LLM Prompt:", prompt);
    if (prompt.includes("greet")) {
        return "Hello there! ::Task{id:"t1",kind:"delay",params:{ms:100}} How can I help you today? ::Ui{id:"greetCard",type:"InfoCard",props:{message:"Welcome!"}}";
    }
    if (prompt.includes("fetch example")) {
        return "Sure, I will fetch some data. ::Task{id:"t1",kind:"callApi",params:{url:"https://jsonplaceholder.typicode.com/todos/1"}}";
    }
    if (prompt.includes("task results")) { // Simulate LLM reacting to task output
        return "The task was successful. Here is the data: ::Ui{id:"dataDisplay",type:"JsonViewer",props:{data: " + prompt.substring(prompt.indexOf("{"), prompt.lastIndexOf("}")+1) + "}}";
    }
    return "I'm ready to assist!";
  }
}

// 2. Define your Capability Strategies (if you have custom ones)
// The library provides some common strategies like callApi, delay, compute.
import { CallApiStrategy, DelayStrategy, ComputeStrategy } from 'llm-agent/strategies'; // Adjust path

const allStrategies: CapabilityStrategy<any, any>[] = [
  CallApiStrategy,
  DelayStrategy,
  ComputeStrategy,
  // Add your custom strategies here
];

// 3. Define your Runtime Environment (optional, defaults provided for fetch/wait)
const runtimeEnv: RuntimeEnv = {
  fetch: globalThis.fetch.bind(globalThis), // Ensure 'this' context for fetch
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  // Add any other environment-specific functions your strategies might need
  // e.g., accessToKVStore: async (key) => { ... }
};

// 4. Define your UI Adapter (optional)
// This handles how ::Ui{} directives are rendered.
class MyUiAdapter implements UiAdapter {
  mount(desc: UiDescriptor) {
    console.log(`UI Mount: ${desc.type} (id: ${desc.id})`, desc.props);
    // Example: document.getElementById('app').innerHTML += `<div id="${desc.id}">${desc.type}: ${JSON.stringify(desc.props)}</div>`;
  }
  update(desc: UiDescriptor) {
    console.log(`UI Update: ${desc.type} (id: ${desc.id})`, desc.props);
    // Example: document.getElementById(desc.id).textContent = `${desc.type}: ${JSON.stringify(desc.props)}`;
  }
  unmount(id: string) {
    console.log(`UI Unmount: (id: ${id})`);
    // Example: document.getElementById(id)?.remove();
  }
  emit(event: { id: string; name: string; payload: Json }) {
    console.log(`UI Event from ${event.id}: ${event.name}`, event.payload);
    // Handle events emitted by your UI components
  }
}

// 5. Initialize and use the Agent
async function main() {
  const agent = new Agent({
    llm: new MyLLMSession(),
    capabilities: allStrategies,
    uiAdapter: new MyUiAdapter(), // Optional
    systemPrompt: "You are a helpful assistant that can use tools.",
    // runtimeEnv can be passed here too if not provided to Executor directly or if you want to override defaults.
    // For strategies that need specific env properties, ensure they are in the env passed to the Executor,
    // which happens by default if AgentOptions doesn't override opts.capabilities's env.
  });

  // Example 1: Simple greeting with a delay task and a UI card
  console.log("\n--- Example 1: Greeting ---");
  let response = await agent.chat("Please greet me.");
  console.log("Agent Response Text:", response.text);
  console.log("Agent UI Descriptors:", response.ui);
  console.log("Agent Task History:", response.history);

  // Example 2: Fetching data using callApi
  console.log("\n--- Example 2: Fetching Data ---");
  response = await agent.chat("Can you fetch example data?");
  console.log("Agent Response Text:", response.text);
  console.log("Agent UI Descriptors:", response.ui);
  console.log("Agent Task History:", response.history);
  
  // The agent's .chat() method will internally loop if tasks produce results
  // that the LLM should observe and react to.
  // For instance, if the LLM's response to the task result includes more tasks.
}

main().catch(console.error);

```

## Building and Testing

-   **Install dependencies:** `pnpm install`
-   **Build:** `pnpm exec tsup src/index.ts --format esm,cjs --dts --target es2020 --clean`
-   **Run tests:** `pnpm exec vitest run`
    -   Tests run on Node.js by default.
    -   To test in a browser-like environment: `pnpm exec vitest run --browser` (requires browser providers like Playwright or WebDriverIO to be configured in `vitest.config.ts`)

## Public API (`src/index.ts`)

The main exports include:

-   `Agent`: The core class for the RAO loop.
-   `Executor`: Runs tasks using strategies.
-   `TaskQueue`: Manages the task dependency graph.
-   `CapabilityRegistry`: For managing capability strategies.
-   `parseDirectives`: Function to parse `::Task{}` and `::Ui{}`.
-   All types from `src/types.ts` (e.g., `Task`, `UiDescriptor`, `CapabilityStrategy`, `LLMSession`, `RuntimeEnv`, `UiAdapter`).
-   Built-in strategies from `src/strategies/`.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

ISC 