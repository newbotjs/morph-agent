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
     * Parses task directives from the text and adds them to the assistant message's activeTasks array.
     * Task directives are in the format ```Task\n{...JSON...}\n```
     * @param {string} text The text to parse
     * @param {object} assistantMsg The assistant message object to update
     * @returns {string} The text with task directives removed
     */
    parseTaskDirectives(text, assistantMsg) {
      if (!text) return text;
      if (!assistantMsg.activeTasks) {
        assistantMsg.activeTasks = [];
      }

      // Regular expression to match ```Task\n{...}\n``` blocks
      // This regex matches backticks, 'Task', optional whitespace, JSON, and closing backticks
      const taskPattern = /```Task\s*\n([\s\S]*?)\n```/g;
      
      // Replace the pattern and collect the tasks
      let modifiedText = text.replace(taskPattern, (match, jsonContent) => {
        try {
          const taskData = JSON.parse(jsonContent.trim());
          
          // Check if this task already exists (avoid duplicates during streaming)
          const existingTaskIndex = assistantMsg.activeTasks.findIndex(t => t.id === taskData.id);
          
          if (existingTaskIndex >= 0) {
            // Task already exists, we might want to update it, but for now just skip
            return ''; // Remove from the text
          }
          
          // Add a new task with status "pending"
          const newTask = {
            ...taskData,
            status: 'pending',
            timestamp: Date.now()
          };
          
          assistantMsg.activeTasks.push(newTask);
          
          // Return empty string to remove the ```Task...``` block from the displayed message
          return '';
        } catch (e) {
          console.error('Error parsing task JSON:', e, jsonContent);
          // If we can't parse it, leave it in the text
          return match;
        }
      });
      
      return modifiedText;
    },

    /**
     * Updates a task in the assistant message's activeTasks array.
     * @param {string} taskId The ID of the task to update
     * @param {object} updates The updates to apply to the task
     * @returns {boolean} True if the task was found and updated, false otherwise
     */
    updateTask(taskId, updates) {
      for (const msg of this.messages) {
        if (msg.activeTasks) {
          const taskIndex = msg.activeTasks.findIndex(t => t.id === taskId);
          if (taskIndex >= 0) {
            msg.activeTasks[taskIndex] = { ...msg.activeTasks[taskIndex], ...updates };
            return true;
          }
        }
      }
      return false;
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
            activeTasks: [], // Initialize activeTasks array
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
            activeTasks: [], // Initialize activeTasks array
            isThinkingPlaceholder: true, // Special flag for the initial thinking bubble
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
          const rawText = event.data.rawText || '';
          
          // First parse task directives from the text and update activeTasks
          const parsedText = this.parseTaskDirectives(rawText, assistantMsg);
          
          // Si le texte parsé est vide (uniquement des tâches) et qu'il n'y a pas encore de texte
          if (!parsedText.trim() && !assistantMsg.text) {
            // On ajoute un message par défaut
            assistantMsg.text = "Je vais traiter votre demande...";
          } else {
            // Sinon on ajoute le texte parsé
            assistantMsg.text = (assistantMsg.text || '') + parsedText;
          }
          break;
        case 'parsedDirectives':
          // Store task and UI directives information if needed, or handle them if they are separate from final text
          // For now, we'll mainly rely on 'uiDirective' and 'taskResult' for display
          if (event.data.ui && event.data.ui.length > 0) {
            event.data.ui.forEach(uiDesc => {
                assistantMsg.uiComponents.push(uiDesc);
            });
          }
          break;
        case 'thinkingDirective':
            this.messages.push({ sender: 'assistant', text: `Thinking about: ${event.data.message || '...'}`, type: 'thinking' });
            break;
        case 'uiDirective':
          // Directly add UI components. This might replace or augment text.
          assistantMsg.uiComponents.push(event.data.uiDescriptor);
          break;
        case 'taskStart':
          // Update task status if it was created via a ```Task``` block
          if (this.updateTask(event.data.task.id, { 
            status: 'in_progress',
            startTime: Date.now()
          })) {
            console.log(`Updated task status for ${event.data.task.id} to in_progress`);
          } else {
            // If the task wasn't found (it might have been created directly by the agent, not via ```Task``` block),
            // create a new task entry in the current message
            if (!assistantMsg.activeTasks) {
              assistantMsg.activeTasks = [];
            }
            
            assistantMsg.activeTasks.push({
              id: event.data.task.id,
              kind: event.data.task.kind,
              params: event.data.task.params,
              status: 'in_progress',
              startTime: Date.now()
            });
          }
          break;
        case 'taskResult':
          // Update the task with the result
          const status = event.data.status === 'success' ? 'completed' : 'failed';
          const taskUpdated = this.updateTask(event.data.id, {
            status,
            output: event.data.output,
            error: event.data.error,
            endTime: Date.now()
          });

          // Si la tâche est terminée et qu'on n'avait qu'un message par défaut
          if (taskUpdated && status === 'completed' && assistantMsg.text === "Je vais traiter votre demande...") {
            // On remplace le message par défaut par le résultat
            if (event.data.output) {
              try {
                const weatherData = JSON.parse(event.data.output);
                assistantMsg.text = `Voici la météo que j'ai trouvée :\n` +
                  `Température : ${weatherData.temperature}\n` +
                  `Vent : ${weatherData.wind}\n` +
                  `Description : ${weatherData.description}\n\n` +
                  `Prévisions pour les prochains jours :\n` +
                  weatherData.forecast.map(day => 
                    `Jour ${day.day} : ${day.temperature}, Vent : ${day.wind}`
                  ).join('\n');
              } catch (e) {
                // Si ce n'est pas du JSON ou pas le format attendu, on affiche tel quel
                assistantMsg.text = `Voici le résultat : ${event.data.output}`;
              }
            }
          }
          break;
        case 'agentEnd':
          // Parse task directives from the final text as well
          if (event.data.finalText) {
            const parsedFinalText = this.parseTaskDirectives(event.data.finalText, assistantMsg);
            assistantMsg.text = parsedFinalText; // Overwrite with final, clean text
          }
          
          // Display final UI components if any
          if (event.data.finalUi && event.data.finalUi.length > 0) {
            assistantMsg.uiComponents = event.data.finalUi; // Replace with final UI set
          }
          
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
