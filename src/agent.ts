import { AgentOptions, TaskResult, UiDescriptor, AgentEvent, AgentEndEventData, LLMResponseEventData, ParsedDirectivesEventData, TaskStartEventData, UiDirectiveEventData, ThinkingDirectiveEventData, ThinkingDirective, HistoryEntry, UserHistoryEntry, AssistantHistoryEntry, ToolHistoryEntry } from './types';
import { parseDirectives } from './parser';
import { TaskQueue } from './task-queue';
import { Executor } from './executor';

/**
 * Agent implementing the Reason → Plan → Act → Observe loop
 * 
 * Coordinates the execution of tasks based on parsed directives from LLM responses,
 * manages UI rendering, and handles the iterative refinement process.
 */
export class Agent {
  private history: HistoryEntry[] = [];
  private executor: Executor;
  private onEvent?: (event: AgentEvent) => void;
  
  /**
   * Create a new agent with the specified options
   * 
   * @param opts - Configuration options for the agent
   */
  constructor(private opts: AgentOptions) {
    this.executor = new Executor(opts.capabilities, {
      fetch: globalThis.fetch,
      wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
      ...(opts.runtimeEnv || {}),
    });
    this.onEvent = opts.onEvent;
  }
  
  private emitEvent(type: AgentEvent['type'], data: AgentEvent['data']) {
    if (this.onEvent) {
      this.onEvent({ type, data } as AgentEvent);
    }
  }
  
  /**
   * Process a user message through a complete RAO cycle
   * 
   * @param initialInput - The initial input, either a string or an array of history entries
   * @returns An object containing the final history, text response, and UI components
   * @example
   * ```ts
   * const agent = new Agent({ llm: openAI, capabilities: [...strategies] });
   * const response = await agent.chat("Show me flight options to Paris ::Task{...}");
   * console.log(response.finalText);  // The LLM's reply text, including ::Task{} directives
   * // response.finalUi contains UI components to render
   * // response.history contains the full interaction log
   * ```
   */
  async chat(initialInput: string | HistoryEntry[]): Promise<AgentEndEventData> {
    if (typeof initialInput === 'string') {
      this.history = [{ role: 'user', content: initialInput, timestamp: Date.now() } as UserHistoryEntry];
    } else {
      this.history = [...initialInput]; // Use the provided history directly
    }
    
    let currentTextResponse = "";
    let accumulatedUi: UiDescriptor[] = [];
    
    const initialPrompt = this.buildPrompt();
    let llmResponse = await this.opts.llm.generate(initialPrompt);
    currentTextResponse = llmResponse;
    this.history.push({ role: 'assistant', content: llmResponse, timestamp: Date.now() } as AssistantHistoryEntry);
    this.emitEvent('llmResponse', { rawText: llmResponse } as LLMResponseEventData);
    
    let parsed = parseDirectives(llmResponse);
    this.emitEvent('parsedDirectives', { 
      tasks: parsed.tasks, 
      ui: parsed.ui,
      thinkingDirective: parsed.thinkingDirective,
      rawText: llmResponse 
    } as ParsedDirectivesEventData);
    
    parsed.ui.forEach(desc => {
      this.emitEvent('uiDirective', { uiDescriptor: desc } as UiDirectiveEventData);
      accumulatedUi.push(desc); 
    });
    
    if (parsed.thinkingDirective) {
      await this.processThinkingDirective(parsed.thinkingDirective, accumulatedUi);
    } else {
      await this.processRegularTasks(parsed.tasks, accumulatedUi);
    }

    if (this.opts.uiAdapter) {
      accumulatedUi.forEach(desc => this.opts.uiAdapter!.mount(desc));
    }
    
    const endData: AgentEndEventData = {
      history: this.history
    };
    this.emitEvent('agentEnd', endData);
    return endData;
  }

  /**
   * Process tasks from a Thinking directive sequentially
   * 
   * @param thinkingDirective - The thinking directive to process
   * @param accumulatedUi - UI components accumulated during processing
   * @private
   */
  private async processThinkingDirective(
    thinkingDirective: ThinkingDirective,
    accumulatedUi: UiDescriptor[]
  ): Promise<void> {
    this.emitEvent('thinkingDirective', { directive: thinkingDirective } as ThinkingDirectiveEventData);
    
    let currentThinkingTasks = [...thinkingDirective.tasks];
    let iterationCount = 0;
    const maxIterations = 10;
    
    while (currentThinkingTasks.length > 0 && iterationCount < maxIterations) {
      iterationCount++;
      
      const task = currentThinkingTasks.shift();
      if (!task) break;
      
      this.emitEvent('taskStart', { task } as TaskStartEventData);
      const result = await this.executor.runTask(task);
      this.history.push({ 
        role: 'tool', 
        id: result.id, 
        status: result.status, 
        output: result.output, 
        error: result.error,
        timestamp: Date.now()
      } as ToolHistoryEntry);
      this.emitEvent('taskResult', result);
      
      const observePrompt = this.buildPrompt();
      const llmResponse = await this.opts.llm.generate(observePrompt);
      this.history.push({ role: 'assistant', content: llmResponse, timestamp: Date.now() } as AssistantHistoryEntry);
      this.emitEvent('llmResponse', { rawText: llmResponse } as LLMResponseEventData);
      
      const refinedParsed = parseDirectives(llmResponse);
      this.emitEvent('parsedDirectives', { 
        tasks: refinedParsed.tasks, 
        ui: refinedParsed.ui,
        thinkingDirective: refinedParsed.thinkingDirective,
        rawText: llmResponse 
      } as ParsedDirectivesEventData);
      
      refinedParsed.ui.forEach(desc => {
        this.emitEvent('uiDirective', { uiDescriptor: desc } as UiDirectiveEventData);
        if (!accumulatedUi.find(existing => existing.id === desc.id)) {
          accumulatedUi.push(desc);
        }
      });
      
      if (refinedParsed.thinkingDirective) {
        currentThinkingTasks = refinedParsed.thinkingDirective.tasks;
        this.emitEvent('thinkingDirective', { 
          directive: refinedParsed.thinkingDirective 
        } as ThinkingDirectiveEventData);
      } else if (refinedParsed.tasks.length > 0) {
        await this.processRegularTasks(refinedParsed.tasks, accumulatedUi);
        break; 
      }
    }
    
    if (iterationCount >= maxIterations) {
      console.warn(`Thinking directive reached maximum iterations (${maxIterations}).`);
    }
  }
  
  /**
   * Process regular tasks with dependencies
   * 
   * @param tasks - The tasks to process
   * @param accumulatedUi - UI components accumulated during processing
   * @private
   */
  private async processRegularTasks(
    tasks: Array<any>, 
    accumulatedUi: UiDescriptor[]
  ): Promise<void> {
    const taskQueue = new TaskQueue();
    taskQueue.addMany(tasks);

    let iterationCount = 0;
    const maxIterations = 5;
    
    while (iterationCount < maxIterations) {
      iterationCount++;
      let tasksExecutedInThisIteration = 0;
      let newResultsForHistory: TaskResult[] = [];

      while (true) {
        const task = taskQueue.nextReady();
        if (!task) break; 
        this.emitEvent('taskStart', { task } as TaskStartEventData);
        const result = await this.executor.runTask(task);
        taskQueue.complete(result); 
        newResultsForHistory.push(result); 
        this.emitEvent('taskResult', result);

        tasksExecutedInThisIteration++;
      }

      newResultsForHistory.forEach(result => {
        this.history.push({
          role: 'tool',
          id: result.id,
          status: result.status,
          output: result.output,
          error: result.error,
          timestamp: Date.now()
        } as ToolHistoryEntry);
        result._observed = true; 
      });

      if (taskQueue.isFinished()) {
        if (newResultsForHistory.length > 0) {
          const observePrompt = this.buildPrompt();
          const llmResponse = await this.opts.llm.generate(observePrompt);
          this.history.push({ role: 'assistant', content: llmResponse, timestamp: Date.now() } as AssistantHistoryEntry);
          this.emitEvent('llmResponse', { rawText: llmResponse } as LLMResponseEventData);
            
          const refinedParsed = parseDirectives(llmResponse);
          this.emitEvent('parsedDirectives', { 
            tasks: refinedParsed.tasks, 
            ui: refinedParsed.ui,
            thinkingDirective: refinedParsed.thinkingDirective,
            rawText: llmResponse 
          } as ParsedDirectivesEventData);
            
          refinedParsed.ui.forEach(desc => {
            this.emitEvent('uiDirective', { uiDescriptor: desc } as UiDirectiveEventData);
            if (!accumulatedUi.find(existing => existing.id === desc.id)) {
              accumulatedUi.push(desc);
            }
          });
            
          if (refinedParsed.thinkingDirective) {
            await this.processThinkingDirective(refinedParsed.thinkingDirective, accumulatedUi);
            break;
          } else if (refinedParsed.tasks.length > 0) {
            taskQueue.addMany(refinedParsed.tasks);
            continue;
          } else {
            break;
          }
        } else {
          break;
        }
      } else if (tasksExecutedInThisIteration === 0) {
        console.warn("Agent loop stalled: No tasks ready and queue not finished. Breaking.");
        break;
      }
    }

    if(iterationCount >= maxIterations) {
        console.warn(`Agent reached maximum iterations (${maxIterations}).`);
    }
  }
  
  /**
   * Build a prompt for the LLM based on the current interaction history.
   * 
   * This method constructs a prompt string that includes:
   * - The system prompt (if provided in agent options).
   * - A list of available capabilities and their signatures.
   * - The defined formats for Task, UI, and Thinking directives.
   * - The sequence of messages from the history (user, assistant, tool observations).
   * - An "Assistant:" suffix to prompt the LLM for its next response.
   * 
   * @returns The constructed prompt string.
   * @private
   */
  private buildPrompt(): string {
    let prompt = '';
    if (this.opts.systemPrompt) {
      prompt += `System: ${this.opts.systemPrompt}\n\n`;
    }
    
    prompt += "Capabilities (for use with the 'Task' directive):\n";
    if (!this.opts.capabilities || this.opts.capabilities.length === 0) {
      prompt += "- No capabilities are currently available.\n";
    } else {
      for (const capability of this.opts.capabilities) {
        prompt += `- ${capability.kind}: ${capability.description}. Use the following signature: ${capability.signature}\n`;
      }
    }
    
    prompt += "\nDirective formats to use in your response:\n";
    prompt += "1. To execute a capability:\n"
    prompt += "```Task\n{\"id\":\"unique_id\",\"kind\":\"capability_name\",\"params\":{/* JSON_parameters */},\"dependsOn\":[\"other_task_id\"]}\n```\n";
    prompt += "   (Replace 'capability_name' with one of the kinds listed under 'Capabilities'.)\n";
    prompt += "2. To render a UI component:\n"
    prompt += "```Ui\n{\"id\":\"unique_ui_id\",\"type\":\"ComponentType\",\"props\":{/* JSON_props */}}\n```\n";
    prompt += "3. To define a multi-step plan:\n"
    prompt += "```Thinking\n{\"tasks\":[{\"id\":\"task1\",\"kind\":\"capability_name\",\"params\":{...}}, ...]}\n```\n";

    prompt += 'You can add text to the response to explain your thinking or to provide additional context.'

    prompt += "\nInteraction History:\n";
    for (const entry of this.history) {
      switch (entry.role) {
        case 'user':
          prompt += `User: ${entry.content}\n`;
          break;
        case 'assistant':
          prompt += `Assistant: ${entry.content}\n`;
          break;
        case 'tool':
          const toolEntry = entry as ToolHistoryEntry;
          prompt += `Tool Observation (Task ID: ${toolEntry.id}, Status: ${toolEntry.status}): `;
          if (toolEntry.status === 'ok') {
            prompt += `${JSON.stringify(toolEntry.output)}\n`;
          } else {
            prompt += `Error: ${toolEntry.error}\n`;
          }
          break;
      }
    }
    
    prompt += `\nAssistant:`;
    return prompt;
  }
} 