import { createUiInferRouter } from '../../src/index.js';
import { defaultBlocks } from './definition.js'

/**
 * Example: Minimal end-to-end usage
 *
 * This example shows how to:
 * - Instantiate the router
 * - Set contextual headers
 * - Route a natural language prompt to a UI component with props
 * - Inspect conversation history and headers delta
 *
 * @example
 * // 1) Create router
 * const router = createUiInferRouter({
 *   componentDefault: 'HelpCard',
 *   components: [
 *     { id: 'EventCreateForm' },
 *     { id: 'EventEditor' },
 *     { id: 'HelpCard' }
 *   ]
 * });
 *
 * // 2) Set headers (route + method)
 * router.setHeaders({ currentPath: 'event', method: 'POST', locale: 'en-US' });
 *
 * // 3) Ask something in natural language
 * const result = await router.route({ prompt: 'create a meeting tomorrow at 9am' });
 * // -> { componentId: 'EventCreateForm', props: { title, start, ... }, message }
 *
 * // 4) Check history and the last headers delta
 * const history = router.getHistory();
 * const delta = router.getLastHeadersDelta();
 */

// Exemple d'historique de conversation existant avec headers
const existingHistory = [
  {
    role: 'user',
    content: 'Bonjour, je veux créer un événement',
    timestamp: '2025-01-27T10:00:00Z',
    headers: {
      currentPath: 'event',
      method: 'POST',
      locale: 'fr-FR'
    }
  },
  {
    role: 'assistant',
    content: '{"componentId":"EventCreateForm","props":{"message":"Parfait ! Je vais t\'aider à créer un événement. Peux-tu me dire quel type d\'événement tu veux organiser ?"}}',
    timestamp: '2025-01-27T10:00:05Z',
    headers: {
      currentPath: 'event',
      method: 'POST',
      locale: 'fr-FR'
    }
  }
];

/**
 * Helper function to generate block item schema metadata from block definitions
 * 
 * @description
 * Converts block definitions into itemSchema format that can be used
 * with ComponentProperty.itemSchema to provide detailed schema information
 * to the LLM for generating complex array structures.
 * 
 * @example
 * ```typescript
 * const itemSchema = generateBlockItemSchema(defaultBlocks);
 * const property = {
 *   name: 'blocks',
 *   type: 'array',
 *   description: 'Array of blocks',
 *   itemSchema: itemSchema
 * };
 * ```
 * 
 * @param blocks - Array of block definitions from definition.ts
 * @returns ItemSchema metadata with available types, structure, and examples
 */
function generateBlockItemSchema(blocks) {
  // Convert blocks to availableTypes format
  const availableTypes = blocks.map(block => ({
    type: block.type,
    label: block.label,
    description: block.description,
    schema: block.schema || null
  }));

  // Generate example blocks
  const examples = [];
  
  // Example: show_text block (with schema)
  examples.push({
    id: 'block_1',
    type: 'show_text',
    data: {
      text: 'Welcome to the shop!',
      speaker: 'Merchant',
      position: 'bottom'
    },
    level: 0
  });
  
  // Example: show_choices block (with schema)
  examples.push({
    id: 'block_2',
    type: 'show_choices',
    data: {
      question: 'What would you like to do?',
      choices: [
        { text: 'Buy items', condition: '' },
        { text: 'Sell items', condition: '' },
        { text: 'Leave', condition: '' }
      ]
    },
    level: 0
  });
  
  // Example: set_variable block (with schema)
  examples.push({
    id: 'block_3',
    type: 'set_variable',
    data: {
      variableId: 'player_gold',
      operation: 'add',
      value: '100'
    },
    level: 0
  });
  
  // Example: loop block (with schema)
  examples.push({
    id: 'block_4',
    type: 'loop',
    data: {
      type: 'count',
      count: 3
    },
    level: 0
  });
  
  // Example: conditional_branch block (no schema - empty data)
  examples.push({
    id: 'block_5',
    type: 'conditional_branch',
    data: {},
    level: 0
  });

  return {
    availableTypes,
    itemStructure: {
      requiredFields: ['id', 'type', 'data'],
      optionalFields: ['level']
    },
    examples
  };
}

const router = createUiInferRouter({
  model: 'gpt-5-nano',
  timezone: 'Europe/Paris',
  componentDefault: 'HelpCard',
 // initialHistory: existingHistory,
  components: [
    {
      id: 'GenerateBlocks',
      description: `Generate blocks for a specific trigger based on description. Available block types: ${defaultBlocks.map(b => `${b.type} (${b.label})`).join(', ')}. Each block must match its schema definition exactly from @common/blocks/definitions.ts.`,
      properties: [
        {
          name: 'description',
          type: 'string',
          description: 'Description of what should happen in this trigger',
          required: true,
          examples: [
            'Show a welcome message and set up the merchant inventory',
            'Display dialogue and show choices to buy items',
            'Open the chest and give the player an item'
          ]
        },
        {
          name: 'blocks',
          type: 'array',
          description: `Array of block instances to be created. You MUST use only block types from: ${defaultBlocks.map(b => b.type).join(', ')}.`,
          required: true,
          itemSchema: generateBlockItemSchema(defaultBlocks)
        }
      ],
      contexts: [
        { currentPath: 'blocks/generate', methods: ['POST'] }
      ],
      defaultPath: 'blocks/generate',
      defaultMethod: 'POST'
    }
  ]
});

let out1 = await router.route({ prompt: 'générer des blocks: un perso dit bonjour' });

console.log(JSON.stringify(out1, null, 2));