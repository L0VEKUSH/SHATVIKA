'use client';

import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AuthForm, FormField } from '@/components/AuthForm';
import { validateEmail } from '@/lib/validators';
import { useAuth } from '@/context/AuthContext';

export default function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();

  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const validateForm = useCallback(() => {
    const newErrors: Record<string, string> = {};

    const emailVal = validateEmail(formData.email);
    if (!emailVal.valid) newErrors.email = emailVal.error || '';

    if (!formData.password) {
      newErrors.password = 'Password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          rememberMe: formData.rememberMe,
        }),
      });

      const data = await response.json();

      if (!data.ok) {
        setApiError(data.message || 'Login failed. Please try again.');
        return;
      }

      await login(formData.email, formData.password, formData.rememberMe);
      const redirect = searchParams?.get('redirect') || '/customer/dashboard';
      router.push(redirect);
    } catch (err) {
      setApiError('An error occurred. Please try again.');
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [formData, validateForm, login, router, searchParams]);

  const fields: FormField[] = [
    {
      name: 'email',
      label: 'Email',
      type: 'email',
      value: formData.email,
      onChange: (val) => setFormData(prev => ({ ...prev, email: val })),
      placeholder: 'your@email.com',
      error: errors.email,
    },
    {
      name: 'password',
      label: 'Password',
      type: 'password',
      value: formData.password,
      onChange: (val) => setFormData(prev => ({ ...prev, password: val })),
      placeholder: 'Enter your password',
      error: errors.password,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 shadow-2xl">
          <h1 className="text-3xl font-bold text-white mb-2 text-center">Welcome Back</h1>
          <p className="text-gray-400 text-center mb-8">Sign in to your account to continue</p>

          {apiError && (
            <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {apiError}
            </div>
          )}

          <AuthForm
            fields={fields}
            isLoading={isLoading}
            onSubmit={handleSubmit}
            submitLabel="Sign In"
          />

          {/* Remember Me & Forgot Password */}
          <div className="mt-6 flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer hover:text-white transition">
              <input
                type="checkbox"
                checked={formData.rememberMe}
                onChange={(e) => setFormData(prev => ({ ...prev, rememberMe: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-600 bg-white/5 accent-orange-500"
              />
              <span>Remember me for 30 days</span>
            </label>
            <Link href="/auth/forgot-password" className="text-sm text-orange-400 hover:text-orange-300 transition">
              Forgot password?
            </Link>
          </div>

          {/* Divider */}
          <div className="my-6 relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-slate-900 text-gray-500">Don&apos;t have an account?</span>

            </div>
          </div>

          {/* Sign Up Link */}
          <Link
            href="/auth/signup"
            className="block w-full py-3 px-4 rounded-lg border border-orange-500/50 text-orange-400 font-medium text-center hover:bg-orange-500/10 transition"
          >
            Create Account
          </Link>
        </div>

        {/* Back to Home */}
        <div className="text-center mt-8">
          <Link href="/" className="text-gray-400 hover:text-white transition text-sm">
            ← Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
