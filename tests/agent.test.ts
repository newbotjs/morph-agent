import { describe, it, expect, vi } from 'vitest';
import { Agent } from '../src/agent';
import { AgentOptions, LLMSession, CapabilityStrategy, TaskResult, UserHistoryEntry, AssistantHistoryEntry, ToolHistoryEntry, Task } from '../src/types';

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
      expect(result.finalText).toBe('LLM says hello!');
      expect(result.history).toHaveLength(2);
      expect(result.history[0].role).toBe('user');
      expect(result.history[1].role).toBe('assistant');
      expect(result.finalUi).toEqual([]);

      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'llmResponse', data: { rawText: 'LLM says hello!' } }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'parsedDirectives' }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'agentEnd' }));
    });

    it('should execute a task directive and get a refined response', async () => {
      const taskResult: TaskResult = { id: 'task1', status: 'ok', output: { success: true } };
      const mockRun = vi.fn().mockResolvedValue({ success: true }); // Capability run returns the output directly
      const capabilityWithMockRun: CapabilityStrategy<any, any> = { ...mockCapability1, run: mockRun };

      const llmMockWithTask = {
        generate: vi.fn()
          .mockResolvedValueOnce('Okay, I will do that. ::Task\n{"id":"task1","kind":"mockCapability1","params":{"p":"val"}}')
          .mockResolvedValueOnce('Task completed. Here is the UI. ::Ui\n{"id":"ui1","type":"Info","props":{"message":"Done!"}}'),
      };

      const opts: AgentOptions = {
        llm: llmMockWithTask,
        capabilities: [capabilityWithMockRun],
      };
      const agent = new Agent(opts);
      const onEventMock = vi.fn();
      agent['onEvent'] = onEventMock;

      const result = await agent.chat('Perform mockCapability1');
      const expectedTask: Task = {id: 'task1', kind: 'mockCapability1' as any, params: {p: 'val'}};

      expect(llmMockWithTask.generate).toHaveBeenCalledTimes(2); // Initial + after task
      expect(mockRun).toHaveBeenCalledWith({ p: 'val' }, expect.anything()); // executor adds runtime env
      expect(result.finalText).toBe('Okay, I will do that. ::Task\n{"id":"task1","kind":"mockCapability1","params":{"p":"val"}}');
      expect(result.history).toHaveLength(4); // user, assistant, tool, assistant
      expect(result.history[2].role).toBe('tool');
      expect((result.history[2] as ToolHistoryEntry).output).toEqual({ success: true });
      expect(result.finalUi).toEqual([{ id: 'ui1', type: 'Info', props: { message: 'Done!' } }]);
      
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'taskStart', data: { task: expectedTask } }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'taskResult', data: taskResult }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'uiDirective', data: { uiDescriptor: { id: 'ui1', type: 'Info', props: { message: 'Done!' } } } }));
    });

    it('should process a thinking directive', async () => {
      const taskResult1: TaskResult = { id: 'thinkTask1', status: 'ok', output: { step1: 'done' } };
      const taskResult2: TaskResult = { id: 'thinkTask2', status: 'ok', output: { step2: 'complete' } };
      
      const mockRun1 = vi.fn().mockResolvedValue({ step1: 'done' });
      const mockRun2 = vi.fn().mockResolvedValue({ step2: 'complete' });

      const cap1WithMock: CapabilityStrategy<any,any> = { ...mockCapability1, kind: 'cap1' as any, run: mockRun1 };
      const cap2WithMock: CapabilityStrategy<any,any> = { ...mockCapability2, kind: 'cap2' as any, run: mockRun2 };

      const llmMockWithThinking = {
        generate: vi.fn()
          .mockResolvedValueOnce('Okay, planning... ::Thinking\n{"tasks":[{"id":"thinkTask1","kind":"cap1","params":{"p1":"abc"}},{"id":"thinkTask2","kind":"cap2","params":{"p2":123}}]}')
          .mockResolvedValueOnce('First step done. ::Ui\n{"id":"ui_step1","type":"Progress","props":{"text":"Step 1/2"}}') // After thinkTask1
          .mockResolvedValueOnce('All steps done! ::Ui\n{"id":"ui_final","type":"Success","props":{"message":"All good!"}}') // After thinkTask2
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
      
      expect(llmMockWithThinking.generate).toHaveBeenCalledTimes(3); // Initial + after task1 + after task2
      expect(mockRun1).toHaveBeenCalledWith({ p1: 'abc' }, expect.anything());
      expect(mockRun2).toHaveBeenCalledWith({ p2: 123 }, expect.anything());

      expect(result.finalText).toBe('Okay, planning... ::Thinking\n{"tasks":[{"id":"thinkTask1","kind":"cap1","params":{"p1":"abc"}},{"id":"thinkTask2","kind":"cap2","params":{"p2":123}}]}');
      expect(result.history).toHaveLength(6); // user, assistant(think), tool1, assistant, tool2, assistant
      expect((result.history[2] as ToolHistoryEntry).id).toBe('thinkTask1');
      expect((result.history[4] as ToolHistoryEntry).id).toBe('thinkTask2');

      expect(result.finalUi).toEqual([
        { id: 'ui_step1', type: 'Progress', props: { text: 'Step 1/2' } },
        { id: 'ui_final', type: 'Success', props: { message: 'All good!' } },
      ]);

      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'thinkingDirective' }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'taskStart', data: { task: expectedTask1 } }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'taskResult', data: taskResult1 }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'taskStart', data: { task: expectedTask2 } }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'taskResult', data: taskResult2 }));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'uiDirective', data: { uiDescriptor: {id: 'ui_step1', type: 'Progress', props: {text: 'Step 1/2'}}}}));
      expect(onEventMock).toHaveBeenCalledWith(expect.objectContaining({ type: 'uiDirective', data: { uiDescriptor: {id: 'ui_final', type: 'Success', props: {message: 'All good!'}}}}));
    });
  });
}); 