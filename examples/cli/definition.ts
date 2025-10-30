
export const defaultBlocks = [
  // Message & Dialog Blocks
  {
    type: 'show_text',
    label: 'Show Text',
    description: 'Display a message dialog to the player',
    category: 'message',
    icon: '💬',
    schema: {
      type: 'object',
      properties: {
        text: { 
          type: 'string', 
          title: 'Message Text',
          description: 'The text to display in the dialog',
          format: 'textarea'
        },
        speaker: { 
          type: 'string', 
          title: 'Speaker Name',
          description: 'Name of the character speaking (optional)',
          $ref: '#/functions/event'
        },
        position: {
          type: 'string',
          title: 'Dialog Position',
          enum: ['top', 'middle', 'bottom'],
          default: 'bottom'
        }
      },
      required: ['text']
    }
  },

  {
    type: 'show_choices',
    label: 'Show Choices',
    description: 'Present multiple choice options to the player',
    category: 'message',
    icon: '🔀',
    outputs: ['choice1', 'choice2', 'choice3', 'choice4'],
    canHaveChildren: true,
    schema: {
      type: 'object',
      properties: {
        question: { 
          type: 'string', 
          title: 'Question Text',
          description: 'The question to ask the player'
        },
        choices: {
          type: 'array',
          title: 'Choice Options',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', title: 'Choice Text' },
              condition: { type: 'string', title: 'Show Condition (optional)' }
            }
          },
          minItems: 2,
          maxItems: 4
        }
      },
      required: ['question', 'choices']
    }
  },

  // Control Flow Blocks
  {
    type: 'conditional_branch',
    label: 'Conditional Branch',
    description: 'Execute different actions based on a condition',
    category: 'control',
    icon: '🔀',
    outputs: ['true', 'false'],
    canHaveChildren: true
  },


  {
    type: 'loop',
    label: 'Loop',
    description: 'Repeat actions multiple times or while a condition is true',
    category: 'control',

    icon: '🔄',
    canHaveChildren: true,
    schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          title: 'Loop Type',
          enum: ['count', 'while', 'infinite'],
          default: 'count'
        },
        count: { 
          type: 'number', 
          title: 'Repeat Count',
          minimum: 1,
          default: 1
        },
        condition: { 
          type: 'string', 
          title: 'While Condition',
          description: 'Condition for while loop'
        }
      }
    }
  },

  {
    type: 'break_loop',
    label: 'Break Loop',
    description: 'Exit the current loop',
    category: 'control',

    icon: '⏹️',
    schema: {
      type: 'object',
      properties: {}
    }
  },

  {
    type: 'wait',
    label: 'Wait',
    description: 'Pause execution for a specified duration',
    category: 'control',

    icon: '⏸️',
    schema: {
      type: 'object',
      properties: {
        duration: {
          type: 'number',
          title: 'Wait Duration (seconds)',
          minimum: 0.1,
          default: 1
        }
      },
      required: ['duration']
    }
  },

  // Variable & Data Blocks
  {
    type: 'set_variable',
    label: 'Set Variable',
    description: 'Set the value of a game variable',
    category: 'variable',

    icon: '📝',
    schema: {
      type: 'object',
      properties: {
        variableId: {
          type: 'string',
          title: 'Variable',
          description: 'Select a variable from the database',
          $ref: '#/functions/variable',
          format: 'add'
        },
        operation: {
          type: 'string',
          title: 'Operation',
          enum: ['set', 'add', 'subtract', 'multiply', 'divide', 'modulo'],
          default: 'set'
        },
        value: {
          type: 'string',
          title: 'Value',
          description: 'Value to assign (can be number, string, or expression)'
        }
      },
      required: ['variableId', 'value']
    }
  },

  {
    type: 'set_switch',
    label: 'Set Switch',
    description: 'Turn a game switch ON or OFF',
    category: 'variable',

    icon: '🔘',
    schema: {
      type: 'object',
      properties: {
        switchName: {
          type: 'string',
          title: 'Switch Name',
          description: 'Name of the switch to control',
          $ref: '#/functions/variable'
        },
        value: {
          type: 'boolean',
          title: 'Switch Value',
          description: 'Turn switch ON (true) or OFF (false)',
          default: true
        }
      },
      required: ['switchName', 'value']
    }
  },

  {
    type: 'change_gold',
    label: 'Change Gold',
    description: 'Modify the player\'s gold amount',
    category: 'variable',
    icon: '💰',
  }
]