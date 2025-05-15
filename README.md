# LLM Agent Library

A minimalist, portable JavaScript/TypeScript library for building tooled LLM agents.

## Features

- 🚀 **Lightweight & Portable**: Built in TypeScript, works in any JavaScript environment
- 🔧 **Extensible Capabilities**: Add custom tools and abilities to your agent
- 🎯 **LLM Agnostic**: Works with any LLM provider (OpenAI, Anthropic, etc.)
- 🎨 **UI Framework Independent**: Implement your own UI adapter for any frontend
- 📝 **Strong Typing**: Full TypeScript support for better development experience

## Installation

```bash
npm install morph-agent
# or
yarn add morph-agent
# or
pnpm add morph-agent
```

## Quick Start

Here's a simple example of creating a weather chatbot:

```typescript
import { Agent, LLMSession, UiAdapter } from 'morph-agent';
import { CallApiStrategy } from 'llm-agent/strategies';

// 1. Implement LLMSession for your chosen LLM provider
class MyLLMSession implements LLMSession {
  async generate(prompt: string): Promise<string> {
    // Implement your LLM call here
    return 'LLM response';
  }
}

// 3. Create and configure your agent
const agent = new Agent({
  llm: new MyLLMSession(),
  capabilities: [CallApiStrategy],
  systemPrompt: 'You are a helpful assistant...',
  onEvent: (event) => console.log('Agent event:', event),
});

// 4. Start chatting!
await agent.chat('Hello!');
```

## Core Concepts

### LLM Session

The `LLMSession` interface is your connection to the Language Model:

```typescript
interface LLMSession {
  generate(prompt: string): Promise<string>;
}
```

Example implementation for OpenAI:

```typescript
import OpenAI from 'openai';

class OpenAILLMSession implements LLMSession {
  constructor(apiKey: string, model = 'gpt-4') {
    this.openai = new OpenAI({ apiKey });
    this.model = model;
  }

  async generate(prompt: string): Promise<string> {
    const completion = await this.openai.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
    });
    return completion.choices[0]?.message?.content || '';
  }
}
```


### Capability Strategies

Capabilities are tools that your agent can use. Built-in strategies include:

- `CallApiStrategy`: Make HTTP requests
- More coming soon!

Create custom capabilities:

```typescript
class MyCustomStrategy implements CapabilityStrategy {
  kind = 'myCustomAction';
  description = 'My custom action';
  signature = '{"param1": "string", "param2": "number"}';
  
  async execute(task: Task): Promise<TaskResult> {
    // Implement your custom capability
    return {
      id: task.id,
      status: 'success',
      output: 'Result',
    };
  }
}
```

### Agent Events

Monitor your agent's actions through events:

```typescript
agent.options.onEvent = (event: AgentEvent) => {
  switch (event.type) {
    case 'llmResponse':
      console.log('LLM said:', event.data.rawText);
      break;
    case 'taskStart':
      console.log('Starting task:', event.data.task.kind);
      break;
    case 'taskResult':
      console.log('Task result:', event.data.output);
      break;
    // ... handle other events
  }
};
```

## Examples

Check out the `/examples` directory for complete implementations:

- `cli/weather-chatbot.ts`: A command-line weather information bot
- More examples coming soon!

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
