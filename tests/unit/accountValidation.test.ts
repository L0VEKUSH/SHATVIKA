import { describe, expect, it } from 'vitest';
import { addressSchema, addressUpdateSchema } from '@/lib/addressValidation';

describe('customer account field allowlists', () => {
  const validAddress = {
    label: 'Home',
    street: '1 Test Street',
    city: 'Delhi',
    state: 'Delhi',
    zipCode: '110001',
    phone: '9999999999',
  };

  it('normalizes a supported address and rejects unknown fields', () => {
    expect(addressSchema.parse({ ...validAddress, label: ' Home ' })).toEqual({
      ...validAddress,
      isDefault: false,
    });
    expect(addressSchema.safeParse({ ...validAddress, userId: 'someone-else' }).success).toBe(false);
  });

  it('allows a bounded partial update but not an empty or malformed update', () => {
    expect(addressUpdateSchema.parse({ isDefault: true })).toEqual({ isDefault: true });
    expect(addressUpdateSchema.safeParse({}).success).toBe(false);
    expect(addressUpdateSchema.safeParse({ phone: '123' }).success).toBe(false);
    expect(addressUpdateSchema.safeParse({ zipCode: '<script>' }).success).toBe(false);
  });
});
