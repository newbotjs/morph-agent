const { createApp, ref, nextTick } = Vue;

createApp({
  /**
   * Data properties for the Vue application.
   * @returns {object} The initial data object.
   */
  data() {
    return {
      newMessage: '',
      messages: [], // Stores chat messages: { sender: 'user'|'assistant', text?: string, uiComponent?: object, taskInfo?: object, type?: 'error'|'thinking' }
      isLoading: false,
      isThinking: false, // Indicates if the assistant is currently processing a main response (not just a task)
      error: null,
      eventSource: null,
      currentAssistantMessageId: null, // To group streamed parts of a message
    };
  },
  /**
   * Methods for the Vue application.
   */
  methods: {
    /**
     * Scrolls the chat messages area to the bottom.
     * This is typically called after a new message is added.
     */
    scrollToBottom() {
      nextTick(() => {
        const chatMessages = this.$refs.chatMessages;
        if (chatMessages) {
          chatMessages.scrollTop = chatMessages.scrollHeight;
        }
      });
    },

    /**
     * Sends the user's message to the backend and sets up an EventSource to receive streamed responses.
     * It handles the SSE connection and processes incoming agent events.
     */
    async sendMessage() {
      if (!this.newMessage.trim()) return;

      const userMessage = {
        id: `user-${Date.now()}`,
        sender: 'user',
        text: this.newMessage,
      };
      this.messages.push(userMessage);
      this.isLoading = true;
      this.isThinking = true; // Initially assume thinking for the core response
      this.error = null;
      const currentMessageText = this.newMessage;
      this.newMessage = '';
      this.scrollToBottom();

      // Close previous EventSource if it exists
      if (this.eventSource) {
        this.eventSource.close();
      }

      this.eventSource = new EventSource('/chat', { method: 'POST', body: JSON.stringify({ message: currentMessageText }), headers: { 'Content-Type': 'application/json' } });
      // The above usage of EventSource with POST is not standard and might not work directly.
      // Standard EventSource only supports GET. We will use fetch for POST and then handle the stream.
      // Corrected approach: Use fetch for POST, then handle the stream.
      this.eventSource.close(); // Close the incorrect EventSource init

      try {
        const response = await fetch('/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream'
          },
          body: JSON.stringify({ message: currentMessageText }),
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.data?.message || `Server error: ${response.status}`);
        }
        
        this.currentAssistantMessageId = `assistant-${Date.now()}`;
        // Create an initial placeholder for the assistant's response
        this.messages.push({
            id: this.currentAssistantMessageId,
            sender: 'assistant',
            text: '', // Will be populated by llmResponse or agentEnd
            uiComponents: [],
            tasks: [],
            isThinkingPlaceholder: true, // Special flag for the initial thinking bubble
        });
        this.scrollToBottom();

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        const processStream = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              this.isThinking = false;
              this.isLoading = false;
              // Ensure the thinking placeholder is removed if no text came through for it
              const assistantMsgIndex = this.messages.findIndex(m => m.id === this.currentAssistantMessageId && m.isThinkingPlaceholder);
              if (assistantMsgIndex !== -1 && !this.messages[assistantMsgIndex].text && this.messages[assistantMsgIndex].uiComponents.length === 0) {
                  this.messages.splice(assistantMsgIndex, 1);
              }
              this.scrollToBottom();
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const events = buffer.split('\n\n');
            buffer = events.pop(); // Keep the last, possibly incomplete event

            for (const eventString of events) {
              if (eventString.startsWith('data: ')) {
                try {
                  const jsonData = eventString.substring(5);
                  const event = JSON.parse(jsonData);
                  this.handleAgentEvent(event);
                } catch (e) {
                  console.error('Error parsing SSE event:', e, 'Raw event:', eventString);
                  this.error = 'Error processing response from server.';
                }
              }
            }
          }
        };
        processStream().catch(err => {
            console.error('Stream processing error:', err);
            this.error = `Connection error: ${err.message}`;
            this.isLoading = false;
            this.isThinking = false;
            // Remove thinking bubble on stream error
            const thinkingMsgIndex = this.messages.findIndex(m => m.id === this.currentAssistantMessageId && m.isThinkingPlaceholder);
            if (thinkingMsgIndex !== -1) this.messages.splice(thinkingMsgIndex, 1);
            this.scrollToBottom();
        });

      } catch (err) {
        console.error('Failed to send message:', err);
        this.error = err.message || 'Failed to connect to the server.';
        this.isLoading = false;
        this.isThinking = false;
        this.messages.push({ sender: 'assistant', text: this.error, type: 'error' });
        this.scrollToBottom();
      }
    },

    /**
     * Processes different types of events received from the agent via SSE.
     * Updates the chat messages array based on the event type and data.
     * @param {object} event The agent event object.
     *   - event.type: The type of the agent event (e.g., 'llmResponse', 'uiDirective', 'taskResult', 'agentEnd', 'agentEndStream', 'error').
     *   - event.data: The data associated with the event.
     */
    handleAgentEvent(event) {
      console.log('Received agent event:', event);
      this.isThinking = false; // General thinking stops once first event arrives. Specific thinking might be per message.
      
      // Find or create the current assistant message block
      let assistantMsg = this.messages.find(m => m.id === this.currentAssistantMessageId);
      if (!assistantMsg) {
         // This case should ideally be handled by the initial placeholder creation
         // but as a fallback, create it now.
        this.currentAssistantMessageId =  `assistant-${Date.now()}`;
        assistantMsg = {
            id: this.currentAssistantMessageId,
            sender: 'assistant',
            text: '',
            uiComponents: [],
            tasks: [],
        };
        this.messages.push(assistantMsg);
      }
      // Remove the general thinking placeholder if it exists for this message ID
      if (assistantMsg.isThinkingPlaceholder) {
          assistantMsg.isThinkingPlaceholder = false;
      }

      switch (event.type) {
        case 'llmResponse':
          // Append or set text from LLM
          assistantMsg.text = (assistantMsg.text || '') + event.data.rawText; 
          break;
        case 'parsedDirectives':
          // Store task and UI directives information if needed, or handle them if they are separate from final text
          // For now, we'll mainly rely on 'uiDirective' and 'taskResult' for display
          // event.data.tasks, event.data.ui
          if (event.data.ui && event.data.ui.length > 0) {
            event.data.ui.forEach(uiDesc => {
                assistantMsg.uiComponents.push(uiDesc);
            });
          }
          // We could show tasks as they are parsed, but 'taskStart' and 'taskResult' are more informative for progress
          break;
        case 'thinkingDirective':
            this.messages.push({ sender: 'assistant', text: `Thinking about: ${event.data.message || '...'}`, type: 'thinking' });
            break;
        case 'uiDirective':
          // Directly add UI components. This might replace or augment text.
          assistantMsg.uiComponents.push(event.data.uiDescriptor);
          break;
        case 'taskStart':
            this.messages.push({ 
                sender: 'assistant', 
                taskInfo: { id: event.data.task.id, kind: event.data.task.kind, status: 'started' }, 
                text: `Starting task: ${event.data.task.id} (${event.data.task.kind})`
            });
          break;
        case 'taskResult':
          // Find the message announcing the task start and update it, or add a new one
          const taskStartMsg = this.messages.find(m => m.taskInfo && m.taskInfo.id === event.data.id && m.taskInfo.status === 'started');
          if (taskStartMsg) {
            taskStartMsg.taskInfo.status = event.data.status;
            taskStartMsg.taskInfo.output = event.data.output;
            taskStartMsg.taskInfo.error = event.data.error;
            taskStartMsg.text = `Task ${event.data.id} (${event.data.status}): ${event.data.output ? 'Completed' : ('Failed: ' + event.data.error)}`;
          } else {
            this.messages.push({ 
                sender: 'assistant', 
                taskInfo: { id: event.data.id, status: event.data.status, output: event.data.output, error: event.data.error, kind: 'N/A' /* kind might not be in TaskResult */ },
                text: `Task Result for ${event.data.id}: ${event.data.status}`
            });
          }
          break;
        case 'agentEnd':
          // The final consolidated text from the agent for this interaction
          if (event.data.finalText) {
            assistantMsg.text = event.data.finalText; // Overwrite with final, clean text
          }
          // Display final UI components if any (though uiDirective should have handled them)
          if (event.data.finalUi && event.data.finalUi.length > 0) {
            assistantMsg.uiComponents = event.data.finalUi; // Replace with final UI set
          }
          // All tasks and their results are in event.data.history
          this.isLoading = false; // Mark loading as complete for this specific message
          break;
        case 'error': // Custom error event from server.js or agent framework itself
          this.error = event.data.message || 'An unknown error occurred.';
          this.messages.push({ sender: 'assistant', text: this.error, type: 'error' });
          this.isLoading = false;
          break;
        case 'agentEndStream': // Custom event from server.js to signal end of events for this request
          console.log('Agent stream ended for this message.');
          this.isLoading = false; 
          // If the assistant message is still empty (e.g. only tasks were run, no final text/UI)
          // we might want to remove it or add a summary.
          // For now, we ensure the main loading spinner stops.
          if (!assistantMsg.text && assistantMsg.uiComponents.length === 0 && assistantMsg.tasks.length === 0) {
            const idx = this.messages.findIndex(m => m.id === assistantMsg.id);
            if (idx !== -1) this.messages.splice(idx, 1); // Remove empty assistant message
          }
          this.currentAssistantMessageId = null; // Reset for next message
          break;
        default:
          console.warn('Unhandled agent event type:', event.type, event.data);
      }
      this.scrollToBottom();
    },
  },
  /**
   * Mounted lifecycle hook.
   * Used here for initial setup if needed.
   */
  mounted() {
    // autofocus input or other setup
    // this.$refs.chatInput.focus(); // If chatInput ref was on the input element
  },
}).mount('#app');
