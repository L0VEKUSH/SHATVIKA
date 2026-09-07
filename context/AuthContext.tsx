'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';

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

  // Fetch current customer on mount
  useEffect(() => {
    const initAuth = async () => {
      try {
        setIsLoading(true);
        const res = await fetch('/api/auth/me', {
          credentials: 'include',
        });

        if (res.ok) {
          const data = await res.json();
          if (data.user) {
            setCustomer(data.user);
            setError(null);
          }
        }
      } catch (err) {
        console.error('Failed to fetch auth user:', err);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const login = useCallback(
    async (email: string, password: string, rememberMe: boolean) => {
      try {
        setError(null);
        setIsLoading(true);

        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, rememberMe }),
          credentials: 'include',
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Login failed');
        }

        // Fetch updated customer data
        const meRes = await fetch('/api/auth/me', {
          credentials: 'include',
        });

        if (meRes.ok) {
          const data = await meRes.json();
          if (data.user) {
            setCustomer(data.user);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const signup = useCallback(
    async (fullName: string, email: string, phone: string, password: string, confirmPassword: string) => {
      try {
        setError(null);
        setIsLoading(true);

        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName, email, phone, password, confirmPassword }),
          credentials: 'include',
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Signup failed');
        }

        // Fetch customer data
        const meRes = await fetch('/api/auth/me', {
          credentials: 'include',
        });

        if (meRes.ok) {
          const data = await meRes.json();
          if (data.user) {
            setCustomer(data.user);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'An error occurred';
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      setError(null);
      setIsLoading(true);

      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });

      setCustomer(null);
    } catch (err) {
      console.error('Logout error:', err);
      setCustomer(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshCustomer = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/auth/me', {
        credentials: 'include',
      });

      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setCustomer(data.user);
        }
      } else {
        setCustomer(null);
      }
    } catch (err) {
      console.error('Failed to refresh customer:', err);
      setCustomer(null);
    }
  }, []);

  const updateProfile = useCallback(
    async (data: { fullName?: string; phone?: string; profilePhoto?: string }) => {
      try {
        setError(null);
        const res = await fetch('/api/user/profile', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          credentials: 'include',
        });

        if (!res.ok) {
          const responseData = await res.json();
          throw new Error(responseData.error || 'Failed to update profile');
        }

        const responseData = await res.json();
        if (responseData.user) {
          setCustomer(responseData.user);
        }
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
