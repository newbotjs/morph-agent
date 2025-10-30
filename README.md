# UI Inference Router

A TypeScript library that uses LLM inference to route natural language user prompts to UI components with extracted props. Perfect for building conversational interfaces where users describe what they want to see or do.

## Features

- 🧠 **LLM-Powered Routing**: Uses OpenAI to infer user intent and map to UI components
- 🔄 **Stateful Context**: Maintains headers (currentPath, method, locale) and entity memory across turns
- 🎯 **Auto Navigation**: Automatically suggests route changes based on component contexts
- 💾 **Memory Persistence**: Remembers entities (eventId, title, dates, etc.) between conversations
- 📝 **TypeScript Support**: Full type definitions for better development experience
- ⚡ **No Validation**: Pure inference - no validation overhead, just prediction

## Installation

```bash
npm install morph-agent
# or
yarn add morph-agent
# or
pnpm add morph-agent
```

**Requirements:**
- Node.js 18+ or any modern JavaScript runtime
- OpenAI API key (set `OPENAI_API_KEY` environment variable or pass via config)

## Quick Start

```typescript
import { createUiInferRouter } from 'morph-agent';

// 1. Define your UI components
const components = [
  {
    id: 'EventDetailView',
    description: 'Shows event details',
    properties: [
      {
        name: 'eventId',
        type: 'string',
        description: 'Event ID',
        required: true,
        examples: ['123', 'event-456']
      }
    ],
    contexts: [{ currentPath: 'event/123', methods: ['GET'] }]
  },
  {
    id: 'EventCreateForm',
    description: 'Form to create a new event',
    properties: [
      {
        name: 'title',
        type: 'string',
        description: 'Event title',
        required: true
      },
      {
        name: 'start',
        type: 'string',
        description: 'Start date in ISO 8601 format',
        required: true
      }
    ],
    contexts: [{ currentPath: 'event', methods: ['POST'] }]
  }
];

// 2. Create router instance
const router = createUiInferRouter({
  model: 'gpt-5-nano',
  components,
  componentDefault: 'HelpCard',
  timezone: 'Europe/Paris'
});

// 3. Route user prompts
const result = await router.route({ 
  prompt: 'Show me event 123' 
});

console.log(result);
// {
//   componentId: 'EventDetailView',
//   props: { eventId: '123' },
//   message: 'Showing event details',
//   suggestedHeaders: { currentPath: 'event/123', method: 'GET' }
// }
```

## Core Concepts

### Components

Components define your UI elements with their properties and routing contexts:

```typescript
interface Component {
  id: string;                    // Unique component identifier
  version?: string;               // Component version
  description?: string;           // What this component does
  properties?: ComponentProperty[]; // Props the component accepts
  contexts?: Array<{              // Routing contexts
    currentPath?: string;
    methods?: string[];
  }>;
  defaultPath?: string;           // Auto-switch path when selected
  defaultMethod?: string;         // Auto-switch method when selected
}
```

**Example:**
```typescript
{
  id: 'EventDetailView',
  description: 'Displays details of a specific event',
  properties: [
    {
      name: 'eventId',
      type: 'string',
      description: 'Unique event identifier',
      required: true,
      examples: ['46792', 'event-123']
    },
    {
      name: 'title',
      type: 'string',
      description: 'Event title',
      required: true
    },
    {
      name: 'start',
      type: 'string',
      description: 'Start date and time in ISO 8601 format',
      required: true,
      examples: ['2025-10-30T15:00:00+01:00']
    }
  ],
  contexts: [
    { currentPath: 'event/46792', methods: ['GET'] }
  ]
}
```

### Headers (Routing Context)

Headers represent the current routing state and are automatically updated based on component selection:

```typescript
{
  currentPath: 'event/123',  // Current route/path
  method: 'GET',             // HTTP method (GET, POST, PUT, DELETE)
  locale: 'fr-FR'            // Locale/language
}
```

Headers are managed automatically:
- **Priority 1**: `suggestedHeaders` from LLM response
- **Priority 2**: Extracted from component `contexts`
- **Priority 3**: Component `defaultPath`/`defaultMethod`

### Entity Memory

The router maintains a lightweight memory of entities extracted from props:
- Automatically remembers: `eventId`, `title`, `start`, `attendees`, `durationMinutes`
- Used to fill missing information in subsequent prompts
- Persists across conversation turns

### Conversation History

Each turn is stored with headers and deltas for context:

```typescript
interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  headers?: {
    currentPath?: string | null;
    method?: string | null;
    locale?: string;
  };
  headersDelta?: {
    changedKeys: string[];
    previous: { [k: string]: any };
    current: { [k: string]: any };
  };
}
```

## API Reference

### `createUiInferRouter(config?)`

Creates a new router instance.

**Configuration:**

```typescript
interface UiInferRouterConfig {
  model?: string;                    // OpenAI model (default: 'gpt-5-nano')
  apiKey?: string;                   // OpenAI API key (default: process.env.OPENAI_API_KEY)
  timezone?: string;                 // Server timezone (default: 'UTC')
  components?: Component[];          // Available UI components
  componentDefault?: string;          // Fallback component (default: 'DisambiguationCard')
  systemInstruction?: string;         // Custom system instruction
  initialHistory?: ConversationTurn[]; // Initial conversation history
}
```

**Returns:** `UiInferRouter` instance

### Router Methods

#### `route({ prompt })`

Routes a user prompt to a component using LLM inference.

```typescript
const result = await router.route({ 
  prompt: 'Create a meeting tomorrow at 9am' 
});
```

**Returns:** `RouterResponse`
```typescript
{
  componentId: string;        // Selected component ID
  props: Record<string, any>; // Extracted props
  message?: string;          // Natural language explanation
  suggestedHeaders?: {       // Suggested route changes
    currentPath?: string;
    method?: string;
    locale?: string;
  };
}
```

#### `setHeaders(partial)`

Manually set routing headers.

```typescript
router.setHeaders({ 
  currentPath: 'event/123', 
  method: 'GET',
  locale: 'en-US' 
});
```

#### `getHeaders()`

Get current routing headers.

```typescript
const headers = router.getHeaders();
// { currentPath: 'event/123', method: 'GET', locale: 'fr-FR' }
```

#### `clearHeaders()`

Reset headers to default values.

```typescript
router.clearHeaders();
```

#### `getMemory()`

Get current entity memory.

```typescript
const memory = router.getMemory();
// { eventId: '123', title: 'Meeting', start: '2025-01-01T10:00:00Z' }
```

#### `clearMemory()`

Clear entity memory.

```typescript
router.clearMemory();
```

#### `getHistory()`

Get conversation history.

```typescript
const history = router.getHistory();
// Array of ConversationTurn objects
```

#### `addToHistory(turn)`

Manually add a turn to history.

```typescript
router.addToHistory({
  role: 'user',
  content: 'Hello',
  timestamp: new Date().toISOString()
});
```

#### `clearHistory()`

Clear conversation history.

```typescript
router.clearHistory();
```

#### `getLastHeadersDelta()`

Get the last headers delta (what changed in headers).

```typescript
const delta = router.getLastHeadersDelta();
// {
//   changedKeys: ['currentPath'],
//   previous: { currentPath: 'event/123' },
//   current: { currentPath: 'event/456' }
// }
```

## Usage Examples

### Basic Component Routing

```typescript
import { createUiInferRouter } from 'morph-agent';

const router = createUiInferRouter({
  components: [
    {
      id: 'MainPage',
      description: 'Main application page',
      contexts: [{ currentPath: 'main', methods: ['GET'] }]
    },
    {
      id: 'EventListView',
      description: 'List of events',
      properties: [
        {
          name: 'filter',
          type: 'object',
          description: 'Filter criteria',
          examples: [{ today: true }, { date: '2025-01-27' }]
        }
      ],
      contexts: [{ currentPath: 'event', methods: ['GET'] }]
    }
  ]
});

// Route to main page
const result1 = await router.route({ prompt: 'Go to homepage' });
// { componentId: 'MainPage', props: {}, suggestedHeaders: { currentPath: 'main' } }

// List today's events
const result2 = await router.route({ prompt: 'Show me today\'s events' });
// { componentId: 'EventListView', props: { filter: { today: true } } }
```

### Memory Persistence

```typescript
// First turn: user mentions event 123
await router.route({ prompt: 'Show event 123' });
// Headers updated to: { currentPath: 'event/123', method: 'GET' }
// Memory: { eventId: '123' }

// Second turn: user refers to "it" - router uses memory
await router.route({ prompt: 'What time does it start?' });
// Router uses memory.eventId = '123' from previous turn
// Props include: { eventId: '123', start: ... }
```

### Manual Header Management

```typescript
// Set initial context
router.setHeaders({ 
  currentPath: 'event', 
  method: 'POST',
  locale: 'fr-FR' 
});

// Route with context
const result = await router.route({ 
  prompt: 'Create a meeting tomorrow' 
});
// Router knows we're in POST context, suggests EventCreateForm
```

### Conversation with History

```typescript
const router = createUiInferRouter({
  components: [...],
  initialHistory: [
    {
      role: 'user',
      content: 'Hello, I want to create an event',
      headers: { currentPath: 'event', method: 'POST' }
    },
    {
      role: 'assistant',
      content: '{"componentId":"EventCreateForm","props":{}}',
      headers: { currentPath: 'event', method: 'POST' }
    }
  ]
});

// Continue conversation with context
const result = await router.route({ 
  prompt: 'Make it tomorrow at 2pm' 
});
// Router understands "it" refers to the event being created
```

### Advanced Component Definition

```typescript
const components = [
  {
    id: 'EventEditor',
    version: '1.1.0',
    description: 'Edit an existing event',
    properties: [
      {
        name: 'eventId',
        type: 'string',
        description: 'Event ID to edit',
        required: true
      },
      {
        name: 'title',
        type: 'string',
        description: 'New title',
        required: false
      },
      {
        name: 'durationMinutes',
        type: 'number',
        description: 'Duration in minutes',
        required: false,
        examples: [60, 90, 120]
      }
    ],
    contexts: [
      { currentPath: 'event/123', methods: ['PUT', 'PATCH'] }
    ]
  }
];
```

### Complex Array Properties with Schemas

For array properties with complex object structures, use `itemSchema` to provide detailed schema information to the LLM:

```typescript
import { generateArrayItemDescription } from 'morph-agent';
import type { ArrayItemSchema } from 'morph-agent';

// Define your item schema metadata
const blockItemSchema: ArrayItemSchema = {
  availableTypes: [
    {
      type: 'show_text',
      label: 'Show Text',
      description: 'Display a message dialog',
      schema: {
        type: 'object',
        properties: {
          text: { type: 'string', title: 'Message Text' },
          speaker: { type: 'string', title: 'Speaker Name' },
          position: { 
            type: 'string', 
            enum: ['top', 'middle', 'bottom'],
            default: 'bottom'
          }
        },
        required: ['text']
      }
    },
    {
      type: 'set_variable',
      label: 'Set Variable',
      description: 'Set a game variable',
      schema: {
        type: 'object',
        properties: {
          variableId: { type: 'string', title: 'Variable ID' },
          operation: { 
            type: 'string', 
            enum: ['set', 'add', 'subtract'],
            default: 'set'
          },
          value: { type: 'string', title: 'Value' }
        },
        required: ['variableId', 'value']
      }
    }
  ],
  itemStructure: {
    requiredFields: ['id', 'type', 'data'],
    optionalFields: ['level']
  },
  examples: [
    {
      id: 'block_1',
      type: 'show_text',
      data: { text: 'Welcome!', position: 'bottom' },
      level: 0
    },
    {
      id: 'block_2',
      type: 'set_variable',
      data: { variableId: 'gold', operation: 'add', value: '100' },
      level: 0
    }
  ]
};

// Use in component definition
const components = [
  {
    id: 'GenerateBlocks',
    description: 'Generate blocks based on description',
    properties: [
      {
        name: 'blocks',
        type: 'array',
        description: 'Array of block instances',
        required: true,
        itemSchema: blockItemSchema
      }
    ]
  }
];
```

The router automatically generates a detailed description from `itemSchema` that includes:
- Item structure requirements (required/optional fields)
- Available types with their schemas
- Examples
- Critical rules for generating valid items

**Helper Function:**

You can also use `generateArrayItemDescription` directly to create descriptions:

```typescript
import { generateArrayItemDescription } from 'morph-agent';

const property = {
  name: 'blocks',
  type: 'array',
  description: 'Array of blocks',
  itemSchema: blockItemSchema
};

const detailedDescription = generateArrayItemDescription(property);
// Returns comprehensive description with schemas, examples, and rules
```

## How It Works

1. **User sends prompt** → `router.route({ prompt: '...' })`
2. **Router prepares context** → Headers, memory, history, components
3. **LLM inference** → OpenAI analyzes prompt and context
4. **Component selection** → LLM chooses best matching component
5. **Props extraction** → LLM extracts values from prompt
6. **Headers update** → Router updates headers based on component contexts
7. **Memory update** → Important props stored for next turn
8. **History update** → Turn added to conversation history
9. **Response returned** → Component ID + props ready for frontend

## Testing

The library includes comprehensive tests with mocked OpenAI:

```bash
npm test
```

Example test:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createUiInferRouter } from '../src/router.js';

// OpenAI is automatically mocked in tests
describe('Router', () => {
  it('should route to correct component', async () => {
    const router = createUiInferRouter({
      components: [{ id: 'MainPage' }]
    });
    
    const result = await router.route({ prompt: 'homepage' });
    expect(result.componentId).toBe('MainPage');
  });
});
```

## Examples

See the `/examples` directory for complete implementations:

- `cli/event.js`: Full event management example with multiple components

## TypeScript Support

Full TypeScript definitions are included:

```typescript
import type {
  ArrayItemSchema,
  Component,
  ComponentProperty,
  ConversationTurn,
  RouterResponse,
  UiInferRouter,
  UiInferRouterConfig
} from 'morph-agent';
import { generateArrayItemDescription } from 'morph-agent';
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
