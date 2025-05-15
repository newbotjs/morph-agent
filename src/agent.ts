import { AgentOptions, TaskResult, UiDescriptor, AgentEvent, AgentEndEventData, LLMResponseEventData, ParsedDirectivesEventData, TaskStartEventData, UiDirectiveEventData } from './types';
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
    this.emitEvent('parsedDirectives', { tasks: parsed.tasks, ui: parsed.ui, rawText: llmResponse } as ParsedDirectivesEventData);
    
    parsed.ui.forEach(desc => {
      this.emitEvent('uiDirective', { uiDescriptor: desc } as UiDirectiveEventData);
      accumulatedUi.push(desc); 
    });
        
    const taskQueue = new TaskQueue();
    taskQueue.addMany(parsed.tasks);
    
    let iterationCount = 0;
    const maxIterations = 5; // Increased max iterations slightly

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
        
        if (result.status === 'ok') { // Only consider successful tasks for re-prompting with LLM for now
            newResultsForObservation.push(result);
        }
        tasksExecutedInThisIteration++;
      }
      
      if (taskQueue.isFinished()) {
        // If queue is finished, check if the last set of results triggered a final LLM response in the previous iteration.
        // If not, and there are new results, trigger a final observation prompt.
        if (newResultsForObservation.length > 0) {
             // Ensure we don't re-observe the same results if LLM doesn't add new tasks
            const unobservedResults = newResultsForObservation.filter(r => !r._observed);
            if (unobservedResults.length === 0 && tasksExecutedInThisIteration > 0) {
                 // All results from this batch were already observed in a prior loop because LLM didn't add new tasks
                 // but tasks were run. Break to avoid re-prompting with same data.
                 break;
            }
            unobservedResults.forEach(r => r._observed = true);

            if (unobservedResults.length > 0) {
                const observePrompt = this.buildPrompt(userMsg, true, this.history);
                llmResponse = await this.opts.llm.generate(observePrompt);
                currentTextResponse = llmResponse;
                this.emitEvent('llmResponse', { rawText: llmResponse } as LLMResponseEventData);
                
                const refinedParsed = parseDirectives(llmResponse);
                this.emitEvent('parsedDirectives', { tasks: refinedParsed.tasks, ui: refinedParsed.ui, rawText: llmResponse } as ParsedDirectivesEventData);
                
                refinedParsed.ui.forEach(desc => {
                  this.emitEvent('uiDirective', { uiDescriptor: desc } as UiDirectiveEventData);
                  // Avoid duplicates if UiAdapter handles idempotency
                  if (!accumulatedUi.find(existing => existing.id === desc.id)) {
                      accumulatedUi.push(desc);
                  }
                });

                if (refinedParsed.tasks.length > 0) {
                  taskQueue.addMany(refinedParsed.tasks);
                  newResultsForObservation = []; // Reset for the next iteration with new tasks
                  continue; // Continue to process newly added tasks
                } else {
                    break; // No new tasks, loop finishes
                }
            } else {
                 break; // No new unobserved results and queue is finished
            }
        } else {
            break; // Queue finished and no new results to observe from this iteration
        }
      } else if (tasksExecutedInThisIteration === 0) {
        // No tasks were run in this iteration, and the queue is not empty.
        // This means we are stuck on dependencies that are not being met.
        console.warn("Agent loop stalled: No tasks ready and queue not finished. Breaking.");
        break;
      }
      // If tasks were executed, and queue is not finished, the loop will continue to check nextReady.
      // If new results were observed and tasks added, the `continue` statement handles it.
    }

    if(iterationCount >= maxIterations){
        console.warn(`Agent reached maximum iterations (${maxIterations}).`);
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
    
    prompt += "Capabilities:\n";
    for (const capability of this.opts.capabilities) {
      // Provide a more structured way for LLM to understand capabilities if possible
      prompt += `- ::Task{kind:"${capability.kind}", params:{...}} - Description of ${capability.kind}\n`;
    }
    prompt += "\nTask directive format: ::Task{id:\"unique_id\",kind:\"capability_name\",params:{/* JSON_parameters */},dependsOn:[\"other_task_id\"]}\n";
    prompt += "UI directive format: ::Ui{id:\"unique_ui_id\",type:\"ComponentType\",props:{/* JSON_props */}}\n";

    if (includeResults && resultsToInclude && resultsToInclude.length > 0) {
      prompt += "\nPrevious Task Results (for your observation):\n";
      for (const result of resultsToInclude) {
        // Include only results that haven't been internally marked as observed for this specific prompt generation
        // This logic is now handled by filtering `newResultsForObservation` before calling buildPrompt if needed,
        // or by relying on the `_observed` flag if passing full history.
        prompt += `- Task ${result.id} (${result.status}): ${result.status === 'ok' ? JSON.stringify(result.output) : result.error}\n`;
      }
      prompt += "\nBased on these results, provide your next set of actions or final response. Ensure all tasks have unique IDs.\n";
    }
    
    prompt += `\nUser: ${userMsg}\n\nAssistant:`;
    return prompt;
  }
} 