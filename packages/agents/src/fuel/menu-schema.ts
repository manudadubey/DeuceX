import { z } from 'zod';
import { CONTAINS_TAGS, DISH_TRAITS } from './types';

export const MENU_EXTRACTION_SCHEMA_VERSION = 'v1';

const dishSchema = z.object({
  original: z.string().min(1),
  english: z.string().min(1),
  /** One-line description of the dish in English, used in "Not tonight". */
  gloss: z.string(),
  price: z.number().positive().nullable(),
  ingredientsReadable: z.boolean(),
  contains: z.array(z.enum(CONTAINS_TAGS)),
  traits: z.array(z.enum(DISH_TRAITS)),
  why: z.string().min(1).max(240),
  asks: z.array(z.string().min(1).max(80)).max(3),
});

export const menuModelOutputSchema = z.object({
  readable: z.boolean(),
  venueName: z.string().nullable(),
  venueType: z.enum(['restaurant', 'room-service', 'shop', 'other']),
  languages: z.array(z.string().length(2)),
  menuCurrency: z
    .string()
    .length(3)
    .transform((c) => c.toUpperCase())
    .nullable(),
  dishes: z.array(dishSchema),
});

export type MenuModelOutput = z.infer<typeof menuModelOutputSchema>;
export type MenuDish = MenuModelOutput['dishes'][number];
