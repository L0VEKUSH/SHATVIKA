'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { ApiClientError, apiRequest, clearApiClientSession } from '@/lib/apiClient';

export interface Customer {
  id: string;
  email: string;
  fullName: string;
  phone?: string;
  profilePhoto?: string;
  addresses?: Array<{
    label: string;
    street: string;
    city: string;
    state: string;
    zipCode: string;
    phone: string;
    isDefault: boolean;
  }>;
  joinedDate: string;
  createdAt?: string;
  updatedAt?: string;
}

interface AuthContextType {
  customer: Customer | null;
  isLoading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  
  // Auth functions
  login: (email: string, password: string, rememberMe: boolean) => Promise<void>;
  signup: (fullName: string, email: string, phone: string, password: string, confirmPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshCustomer: () => Promise<void>;
  
  // Profile functions
  updateProfile: (data: { fullName?: string; phone?: string; profilePhoto?: string }) => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCurrentCustomer = useCallback(async (options?: { initial?: boolean }) => {
    try {
      const data = await apiRequest<{ ok: true; user: Customer }>('/api/auth/me', {
        suppressSessionExpiry: true,
        cache: 'no-store',
      });
      setCustomer(data.user);
      setError(null);
    } catch (caught) {
      if (caught instanceof ApiClientError && caught.status === 401) {
        setCustomer(null);
        setError(null);
        return;
      }
      if (options?.initial) setCustomer(null);
      setError('Your account status could not be checked. Please try again.');
    }
  }, []);

  // Fetch the current customer on mount and react to expiry/logout in another tab.
  useEffect(() => {
    const initAuth = async () => {
      try {
        setIsLoading(true);
        await loadCurrentCustomer({ initial: true });
      } finally {
        setIsLoading(false);
      }
    };

    const expire = () => {
      setCustomer(null);
      setError(null);
      setIsLoading(false);
    };
    window.addEventListener('shatvika:session-expired', expire);
    void initAuth();
    return () => window.removeEventListener('shatvika:session-expired', expire);
  }, [loadCurrentCustomer]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const login = useCallback(
    async (email: string, password: string, rememberMe: boolean) => {
      try {
        setError(null);
        setIsLoading(true);

        await apiRequest<{ ok: true }>('/api/auth/login', {
          method: 'POST',
          body: { email, password, rememberMe },
          suppressSessionExpiry: true,
        });
        await loadCurrentCustomer();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [loadCurrentCustomer]
  );

  const signup = useCallback(
    async (fullName: string, email: string, phone: string, password: string, confirmPassword: string) => {
      try {
        setError(null);
        setIsLoading(true);

        await apiRequest<{ ok: true }>('/api/auth/signup', {
          method: 'POST',
          body: { fullName, email, phone, password, confirmPassword },
          suppressSessionExpiry: true,
        });
        await loadCurrentCustomer();
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [loadCurrentCustomer]
  );

  const logout = useCallback(async () => {
    try {
      setError(null);
      setIsLoading(true);

      await apiRequest<{ ok: true }>('/api/auth/logout', {
        method: 'POST',
      });
      setCustomer(null);
      clearApiClientSession();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Logout failed';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshCustomer = useCallback(async () => {
    try {
      setError(null);
      await loadCurrentCustomer();
    } catch {
      // loadCurrentCustomer exposes a user-safe error and preserves state on
      // transient failures.
    }
  }, [loadCurrentCustomer]);

  const updateProfile = useCallback(
    async (data: { fullName?: string; phone?: string; profilePhoto?: string }) => {
      try {
        setError(null);
        const responseData = await apiRequest<{ ok: true; user: Customer }>('/api/user/profile', {
          method: 'PUT',
          body: data,
        });
        setCustomer(responseData.user);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred';
        setError(message);
        throw err;
      }
    },
    []
  );

  const value: AuthContextType = {
    customer,
    isLoading,
    error,
    isAuthenticated: !!customer,
    login,
    signup,
    logout,
    refreshCustomer,
    updateProfile,
    clearError,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
