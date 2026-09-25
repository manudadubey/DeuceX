import type { MenuExtractionModelClient } from './menu-model-client';
import type { MenuModelOutput } from './menu-schema';

// PRD-07's Hotel Continental Sibiu sample (sections 4.1 and 8): fourteen
// dishes, Romanian and English, prices in lei, read for a pre-match night.
// It is the extractor's output only; which three become picks, and in what
// order, is rankMenu's job (FU-AC-4), with the player's own profile.
// Also the "Try the hotel menu in Sibiu" sample on the page, which never
// calls a model.
export const SIBIU_MENU_FIXTURE: MenuModelOutput = {
  readable: true,
  venueName: 'Hotel Continental Sibiu',
  venueType: 'restaurant',
  languages: ['ro', 'en'],
  menuCurrency: 'RON',
  dishes: [
    {
      original: 'Ciorbă de văcuță',
      english: 'Beef sour soup',
      gloss: 'Beef and vegetable soup soured with borș',
      price: 28,
      ingredientsReadable: true,
      contains: ['beef', 'celery'],
      traits: ['warm', 'lean_protein', 'light', 'salty'],
      why: 'Warm, salty and light: an easy way to top up if you are not very hungry.',
      asks: ['Bread on the side, please.'],
    },
    {
      original: 'Supă cremă de legume',
      english: 'Cream of vegetable soup',
      gloss: 'Blended vegetable soup finished with cream',
      price: 22,
      ingredientsReadable: true,
      contains: ['milk', 'celery'],
      traits: ['warm'],
      why: 'Gentle, but not much to it before a morning match.',
      asks: [],
    },
    {
      original: 'Salată grecească',
      english: 'Greek salad',
      gloss: 'Tomato, cucumber, olives and feta',
      price: 24,
      ingredientsReadable: true,
      contains: ['milk'],
      traits: ['light'],
      why: 'Fresh, but light on the carbohydrate you want tonight.',
      asks: ['Add bread, please.'],
    },
    {
      original: 'Salată de vinete',
      english: 'Aubergine spread with bread',
      gloss: 'Smoky aubergine spread served with bread',
      price: 18,
      ingredientsReadable: true,
      contains: ['gluten'],
      traits: ['light'],
      why: 'A starter rather than a meal.',
      asks: [],
    },
    {
      original: 'Sarmale cu mămăligă',
      english: 'Cabbage rolls with polenta',
      gloss: 'Cabbage rolls with polenta',
      price: 38,
      ingredientsReadable: true,
      contains: ['pork'],
      traits: ['heavy'],
      why: 'Rich and slow to digest.',
      asks: [],
    },
    {
      original: 'Mici cu muștar',
      english: 'Grilled minced-meat rolls with mustard',
      gloss: 'Grilled minced-meat rolls',
      price: 30,
      ingredientsReadable: true,
      contains: ['beef', 'lamb', 'mustard'],
      traits: ['heavy'],
      why: 'Fatty and slow to digest.',
      asks: [],
    },
    {
      original: 'Piept de pui la grătar cu orez',
      english: 'Grilled chicken breast with rice',
      gloss: 'Grilled chicken breast with plain rice',
      price: 42,
      ingredientsReadable: true,
      contains: ['poultry'],
      traits: ['lean_protein', 'carbohydrate', 'light'],
      why: 'Lean protein and plain carbohydrate, nothing that sits heavy at 10:00 tomorrow.',
      asks: ['Double rice, please.', 'Sauce on the side.'],
    },
    {
      original: 'Paste cu sos de roșii și busuioc',
      english: 'Pasta with tomato and basil sauce',
      gloss: 'Pasta in a tomato and basil sauce',
      price: 36,
      ingredientsReadable: true,
      contains: ['gluten'],
      traits: ['carbohydrate', 'light'],
      why: 'Familiar carbohydrate that is easy on the stomach the night before.',
      asks: ['No cream, please.', 'Can you add grilled chicken?'],
    },
    {
      original: 'Ciulama de ciuperci cu mămăligă',
      english: 'Mushrooms in white sauce with polenta',
      gloss: 'Mushrooms in a creamy white sauce with polenta',
      price: 32,
      ingredientsReadable: true,
      contains: ['milk', 'gluten'],
      traits: ['carbohydrate'],
      why: 'Carbohydrate, though the sauce is on the rich side.',
      asks: ['Light on the sauce, please.'],
    },
    {
      original: 'Friptură de vită cu legume',
      english: 'Beef steak with vegetables',
      gloss: 'Pan-fried beef steak with vegetables',
      price: 68,
      ingredientsReadable: true,
      contains: ['beef'],
      traits: ['lean_protein'],
      why: 'Good protein, but little carbohydrate for a morning match.',
      asks: ['Add potatoes, please.'],
    },
    {
      original: 'Omletă cu brânză',
      english: 'Cheese omelette',
      gloss: 'Omelette with cheese',
      price: 20,
      ingredientsReadable: true,
      contains: ['eggs', 'milk'],
      traits: ['lean_protein'],
      why: 'Fine, though more of a breakfast.',
      asks: [],
    },
    {
      original: 'Legume la grătar',
      english: 'Grilled vegetables',
      gloss: 'Seasonal grilled vegetables',
      price: 26,
      ingredientsReadable: true,
      contains: [],
      traits: ['light'],
      why: 'Light, but not enough on its own.',
      asks: [],
    },
    {
      original: 'Papanași',
      english: 'Fried doughnuts with sour cream and jam',
      gloss: 'Fried doughnuts with sour cream and jam',
      price: 22,
      ingredientsReadable: true,
      contains: ['gluten', 'eggs', 'milk'],
      traits: ['fried', 'sweet'],
      why: 'Save it for after you win.',
      asks: [],
    },
    {
      original: 'Clătite cu gem',
      english: 'Pancakes with jam',
      gloss: 'Thin pancakes with jam',
      price: 18,
      ingredientsReadable: true,
      contains: ['gluten', 'eggs', 'milk'],
      traits: ['sweet', 'carbohydrate'],
      why: 'Sweet carbohydrate if you still want something after dinner.',
      asks: [],
    },
  ],
};

// Mirrors receipt-mock-client.ts: a fixed fixture for tests and apps/api's
// dev-only fallback when OPENAI_API_KEY is unset.
export function createMockMenuExtractionClient(
  fixture: MenuModelOutput = SIBIU_MENU_FIXTURE,
): MenuExtractionModelClient {
  return {
    async complete() {
      return {
        raw: structuredClone(fixture),
        usage: { inputTokens: 3000, outputTokens: 1500 },
      };
    },
  };
}

export function createUnreadableMenuExtractionClient(): MenuExtractionModelClient {
  return {
    async complete() {
      return {
        raw: {
          readable: false,
          venueName: null,
          venueType: 'other',
          languages: [],
          menuCurrency: null,
          dishes: [],
        },
        usage: { inputTokens: 3000, outputTokens: 30 },
      };
    },
  };
}

export function createInvalidMenuExtractionClient(): MenuExtractionModelClient {
  return {
    async complete() {
      return { raw: { readable: 'yes' }, usage: { inputTokens: 3000, outputTokens: 10 } };
    },
  };
}
