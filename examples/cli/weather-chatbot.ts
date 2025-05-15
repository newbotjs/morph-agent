import { Agent, LLMSession, UiAdapter, UiDescriptor, Json, AgentOptions, RuntimeEnv, CapabilityStrategy, AgentEvent, AgentEndEventData, LLMResponseEventData, ParsedDirectivesEventData, TaskStartEventData, TaskResult, UiDirectiveEventData, ThinkingDirectiveEventData } from '../../src'; // Adjust path if running from outside /examples
import { CallApiStrategy } from '../../src/strategies/call-api'; // More direct import
import OpenAI from 'openai';
import * as readline from 'readline';

/**
 * Implements the LLMSession interface using the OpenAI API.
 * This class is responsible for communicating with the OpenAI model.
 */
class OpenAILLMSession implements LLMSession {
  private openai: OpenAI;
  private model: string;

  /**
   * Creates an instance of OpenAILLMSession.
   * @param apiKey The OpenAI API key.
   * @param model The OpenAI model to use (e.g., 'gpt-3.5-turbo' or 'gpt-4o').
   */
  constructor(apiKey: string, model = 'gpt-4o-mini') {
    if (!apiKey) {
      throw new Error('OpenAI API key is required.');
    }
    this.openai = new OpenAI({ apiKey });
    this.model = model;
  }

  /**
   * Generates a response from the OpenAI model based on the provided prompt.
   * @param prompt The complete prompt string to send to the LLM.
   * @returns A promise that resolves to the LLM's text response.
   * @example
   * ```ts
   * const session = new OpenAILLMSession('YOUR_API_KEY');
   * const response = await session.generate("System: You are a weather bot.\\nUser: What\\'s the weather in London?");
   * console.log(response);
   * ```
   */
  async generate(prompt: string): Promise<string> {
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

/**
 * A simple UI adapter that logs UI component descriptions to the console.
 */
class ConsoleUiAdapter implements UiAdapter {
  mount(desc: UiDescriptor) {
    console.log(`[UI Mount] ID: ${desc.id}, Type: ${desc.type}, Props:`, desc.props);
  }
  update(desc: UiDescriptor) {
    console.log(`[UI Update] ID: ${desc.id}, Type: ${desc.type}, Props:`, desc.props);
  }
  unmount(id: string) {
    console.log(`[UI Unmount] ID: ${id}`);
  }
  emit(event: { id: string; name: string; payload: Json }) {
    console.log(`[UI Event] ID: ${event.id}, Name: ${event.name}, Payload:`, event.payload);
  }
}

// System prompt to guide the LLM
const WEATHER_SYSTEM_PROMPT = `
You are a friendly weather assistant.
Your goal is to provide weather information for a requested city.
When a user asks for the weather, you MUST use the 'callApi' capability to fetch data.
The API endpoint is 'http://goweather.xyz/weather/{CITY_NAME}'. Replace {CITY_NAME} with the actual city name.

**Available Capabilities:**
- ::Task{kind:"callApi", params:{url:"...", method:"GET"}} - Makes a GET request to the specified URL.

**Example Interaction:**
User: What's the weather like in Paris?
Assistant: Sure, I can check the weather for Paris for you. ::Task{id:"fetchWeatherParis",kind:"callApi",params:{url:"http://goweather.xyz/weather/Paris"}}

After the 'callApi' task is executed, you will receive the weather data as a task result.
Your next response should parse this data and present it to the user in a clear, human-readable format.
You can also use a UI directive to display the weather information.

**Example UI Directive for Weather:**
::Ui{id:"weatherDisplay",type:"WeatherCard",props:{"city":"Paris", "temperature":"+10 °C", "wind":"15 km/h", "description":"Sunny", "forecast": [{"day":"1", "temperature":"+12 °C", "wind":"10 km/h"}, ...]}}

Based on the task result, provide the current weather and a brief forecast for the next few days.
If the city is not found or there's an API error, inform the user politely.
`;

// Callback function to handle agent events
const handleAgentEvent = (event: AgentEvent) => {
  console.log(`\n[Agent Event] Type: ${event.type}`);
  switch (event.type) {
    case 'llmResponse':
      console.log("LLM Raw Response:", (event.data as LLMResponseEventData).rawText);
      break;
    case 'parsedDirectives':
      const parsedData = event.data as ParsedDirectivesEventData;
      console.log("Parsed Tasks:", parsedData.tasks.length);
      console.log("Parsed UI Directives:", parsedData.ui.length);
      break;
    case 'taskStart':
      const taskStartData = event.data as TaskStartEventData;
      console.log(`Starting Task: ${taskStartData.task.id} (Kind: ${taskStartData.task.kind})`);
      break;
    case 'taskResult':
      const taskResultData = event.data as TaskResult;
      console.log(`Task Result for ${taskResultData.id} (Status: ${taskResultData.status}):`, taskResultData.output || taskResultData.error);
      break;
    case 'uiDirective':
      const uiData = event.data as UiDirectiveEventData;
      console.log(`UI Directive Received: ${uiData.uiDescriptor.id} (Type: ${uiData.uiDescriptor.type})`);
      // The ConsoleUiAdapter will also log the mount call separately if configured
      break;
    case 'agentEnd':
      const endData = event.data as AgentEndEventData;
      console.log("Agent processing finished.");
      console.log("Final Text:", endData.finalText);
      console.log("Final UI Components:", endData.finalUi.length);
      console.log("Full Task History Count:", endData.history.length);
      break;
    case 'thinkingDirective':
      console.log("Thinking Directive Received:", (event.data as ThinkingDirectiveEventData));
      break;
    default:
      // Exhaustive check for unhandled event types (optional)
      const _exhaustiveCheck: never = event.type;
      console.log("Unknown event type or data:", _exhaustiveCheck, event.data);
  }
};

/**
 * Main function to run the weather chatbot example.
 */
async function runWeatherChatbot() {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    console.error("OPENAI_API_KEY environment variable is not set.");
    console.log("Please set it before running the example: export OPENAI_API_KEY='your_key_here'");
    return;
  }

  const llmSession = new OpenAILLMSession(openaiApiKey, 'gpt-4o-mini'); // Cheaper model for testing
  const capabilities: CapabilityStrategy<any, any>[] = [CallApiStrategy];
  const agentOptions: AgentOptions = {
    llm: llmSession,
    capabilities,
    uiAdapter: new ConsoleUiAdapter(),
    systemPrompt: WEATHER_SYSTEM_PROMPT,
    onEvent: handleAgentEvent, // Register the event handler
  };
  const agent = new Agent(agentOptions);

  console.log("Weather Chatbot Initialized. Type 'quit' to exit.");
  console.log("Example: What is the weather in London?");

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on('line', async (input) => {
    if (input.toLowerCase() === 'quit') {
      rl.close();
      return;
    }
    console.log(`\nUser: ${input}`);
    try {
      // The promise now resolves with AgentEndEventData, but events are streamed via callback
      await agent.chat(input);
      // The final agentEnd event is also emitted via the callback, so direct handling of endResult here is optional
      // console.log("Agent chat promise resolved. Final assistant text (also via event):", endResult.finalText);
    } catch (error) {
      console.error("Error during agent chat:", error);
    }
    rl.prompt();
  });
  rl.prompt();
}

runWeatherChatbot().catch(console.error); 