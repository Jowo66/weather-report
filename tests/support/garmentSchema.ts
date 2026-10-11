import { z } from 'zod';

const zone = z.enum(['head', 'torso', 'arms', 'hands', 'legs', 'feet']);
const unit = z.number().min(0).max(1);

/** Zod schema for src/data/garments.json (TDD §5.1); enforced in CI by the unit tests. */
export const GarmentDefSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]*$/),
    name: z.string().min(1),
    category: z.enum(['top', 'bottom', 'outer', 'head', 'neck', 'hands', 'socks', 'footwear']),
    slot: z.enum([
      'torso_base',
      'torso_mid',
      'torso_insulation',
      'torso_outer',
      'legs_base',
      'legs_outer',
      'head',
      'neck',
      'hands',
      'socks',
      'footwear',
    ]),
    layer: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    clo: z.number().positive().max(2),
    cloSource: z.enum(['ASHRAE55', 'ISO9920', 'estimate']),
    coverage: z
      .partialRecord(zone, unit)
      .refine((c) => Object.keys(c).length > 0, 'covers no zone'),
    i_m: z.number().min(0.05).max(1),
    windproof: z.boolean(),
    waterproof: z.boolean(),
    wetLoss: unit,
    eligibleMaxT: z.number().optional(),
    eligibleMinT: z.number().optional(),
    mesh: z.object({ glb: z.string(), hidesBody: z.array(zone), shapeKeys: z.literal(true) }),
    tint: z.object({ default: z.string().regex(/^#[0-9a-f]{6}$/i), dyeable: z.boolean() }),
  })
  .strict();

export const GarmentCatalogueSchema = z.array(GarmentDefSchema).length(20);
