import { z } from "zod";

// Keep the collection limit on the array so Zod rejects excess entries before parsing them.
export const qrContentsSchema = z.array(z.string().max(4096)).max(16).default([])
  .refine((values) => values.reduce((sum, value) => sum + value.length, 0) <= 16384);
