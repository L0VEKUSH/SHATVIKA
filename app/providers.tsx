'use client';

import { ReactNode } from 'react';
import { CartProvider } from '@/context/CartContext';
import { AdminProvider } from '@/context/AdminContext';
import { AuthProvider } from '@/context/AuthContext';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <AdminProvider>
        <CartProvider>
          {children}
        </CartProvider>
      </AdminProvider>
    </AuthProvider>
  );
}
