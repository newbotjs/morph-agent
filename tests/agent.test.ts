import { describe, it, expect, vi } from 'vitest';
import { Agent } from '../src/agent';
import { AgentOptions, LLMSession, CapabilityStrategy, TaskResult, UserHistoryEntry, AssistantHistoryEntry, ToolHistoryEntry, Task, UiDescriptor, HistoryEntry } from '../src/types';

// Mock LLM
const mockLlm: LLMSession = {
  generate: vi.fn(),
};

// Mock Capabilities
const mockCapability1: CapabilityStrategy<any, any> = {
  kind: 'mockCapability1' as any, // Cast for testing with custom kind
  description: 'A mock capability',
  signature: 'mockCapability1(param: string)',
  run: vi.fn(),
};

const mockCapability2: CapabilityStrategy<any, any> = {
  kind: 'mockCapability2' as any, // Cast for testing with custom kind
  description: 'Another mock capability',
  signature: 'mockCapability2(param: number)',
  run: vi.fn(),
};

describe('Agent', () => {
  it('should initialize correctly with options', () => {
    const opts: AgentOptions = {
      llm: mockLlm,
      capabilities: [mockCapability1],
      systemPrompt: 'Test system prompt',
    };
    const agent = new Agent(opts);
    expect(agent).toBeInstanceOf(Agent);
  });

  describe('buildPrompt', () => {
    it('should construct a basic prompt with system message and capabilities', () => {
      const opts: AgentOptions = {
        llm: mockLlm,
        capabilities: [mockCapability1],
        systemPrompt: 'You are a helpful assistant.',
      };
      const agent = new Agent(opts);
      // @ts-expect-error accessing private method for testing
      const prompt = agent.buildPrompt();

      expect(prompt).toContain('System: You are a helpful assistant.');
      expect(prompt).toContain('Capabilities (for use with the \'Task\' directive):');
      expect(prompt).toContain('- mockCapability1: A mock capability. Use the following signature: mockCapability1(param: string)');
      expect(prompt).toContain('Directive formats to use in your response:');
      expect(prompt).toContain('```Task');
      expect(prompt).toContain('```Ui');
      expect(prompt).toContain('```Thinking');
      expect(prompt).toContain('Interaction History:');
      expect(prompt).toContain('\nAssistant:');
    });

    it('should include history in the prompt', () => {
      const opts: AgentOptions = {
        llm: mockLlm,
        capabilities: [],
      };
      const agent = new Agent(opts);
      // @ts-expect-error accessing private property for testing
      agent.history = [
        { role: 'user', content: 'Hello agent!', timestamp: Date.now() } as UserHistoryEntry,
        { role: 'assistant', content: 'Hello user!', timestamp: Date.now() } as AssistantHistoryEntry,
        { role: 'tool', id: 'task1', status: 'ok', output: { result: 'data' }, timestamp: Date.now() } as ToolHistoryEntry,
        { role: 'tool', id: 'task2', status: 'error', error: 'Something went wrong', timestamp: Date.now() } as ToolHistoryEntry,
      ];
      // @ts-expect-error accessing private method for testing
      const prompt = agent.buildPrompt();

      expect(prompt).toContain('User: Hello agent!');
      expect(prompt).toContain('Assistant: Hello user!');
      expect(prompt).toContain('Tool Observation (Task ID: task1, Status: ok): {"result":"data"}');
      expect(prompt).toContain('Tool Observation (Task ID: task2, Status: error): Error: Something went wrong');
    });

    it('should handle no capabilities correctly in prompt', () => {
      const opts: AgentOptions = {
        llm: mockLlm,
        capabilities: [],
      };
      const agent = new Agent(opts);
      // @ts-expect-error accessing private method for testing
      const prompt = agent.buildPrompt();
      expect(prompt).toContain('- No capabilities are currently available.');
    });
  });

  describe('chat', () => {
    it('should process a simple user message and return LLM response', async () => {
      const llmMockWithMessage = {
        generate: vi.fn().mockResolvedValue('LLM says hello!'),
      };
      const opts: AgentOptions = {
        llm: llmMockWithMessage,
        capabilities: [],
      };
      const agent = new Agent(opts);
      const onEventMock = vi.fn();
      agent['onEvent'] = onEventMock;

      const result = await agent.chat('User says hi');

      expect(llmMockWithMessage.generate).toHaveBeenCalledTimes(1);
      // Check initial assistant response from history
      const initialAssistantResponse = result.history.find(entry => entry.role === 'assistant') as AssistantHistoryEntry;
      expect(initialAssistantResponse?.content).toBe('LLM says hello!');
      expect(result.history).toHaveLength(2);
      expect(result.history[0].role).toBe('user');
      expect(result.history[1].role).toBe('assistant');
      // Check that no UI directives were emitted for this simple case
      expect(onEventMock).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'uiDirective' }));

      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'llmResponse', data: { rawText: 'LLM says hello!' } }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ 
        type: 'parsedDirectives', 
        data: { 
          tasks: [], 
          ui: [], 
          thinkingDirective: undefined, 
          rawText: 'LLM says hello!' 
        } 
      }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'agentEnd', data: { history: result.history } }));
    });

    it('should process a single regular task directive', async () => {
      const taskResult: TaskResult = { id: 'regTask1', status: 'ok', output: { result: 'done' } };
      const mockRun = vi.fn().mockResolvedValue({ result: 'done' });
      const capWithMock: CapabilityStrategy<any,any> = { ...mockCapability1, kind: 'capRegular' as any, run: mockRun };

      const llmResponseWithTask = 'Okay, doing the task. ```Task\n{"id":"regTask1","kind":"capRegular","params":{"p":"go"}}\n```';
      const llmResponseAfterTask = 'Task done!';

      const llmMock = {
        generate: vi.fn()
          .mockResolvedValueOnce(llmResponseWithTask)
          .mockResolvedValueOnce(llmResponseAfterTask)
      };

      const opts: AgentOptions = {
        llm: llmMock,
        capabilities: [capWithMock],
      };
      const agent = new Agent(opts);
      const onEventMock = vi.fn();
      agent['onEvent'] = onEventMock;

      const result = await agent.chat('Do a regular task');
      const expectedTask: Task = {id: 'regTask1', kind: 'capRegular' as any, params: {p: 'go'}};

      expect(llmMock.generate).toHaveBeenCalledTimes(2); // Initial + after task
      expect(mockRun).toHaveBeenCalledWith({ p: 'go' }, expect.anything());

      expect(result.history).toHaveLength(4); // user, assistant(task), tool, assistant
      expect((result.history[2] as ToolHistoryEntry).id).toBe('regTask1');
      expect((result.history[2] as ToolHistoryEntry).status).toBe('ok');
      expect((result.history[2] as ToolHistoryEntry).output).toEqual({ result: 'done' });

      // Verify event emissions in correct order
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'llmResponse', data: { rawText: llmResponseWithTask }}));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ 
        type: 'parsedDirectives',
        data: expect.objectContaining({
          rawText: llmResponseWithTask,
          tasks: [expectedTask]
        })
      }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'taskStart', data: { task: expectedTask } }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ 
        type: 'taskResult', 
        data: expect.objectContaining({ id: 'regTask1', status: 'ok' })
      }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'llmResponse', data: { rawText: llmResponseAfterTask }}));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ 
        type: 'parsedDirectives', 
        data: expect.objectContaining({ 
          rawText: llmResponseAfterTask,
          tasks: [] 
        })
      }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'agentEnd' }));
    });

    it('should handle a task error correctly', async () => {
      const mockRunError = vi.fn().mockRejectedValue(new Error('Task failed miserably'));
      const capWithError: CapabilityStrategy<any,any> = { ...mockCapability1, kind: 'capError' as any, run: mockRunError };

      const llmResponseWithTask = 'Trying a task that will fail. ```Task\n{"id":"errorTask1","kind":"capError","params":{"p":"fail"}}\n```';
      const llmResponseAfterError = 'Oh no, it failed.';

      const llmMock = {
        generate: vi.fn()
          .mockResolvedValueOnce(llmResponseWithTask)
          .mockResolvedValueOnce(llmResponseAfterError)
      };

      const opts: AgentOptions = {
        llm: llmMock,
        capabilities: [capWithError],
      };
      const agent = new Agent(opts);
      const onEventMock = vi.fn();
      agent['onEvent'] = onEventMock;

      const result = await agent.chat('Test task failure');
      const expectedTask: Task = {id: 'errorTask1', kind: 'capError' as any, params: {p: 'fail'}};
      const expectedTaskResult: TaskResult = { 
        id: 'errorTask1', 
        status: 'error', 
        error: 'Error: Task failed miserably',
        output: undefined
      }; 

      expect(llmMock.generate).toHaveBeenCalledTimes(2);
      expect(mockRunError).toHaveBeenCalledWith({ p: 'fail' }, expect.anything());

      expect(result.history).toHaveLength(4); // user, assistant(task), tool(error), assistant
      const toolEntry = result.history[2] as ToolHistoryEntry;
      expect(toolEntry.id).toBe('errorTask1');
      expect(toolEntry.status).toBe('error');
      expect(toolEntry.error).toBe('Task failed miserably');

      // Verify event emissions in correct order
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'llmResponse', data: { rawText: llmResponseWithTask }}));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ 
        type: 'parsedDirectives', 
        data: expect.objectContaining({ 
          rawText: llmResponseWithTask,
          tasks: [expectedTask]
        })
      }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'taskStart', data: { task: expectedTask } }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ 
        type: 'taskResult', 
        data: expect.objectContaining({ id: 'errorTask1', status: 'error', error: 'Task failed miserably' })
      }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'llmResponse', data: { rawText: llmResponseAfterError }}));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ 
        type: 'parsedDirectives', 
        data: expect.objectContaining({ 
          rawText: llmResponseAfterError,
          tasks: [] 
        })
      }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'agentEnd' }));
    });

    it('should process a thinking directive', async () => {
      const taskResult1: TaskResult = { id: 'thinkTask1', status: 'ok', output: { step1: 'done' } };
      const taskResult2: TaskResult = { id: 'thinkTask2', status: 'ok', output: { step2: 'complete' } };
      
      const mockRun1 = vi.fn().mockResolvedValue({ step1: 'done' });
      const mockRun2 = vi.fn().mockResolvedValue({ step2: 'complete' });

      const cap1WithMock: CapabilityStrategy<any,any> = { ...mockCapability1, kind: 'cap1' as any, run: mockRun1 };
      const cap2WithMock: CapabilityStrategy<any,any> = { ...mockCapability2, kind: 'cap2' as any, run: mockRun2 };

      const initialLlmThinkingResponse = 'Okay, planning... ```Thinking\n{"tasks":[{"id":"thinkTask1","kind":"cap1","params":{"p1":"abc"}},{"id":"thinkTask2","kind":"cap2","params":{"p2":123}}]}\n```';
      const afterTask1LlmResponse = 'First step done. ```Ui\n{"id":"ui_step1","type":"Progress","props":{"text":"Step 1/2"}}\n```';
      const afterTask2LlmResponse = 'All steps done! ```Ui\n{"id":"ui_final","type":"Success","props":{"message":"All good!"}}\n```';

      const llmMockWithThinking = {
        generate: vi.fn()
          .mockResolvedValueOnce(initialLlmThinkingResponse)
          .mockResolvedValueOnce(afterTask1LlmResponse)
          .mockResolvedValueOnce(afterTask2LlmResponse)
      };

      const opts: AgentOptions = {
        llm: llmMockWithThinking,
        capabilities: [cap1WithMock, cap2WithMock],
      };
      const agent = new Agent(opts);
      const onEventMock = vi.fn();
      agent['onEvent'] = onEventMock;

      const result = await agent.chat('Execute a plan');
      const expectedTask1: Task = {id: 'thinkTask1', kind: 'cap1' as any, params: {p1: 'abc'}};
      const expectedTask2: Task = {id: 'thinkTask2', kind: 'cap2' as any, params: {p2: 123}};
      const expectedUiStep1 = { id: 'ui_step1', type: 'Progress', props: { text: 'Step 1/2' } };
      const expectedUiFinal = { id: 'ui_final', type: 'Success', props: { message: 'All good!' } };

      expect(llmMockWithThinking.generate).toHaveBeenCalledTimes(3); // Initial + after task1 + after task2
      expect(mockRun1).toHaveBeenCalledWith({ p1: 'abc' }, expect.anything());
      expect(mockRun2).toHaveBeenCalledWith({ p2: 123 }, expect.anything());

      // Check initial assistant response from history
      const initialAssistantResponse = result.history.find(entry => entry.role === 'assistant' && entry.content === initialLlmThinkingResponse) as AssistantHistoryEntry;
      expect(initialAssistantResponse?.content).toBe(initialLlmThinkingResponse);
      
      expect(result.history).toHaveLength(6); // user, assistant(think), tool1, assistant, tool2, assistant
      expect((result.history[2] as ToolHistoryEntry).id).toBe('thinkTask1');
      expect((result.history[4] as ToolHistoryEntry).id).toBe('thinkTask2');

      // Check UI directives
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'uiDirective', data: { uiDescriptor: expectedUiStep1 }}));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'uiDirective', data: { uiDescriptor: expectedUiFinal }}));
      
      // Check thinking directive event
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ 
        type: 'thinkingDirective', 
        data: { directive: { tasks: [expectedTask1, expectedTask2] } }
      }));

      // Check task start and result events
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'taskStart', data: { task: expectedTask1 } }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'taskResult', data: taskResult1 }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'taskStart', data: { task: expectedTask2 } }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'taskResult', data: taskResult2 }));

      // Check llmResponse events
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'llmResponse', data: { rawText: initialLlmThinkingResponse }}));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'llmResponse', data: { rawText: afterTask1LlmResponse }}));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'llmResponse', data: { rawText: afterTask2LlmResponse }}));
      
      // Check parsedDirectives events
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ 
        type: 'parsedDirectives', 
        data: expect.objectContaining({ 
          rawText: initialLlmThinkingResponse,
          thinkingDirective: { tasks: [expectedTask1, expectedTask2] }
        })
      }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ 
        type: 'parsedDirectives', 
        data: expect.objectContaining({ 
          rawText: afterTask1LlmResponse,
          ui: [expectedUiStep1]
        })
      }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ 
        type: 'parsedDirectives', 
        data: expect.objectContaining({ 
          rawText: afterTask2LlmResponse,
          ui: [expectedUiFinal]
        })
      }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'agentEnd' }));
    });

    it('should process combined UI and Task directives', async () => {
      const taskResult: TaskResult = { id: 'combinedTask1', status: 'ok', output: { data: 'success' } };
      const mockRun = vi.fn().mockResolvedValue({ data: 'success' });
      const capWithMock: CapabilityStrategy<any,any> = { ...mockCapability1, kind: 'capCombined' as any, run: mockRun };

      const llmResponseWithDirectives = 'Showing UI and doing a task. ```Ui\n{"id":"ui1","type":"Info","props":{"text":"Processing..."}}\n```\nSome descriptive text.\n```Task\n{"id":"combinedTask1","kind":"capCombined","params":{"action":"run"}}\n```';
      const llmResponseAfterTask = 'All done with UI and task!';
      
      const llmMock = {
        generate: vi.fn()
          .mockResolvedValueOnce(llmResponseWithDirectives)
          .mockResolvedValueOnce(llmResponseAfterTask)
      };

      const opts: AgentOptions = {
        llm: llmMock,
        capabilities: [capWithMock],
      };
      const agent = new Agent(opts);
      const onEventMock = vi.fn();
      agent['onEvent'] = onEventMock;

      const result = await agent.chat('Show UI and run task');
      const expectedTask: Task = {id: 'combinedTask1', kind: 'capCombined' as any, params: {action: 'run'}};
      const expectedUi: UiDescriptor = {id: 'ui1', type: 'Info', props: {text: 'Processing...'}};

      expect(llmMock.generate).toHaveBeenCalledTimes(2);
      expect(mockRun).toHaveBeenCalledWith({ action: 'run' }, expect.anything());

      expect(result.history).toHaveLength(4); // user, assistant(ui+task), tool, assistant
      expect((result.history[2] as ToolHistoryEntry).id).toBe('combinedTask1');

      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'uiDirective', data: { uiDescriptor: expectedUi }}));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'taskStart', data: { task: expectedTask } }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ 
        type: 'taskResult', 
        data: expect.objectContaining({ id: 'combinedTask1', status: 'ok' })
      }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'llmResponse', data: { rawText: llmResponseWithDirectives }}));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'llmResponse', data: { rawText: llmResponseAfterTask }}));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ 
        type: 'parsedDirectives', 
        data: expect.objectContaining({ 
          rawText: llmResponseWithDirectives,
          tasks: [expectedTask],
          ui: [expectedUi]
        })
      }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'agentEnd' }));
    });

    it('should process tasks with dependencies correctly', async () => {
      const taskResult1: TaskResult = { id: 'depTask1', status: 'ok', output: { data: 'first done' } };
      const taskResult2: TaskResult = { id: 'depTask2', status: 'ok', output: { data: 'second done' } };

      const mockRun1 = vi.fn().mockResolvedValue({ data: 'first done' });
      const mockRun2 = vi.fn().mockResolvedValue({ data: 'second done' });

      const cap1WithMock: CapabilityStrategy<any,any> = { ...mockCapability1, kind: 'capDep1' as any, run: mockRun1 };
      const cap2WithMock: CapabilityStrategy<any,any> = { ...mockCapability2, kind: 'capDep2' as any, run: mockRun2 };

      // depTask2 depends on depTask1
      const llmResponseWithDependentTasks = 'Executing a sequence of tasks. ```Task\n{"id":"depTask2","kind":"capDep2","params":{"p2":456},"dependsOn":["depTask1"]}\n```\n```Task\n{"id":"depTask1","kind":"capDep1","params":{"p1":123}}\n```';
      const llmResponseAfterTasks = 'All dependent tasks completed!';

      const llmMock = {
        generate: vi.fn()
          .mockResolvedValueOnce(llmResponseWithDependentTasks)
          .mockResolvedValueOnce(llmResponseAfterTasks) 
      };

      const opts: AgentOptions = {
        llm: llmMock,
        capabilities: [cap1WithMock, cap2WithMock],
      };
      const agent = new Agent(opts);
      const onEventMock = vi.fn();
      agent['onEvent'] = onEventMock;

      const result = await agent.chat('Run tasks with dependency');
      const expectedTask1: Task = {id: 'depTask1', kind: 'capDep1' as any, params: {p1: 123}};
      const expectedTask2: Task = {id: 'depTask2', kind: 'capDep2' as any, params: {p2: 456}, dependsOn: ['depTask1']};

      expect(llmMock.generate).toHaveBeenCalledTimes(2); 
      expect(mockRun1).toHaveBeenCalledWith({ p1: 123 }, expect.anything());
      expect(mockRun2).toHaveBeenCalledWith({ p2: 456 }, expect.anything());
      // Ensure mockRun1 is called before mockRun2 due to dependency
      const mockRun1Order = mockRun1.mock.invocationCallOrder[0];
      const mockRun2Order = mockRun2.mock.invocationCallOrder[0];
      expect(mockRun1Order).toBeLessThan(mockRun2Order);

      expect(result.history).toHaveLength(5); // user, assistant(tasks), tool1, tool2, assistant
      expect((result.history[2] as ToolHistoryEntry).id).toBe('depTask1');
      expect((result.history[3] as ToolHistoryEntry).id).toBe('depTask2');
      
      // Check events for task1
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'taskStart', data: { task: expectedTask1 } }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ 
        type: 'taskResult', 
        data: expect.objectContaining({ id: 'depTask1', status: 'ok' })
      }));
      // Check events for task2
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'taskStart', data: { task: expectedTask2 } }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ 
        type: 'taskResult', 
        data: expect.objectContaining({ id: 'depTask2', status: 'ok' })
      }));

      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ 
        type: 'parsedDirectives', 
        data: expect.objectContaining({ 
          rawText: llmResponseWithDependentTasks,
          tasks: expect.arrayContaining([expectedTask1, expectedTask2])
        })
      }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'agentEnd' }));
    });

    it('should stop and warn if thinking directive reaches max iterations', async () => {
      const mockRun = vi.fn().mockResolvedValue({ step: 'done' });
      const capInfinite: CapabilityStrategy<any,any> = { ...mockCapability1, kind: 'capInfinite' as any, run: mockRun };

      // Simplified string construction
      const llmRecurringThinkingResponse = (iteration: number) => {
        const taskObj = {
          tasks: [{ 
            id: `thinkLoop${iteration}`, 
            kind: 'capInfinite', 
            params: { i: iteration } 
          }]
        };
        return `Thinking step ${iteration}... \`\`\`Thinking
${JSON.stringify(taskObj)}
\`\`\``;
      };

      const llmMock = {
        generate: vi.fn(),
      };

      // Agent's maxIterations for thinking is 10. LLM will be called 1 (initial) + 10 (iterations) = 11 times.
      for (let i = 0; i < 11; i++) { 
        llmMock.generate.mockResolvedValueOnce(llmRecurringThinkingResponse(i + 1));
      }

      const opts: AgentOptions = {
        llm: llmMock,
        capabilities: [capInfinite],
      };
      const agent = new Agent(opts);
      const onEventMock = vi.fn();
      agent['onEvent'] = onEventMock;
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await agent.chat('Start infinite thinking loop');

      expect(llmMock.generate).toHaveBeenCalledTimes(11); 
      expect(mockRun).toHaveBeenCalledTimes(10); 

      expect(consoleWarnSpy).toHaveBeenCalledWith('Thinking directive reached maximum iterations (10).');
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'agentEnd' }));
      
      consoleWarnSpy.mockRestore();
    });

    it('should process input when a history array is provided', async () => {
      const llmMockWithMessage = {
        generate: vi.fn().mockResolvedValue('LLM acknowledges history'),
      };
      const opts: AgentOptions = {
        llm: llmMockWithMessage,
        capabilities: [],
        systemPrompt: 'Test System',
      };
      const agent = new Agent(opts);
      const onEventMock = vi.fn();
      agent['onEvent'] = onEventMock;

      const initialHistory: HistoryEntry[] = [
        { role: 'user', content: 'First user message', timestamp: Date.now() - 10000 } as UserHistoryEntry,
        { role: 'assistant', content: 'First assistant response', timestamp: Date.now() - 9000 } as AssistantHistoryEntry,
        { role: 'user', content: 'Second user message', timestamp: Date.now() - 8000 } as UserHistoryEntry,
      ];

      const result = await agent.chat(initialHistory);

      expect(llmMockWithMessage.generate).toHaveBeenCalledTimes(1);
      const generatedPrompt = llmMockWithMessage.generate.mock.calls[0][0] as string;
      
      expect(generatedPrompt).toContain('System: Test System');
      expect(generatedPrompt).toContain('User: First user message');
      expect(generatedPrompt).toContain('Assistant: First assistant response');
      expect(generatedPrompt).toContain('User: Second user message');
      expect(generatedPrompt).toContain('\nAssistant:');

      // The history in the result should be the initial history + the new assistant response
      expect(result.history).toHaveLength(4);
      expect((result.history[0] as UserHistoryEntry).content).toBe('First user message');
      expect((result.history[1] as AssistantHistoryEntry).content).toBe('First assistant response');
      expect((result.history[2] as UserHistoryEntry).content).toBe('Second user message');
      expect(result.history[3].role).toBe('assistant');
      expect((result.history[3] as AssistantHistoryEntry).content).toBe('LLM acknowledges history');

      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'llmResponse', data: { rawText: 'LLM acknowledges history' } }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'agentEnd' }));
    });

  });
});
 