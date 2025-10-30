import { createUiInferRouter } from '../../src/index.js';

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

const router = createUiInferRouter({
  model: 'gpt-5-nano',
  timezone: 'Europe/Paris',
  componentDefault: 'HelpCard',
 // initialHistory: existingHistory,
  components: [
     {
      id: 'MainPage',
      version: '1.0.0',
      description: 'Composant pour afficher la page principale/acceuil de l\'application',
      contexts: [{ currentPath: 'main', methods: ['GET'] }]
    },
    {
      id: 'EventListView',
      version: '1.0.0',
      description: 'Composant pour afficher une liste d\'événements (filtrables par date, participant, etc.)',
      properties: [
        {
          name: 'filter',
          type: 'object',
          description: 'Filtres pour la liste d\'événements',
          required: false,
          examples: [
            { date: '2025-01-27' },
            { today: true },
            { attendee: 'john@example.com' }
          ]
        }
      ],
      contexts: [{ currentPath: 'event', methods: ['GET'] }]
    },
    {
      id: 'EventDetailView',
      version: '1.0.0',
      description: 'Composant pour afficher les détails d\'un événement spécifique (nécessite un eventId)',
      properties: [
        {
          name: 'eventId',
          type: 'string',
          description: 'Identifiant unique de l\'événement à afficher',
          required: true,
          examples: ['46792', 'event-123', 'meeting-456']
        },
        {
          name: 'title',
          type: 'string',
          description: 'Titre de l\'événement',
          required: true,
          examples: ['Réunion équipe', 'Déjeuner client', 'Formation technique']
        },
        {
          name: 'start',
          type: 'string',
          description: 'Date et heure de début au format ISO 8601',
          required: true,
          examples: ['2025-10-30T15:00:00+01:00', '2025-11-01T09:30:00+01:00']
        },
        {
          name: 'attendees',
          type: 'array',
          description: 'Liste des participants (emails)',
          required: false,
          examples: [['john@example.com', 'jane@example.com'], ['paul@company.com']]
        }
      ],
      contexts: [{ currentPath: 'event', methods: ['GET'] }]
    },
    {
      id: 'EventEditor',
      version: '1.1.0',
      description: 'Composant pour modifier un événement existant',
      properties: [
        {
          name: 'eventId',
          type: 'string',
          description: 'Identifiant unique de l\'événement à modifier',
          required: true,
          examples: ['46792', 'event-123']
        },
        {
          name: 'title',
          type: 'string',
          description: 'Nouveau titre de l\'événement',
          required: false,
          examples: ['Réunion équipe mise à jour', 'Déjeuner client reporté']
        },
        {
          name: 'start',
          type: 'string',
          description: 'Nouvelle date et heure de début au format ISO 8601',
          required: false,
          examples: ['2025-10-31T15:00:00+01:00', '2025-11-02T14:30:00+01:00']
        },
        {
          name: 'durationMinutes',
          type: 'number',
          description: 'Durée de l\'événement en minutes',
          required: false,
          examples: [60, 90, 120, 30]
        },
        {
          name: 'attendees',
          type: 'array',
          description: 'Liste mise à jour des participants (emails)',
          required: false,
          examples: [['john@example.com', 'jane@example.com', 'sophie@example.com']]
        },
        {
          name: 'message',
          type: 'string',
          description: 'Message naturel du chatbot expliquant ce qu\'il a fait',
          required: false,
          examples: ['J\'ai modifié l\'événement pour toi', 'Parfait, j\'ai créé la réunion', 'J\'ai ajouté Sophie à la liste des participants']
        }
      ],
      contexts: [{ currentPath: 'event', methods: ['PUT','PATCH'] }]
    },
    {
      id: 'EventCreateForm',
      version: '1.2.0',
      description: 'Composant pour créer un nouvel événement',
      properties: [
        {
          name: 'title',
          type: 'string',
          description: 'Titre du nouvel événement',
          required: true,
          examples: ['Nouvelle réunion', 'Déjeuner d\'équipe', 'Formation React']
        },
        {
          name: 'start',
          type: 'string',
          description: 'Date et heure de début au format ISO 8601',
          required: true,
          examples: ['2025-11-05T10:00:00+01:00', '2025-11-10T14:00:00+01:00']
        },
        {
          name: 'durationMinutes',
          type: 'number',
          description: 'Durée de l\'événement en minutes',
          required: false,
          examples: [60, 90, 120, 30]
        },
        {
          name: 'attendees',
          type: 'array',
          description: 'Liste des participants (emails)',
          required: false,
          examples: [['john@example.com', 'jane@example.com'], ['paul@company.com', 'marie@company.com']]
        },
        {
          name: 'message',
          type: 'string',
          description: 'Message naturel du chatbot expliquant ce qu\'il a fait',
          required: false,
          examples: ['Super ! J\'ai créé ton nouvel événement', 'C\'est fait, la réunion est programmée', 'Parfait, j\'ai ajouté la formation React à ton calendrier']
        }
      ],
      contexts: [{ currentPath: 'event', methods: ['POST'] }]
    },
    { 
      id: 'HelpCard', 
      version: '1.0.0',
      description: 'Composant d\'aide quand l\'intention n\'est pas claire',
      // When selected, switch away from event routes
      defaultPath: 'smalltalk',
      defaultMethod: 'GET',
      properties: [
        {
          name: 'message',
          type: 'string',
          description: 'Juste répondre à la question de l\'utilisateur',
          required: true
        }
      ]
    }
  ]
});

let out1 = await router.route({ prompt: 'Quel est la page principale ?' });

console.log(out1);

let out2 = await router.route({ prompt: 'Donne moi les événements du jour' });

console.log(out2);