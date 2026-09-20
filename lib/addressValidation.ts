import { z } from 'zod';

const requiredAddressFields = z.object({
  label: z.string().trim().min(1).max(40),
  street: z.string().trim().min(3).max(200),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().min(1).max(80),
  zipCode: z.string().trim().min(3).max(12).regex(/^[A-Za-z0-9 -]+$/),
  phone: z.string().trim().regex(/^\d{10,15}$/),
}).strict();

export const addressSchema = requiredAddressFields.extend({
  isDefault: z.boolean().optional().default(false),
}).strict();

export const addressUpdateSchema = requiredAddressFields
  .partial()
  .extend({ isDefault: z.boolean().optional() })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'At least one address field is required');
