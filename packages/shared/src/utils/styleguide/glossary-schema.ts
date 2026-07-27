import { z } from 'zod'
import type { DoNotTranslateEntry, GlossaryEntry } from '@repo/types/config.types'

const glossaryLocaleValueSchema = z.union([
  z.string(),
  z.object({
    preferred: z.string(),
    deprecated: z.array(z.string()).optional(),
  }),
])

const glossaryEntrySchema: z.ZodType<GlossaryEntry, z.ZodTypeDef, unknown> = z.object({
  definition: z.string().min(1),
  terms: z.record(z.string(), glossaryLocaleValueSchema),
})

export const glossarySchema = z.array(glossaryEntrySchema)

const doNotTranslateEntrySchema: z.ZodType<DoNotTranslateEntry, z.ZodTypeDef, unknown> = z.object({
  term: z.string().min(1),
  caseSensitive: z.boolean().optional(),
  definition: z.string().optional(),
})

export const doNotTranslateSchema = z.array(doNotTranslateEntrySchema)
