'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthForm, FormField } from '@/components/AuthForm';
import { validateEmail, validatePassword, validatePhone, validateFullName } from '@/lib/validators';
import { useAuth } from '@/context/AuthContext';

export default function SignupPage() {
  const router = useRouter();
  const { signup } = useAuth();

  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const validateForm = useCallback(() => {
    const newErrors: Record<string, string> = {};

    const fullNameVal = validateFullName(formData.fullName);
    if (!fullNameVal.valid) newErrors.fullName = fullNameVal.error || '';

    const emailVal = validateEmail(formData.email);
    if (!emailVal.valid) newErrors.email = emailVal.error || '';

    const phoneVal = validatePhone(formData.phone);
    if (!phoneVal.valid) newErrors.phone = phoneVal.error || '';

    const passwordVal = validatePassword(formData.password);
    if (!passwordVal.valid) newErrors.password = 'Password does not meet requirements';

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleFieldChange = useCallback((name: string, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  }, [errors]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);

    if (!validateForm()) {
      return;
    }

    try {
      setIsLoading(true);
      await signup(formData.fullName, formData.email, formData.phone, formData.password, formData.confirmPassword);
      router.push('/customer/dashboard');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create account';
      setApiError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const fields: FormField[] = [
    {
      name: 'fullName',
      label: 'Full Name',
      type: 'text',
      placeholder: 'John Doe',
      value: formData.fullName,
      error: errors.fullName,
      validation: validateFullName,
      showFeedback: true,
      required: true,
    },
    {
      name: 'email',
      label: 'Email Address',
      type: 'email',
      placeholder: 'you@example.com',
      value: formData.email,
      error: errors.email,
      validation: validateEmail,
      showFeedback: true,
      required: true,
    },
    {
      name: 'phone',
      label: 'Phone Number',
      type: 'tel',
      placeholder: '9876543210',
      value: formData.phone,
      error: errors.phone,
      validation: validatePhone,
      showFeedback: true,
      required: true,
    },
    {
      name: 'password',
      label: 'Password',
      type: 'password',
      placeholder: 'Min 8 chars, 1 upper, 1 lower, 1 number, 1 special',
      value: formData.password,
      error: errors.password,
      validation: validatePassword,
      showFeedback: true,
      required: true,
    },
    {
      name: 'confirmPassword',
      label: 'Confirm Password',
      type: 'password',
      placeholder: 'Re-enter your password',
      value: formData.confirmPassword,
      error: errors.confirmPassword,
      required: true,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Create Account</h1>
          <p className="text-gray-600 dark:text-gray-400">Join us to order delicious food</p>
        </div>

        <AuthForm
          fields={fields}
          onFieldChange={handleFieldChange}
          onSubmit={handleSubmit}
          isLoading={isLoading}
          error={apiError}
          submitLabel="Create Account"
          footerText={
            <div className="space-y-2">
              <p>
                Already have an account?{' '}
                <Link href="/auth/login" className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                  Login here
                </Link>
              </p>
            </div>
          }
        />
      </div>
    </div>
  );
}
