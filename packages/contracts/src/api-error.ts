import { z } from 'zod';

/** One error envelope for the whole REST surface. */
export const apiErrorSchema = z.object({
  error: z.object({
    category: z.string(),
    message: z.string(),
    statusCode: z.number().int(),
    correlationId: z.string(),
    path: z.string(),
    timestamp: z.string().datetime(),
    details: z.record(z.unknown()).optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
