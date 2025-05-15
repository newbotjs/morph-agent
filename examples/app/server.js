import express from 'express';
import { Agent, CallApiStrategy, ComputeStrategy } from '../../dist/index.js';
import OpenAI from 'openai';

// --- OpenAILLMSession (Copied from weather-chatbot.ts for simplicity) ---
/**
 * Implements the LLMSession interface using the OpenAI API.
 * This class is responsible for communicating with the OpenAI model.
 * @implements {LLMSession}
 */
class OpenAILLMSession {
  openai;
  model;

  /**
   * Creates an instance of OpenAILLMSession.
   * @param {string} apiKey The OpenAI API key.
   * @param {string} [model='gpt-4o-mini'] The OpenAI model to use (e.g., 'gpt-3.5-turbo' or 'gpt-4o-mini').
   */
  constructor(apiKey, model = 'gpt-4o-mini') {
    if (!apiKey) {
      throw new Error('OpenAI API key is required.');
    }
    this.openai = new OpenAI({ apiKey });
    this.model = model;
  }

  /**
   * Generates a response from the OpenAI model based on the provided prompt.
   * @param {string} prompt The complete prompt string to send to the LLM.
   * @returns {Promise<string>} A promise that resolves to the LLM's text response.
   * @example
   * ```js
   * const session = new OpenAILLMSession('YOUR_API_KEY');
   * const response = await session.generate("System: You are a helpful bot.\\nUser: Hello!");
   * console.log(response);
   * ```
   */
  async generate(prompt) {
    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'user', content: prompt },
        ],
      });
      return completion.choices[0]?.message?.content || '';
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      return 'Sorry, I encountered an error trying to connect to the AI model.';
    }
  }
}
// --- End OpenAILLMSession ---

// --- ServerConsoleUiAdapter (Minimal version for server-side logging) ---
/**
 * A simple UI adapter that logs UI component descriptions to the console on the server.
 * This is a placeholder and doesn't interact with the client UI directly.
 * For a real application, you'd have a UiAdapter that sends UI updates to the client.
 * @implements {UiAdapter}
 */
class ServerConsoleUiAdapter {
  /**
   * Logs the mounting of a UI component.
   * @param {UiDescriptor} desc The descriptor of the UI component.
   */
  mount(desc) {
    console.log(`[Server UI Mount] ID: ${desc.id}, Type: ${desc.type}, Props:`, desc.props);
  }
  /**
   * Logs the update of a UI component.
   * @param {UiDescriptor} desc The descriptor of the UI component.
   */
  update(desc) {
    console.log(`[Server UI Update] ID: ${desc.id}, Type: ${desc.type}, Props:`, desc.props);
  }
  /**
   * Logs the unmounting of a UI component.
   * @param {string} id The ID of the UI component.
   */
  unmount(id) {
    console.log(`[Server UI Unmount] ID: ${id}`);
  }
  /**
   * Logs an event emitted from a UI component.
   * @param {{ id: string; name: string; payload: Json }} event The event object.
   */
  emit(event) {
    console.log(`[Server UI Event] ID: ${event.id}, Name: ${event.name}, Payload:`, event.payload);
  }
}
// --- End ServerConsoleUiAdapter ---

const app = express();

app.use(express.json());
app.use(express.static('client'));

const WEATHER_SYSTEM_PROMPT = `
You are a friendly weather assistant.
Your goal is to provide weather information for a requested city.

Use the following format for your response:

\`\`\`Task
{"id":"weather_paris","kind":"callApi","params":{"url":"http://goweather.xyz/weather/{name}"}}
\`\`\`

 Replace {name} with the actual city name.
`;


app.post('/chat', async (req, res) => {
  const { message } = req.body;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  if (!openaiApiKey) {
    return res.status(500).json({ type: 'error', data: { message: "OPENAI_API_KEY environment variable is not set." } });
  }
  if (!message) {
    return res.status(400).json({ type: 'error', data: { message: "Message is required." } });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const llmSession = new OpenAILLMSession(openaiApiKey);
  const capabilities = [CallApiStrategy, ComputeStrategy];

  /**
   * Handles agent events and streams them to the client.
   * @param {AgentEvent} event The agent event.
   */
  const handleAgentEvent = (event) => {
    console.log(`[Agent Event Server] Type: ${event.type}`);
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  const agentOptions = {
    llm: llmSession,
    capabilities,
    uiAdapter: new ServerConsoleUiAdapter(), 
    systemPrompt: WEATHER_SYSTEM_PROMPT,
    onEvent: handleAgentEvent,
  };
  const agent = new Agent(agentOptions);

  try {
    console.log(`User message received: ${message}`);
    await agent.chat(message);
  } catch (error) {
    console.error("Error during agent chat processing:", error);
    res.write(`data: ${JSON.stringify({ type: 'error', data: { message: 'Agent processing error on server' } })}\n\n`);
  } finally {
    res.write(`data: ${JSON.stringify({ type: 'agentEndStream', data: { messageId: Date.now() } })}\n\n`);
  }
});

app.listen(3000, () => {
    console.log('Server is running on port 3000. Client available at http://localhost:3000/');
});