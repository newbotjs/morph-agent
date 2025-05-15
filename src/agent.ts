import { AgentOptions, TaskResult, UiDescriptor, AgentEvent, AgentEndEventData, LLMResponseEventData, ParsedDirectivesEventData, TaskStartEventData, UiDirectiveEventData, ThinkingDirectiveEventData, ThinkingDirective } from './types';
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
  private history: TaskResult[] = [];
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
      ...(opts.runtimeEnv || {}), // Allow overriding default fetch/wait and adding custom env properties
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
   * @param userMsg - The user's message input
   * @returns An object containing the text response (with original directives), UI components, and task history
   * @example
   * ```ts
   * const agent = new Agent({ llm: openAI, capabilities: [...strategies] });
   * const response = await agent.chat("Show me flight options to Paris ::Task{...}");
   * console.log(response.text);  // The LLM's reply text, including ::Task{} directives
   * // response.ui contains UI components to render
   * ```
   */
  async chat(userMsg: string): Promise<AgentEndEventData> {
    this.history = [];
    let currentTextResponse = "";
    let accumulatedUi: UiDescriptor[] = [];
    
    const initialPrompt = this.buildPrompt(userMsg);
    let llmResponse = await this.opts.llm.generate(initialPrompt);
    currentTextResponse = llmResponse;
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
    
    // Handle thinking directive if present
    if (parsed.thinkingDirective) {
      await this.processThinkingDirective(parsed.thinkingDirective, userMsg, accumulatedUi);
    } else {
      // Standard task processing flow
      await this.processRegularTasks(parsed.tasks, userMsg, accumulatedUi);
    }

    if (this.opts.uiAdapter) {
      accumulatedUi.forEach(desc => this.opts.uiAdapter!.mount(desc));
    }
    
    const endData: AgentEndEventData = {
      history: this.history,
      finalText: currentTextResponse,
      finalUi: accumulatedUi
    };
    this.emitEvent('agentEnd', endData);
    return endData;
  }

  /**
   * Process tasks from a Thinking directive sequentially
   * 
   * @param thinkingDirective - The thinking directive to process
   * @param userMsg - The original user message
   * @param accumulatedUi - UI components accumulated during processing
   * @private
   */
  private async processThinkingDirective(
    thinkingDirective: ThinkingDirective,
    userMsg: string,
    accumulatedUi: UiDescriptor[]
  ): Promise<void> {
    this.emitEvent('thinkingDirective', { directive: thinkingDirective } as ThinkingDirectiveEventData);
    
    let currentThinkingTasks = [...thinkingDirective.tasks];
    let iterationCount = 0;
    const maxIterations = 10; // Maximum number of thinking iterations
    
    while (currentThinkingTasks.length > 0 && iterationCount < maxIterations) {
      iterationCount++;
      
      // Get first task from the thinking plan
      const task = currentThinkingTasks.shift();
      if (!task) break;
      
      // Execute the task directly without creating a new TaskQueue instance
      this.emitEvent('taskStart', { task } as TaskStartEventData);
      const result = await this.executor.runTask(task);
      this.history.push(result);
      this.emitEvent('taskResult', result);
      
      // Re-prompt LLM with the result of the task
      const observePrompt = this.buildPrompt(userMsg, true, [result]);
      const llmResponse = await this.opts.llm.generate(observePrompt);
      this.emitEvent('llmResponse', { rawText: llmResponse } as LLMResponseEventData);
      
      // Parse the new response for directives
      const refinedParsed = parseDirectives(llmResponse);
      this.emitEvent('parsedDirectives', { 
        tasks: refinedParsed.tasks, 
        ui: refinedParsed.ui,
        thinkingDirective: refinedParsed.thinkingDirective,
        rawText: llmResponse 
      } as ParsedDirectivesEventData);
      
      // Process any new UI directives
      refinedParsed.ui.forEach(desc => {
        this.emitEvent('uiDirective', { uiDescriptor: desc } as UiDirectiveEventData);
        if (!accumulatedUi.find(existing => existing.id === desc.id)) {
          accumulatedUi.push(desc);
        }
      });
      
      // Check if a new thinking directive is provided
      if (refinedParsed.thinkingDirective) {
        // Replace remaining tasks with the new plan
        currentThinkingTasks = refinedParsed.thinkingDirective.tasks;
        this.emitEvent('thinkingDirective', { 
          directive: refinedParsed.thinkingDirective 
        } as ThinkingDirectiveEventData);
      } else if (refinedParsed.tasks.length > 0) {
        // Process any regular tasks received
        await this.processRegularTasks(refinedParsed.tasks, userMsg, accumulatedUi);
        break; // Exit thinking mode after processing regular tasks
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
   * @param userMsg - The original user message
   * @param accumulatedUi - UI components accumulated during processing
   * @private
   */
  private async processRegularTasks(
    tasks: Array<any>, 
    userMsg: string,
    accumulatedUi: UiDescriptor[]
  ): Promise<void> {
    const taskQueue = new TaskQueue();
    taskQueue.addMany(tasks);

    let iterationCount = 0;
    const maxIterations = 5;
    
    while (iterationCount < maxIterations) {
      iterationCount++;
      let tasksExecutedInThisIteration = 0;
      let newResultsForObservation: TaskResult[] = [];

      while (true) {
        const task = taskQueue.nextReady();
        if (!task) break; 
        this.emitEvent('taskStart', { task } as TaskStartEventData);
        const result = await this.executor.runTask(task);
        taskQueue.complete(result);
        this.history.push(result);
        this.emitEvent('taskResult', result);

        if (result.status === 'ok') {
          newResultsForObservation.push(result);
        }
        tasksExecutedInThisIteration++;
      }


      if (taskQueue.isFinished()) {
        if (newResultsForObservation.length > 0) {
          const unobservedResults = newResultsForObservation.filter(r => !r._observed);
          if (unobservedResults.length === 0 && tasksExecutedInThisIteration > 0) {
            break;
          }
          unobservedResults.forEach(r => r._observed = true);

          if (unobservedResults.length > 0) {
            const observePrompt = this.buildPrompt(userMsg, true, this.history);
            const llmResponse = await this.opts.llm.generate(observePrompt);
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
            
            // Check if a thinking directive was returned
            if (refinedParsed.thinkingDirective) {
              await this.processThinkingDirective(refinedParsed.thinkingDirective, userMsg, accumulatedUi);
              break;
            } else if (refinedParsed.tasks.length > 0) {
              taskQueue.addMany(refinedParsed.tasks);
              newResultsForObservation = []; 
              continue;
            } else {
              break;
            }
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
   * Build a prompt for the LLM based on user input and task history
   * 
   * @param userMsg - The user's message input
   * @param includeResults - Whether to include task results in the prompt
   * @param resultsToInclude - Specific results to include in the prompt
   * @returns The constructed prompt string
   * @private
   */
  private buildPrompt(userMsg: string, includeResults = false, resultsToInclude?: TaskResult[]): string {
    let prompt = '';
    if (this.opts.systemPrompt) {
      prompt += `System: ${this.opts.systemPrompt}\n\n`;
    }
    
    prompt += "Capabilities (for use with the 'Task' directive):\n";
    if (!this.opts.capabilities || this.opts.capabilities.length === 0) {
      prompt += "- No capabilities are currently available.\n";
    } else {
      for (const capability of this.opts.capabilities) {
        const capDesc = (capability as any).description || `The '${capability.kind}' capability. Provide necessary parameters in the 'params' field of the Task directive.`;
        prompt += `- ${capability.kind}: ${capDesc}. Use the following signature: ${capability.signature}\n`;
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

    if (includeResults && resultsToInclude && resultsToInclude.length > 0) {
      prompt += "\nPrevious Task Results (for your observation):\n";
      for (const result of resultsToInclude) {
        prompt += `- Task ${result.id} (${result.status}): ${result.status === 'ok' ? JSON.stringify(result.output) : result.error}\n`;
      }
      prompt += "\nBased on these results, provide your next set of actions or final response. You can use ::Task, ::Ui, or ::Thinking directives.\n";
    }
    
    prompt += `\nUser: ${userMsg}\n\nAssistant:`;
    return prompt;
  }
} 