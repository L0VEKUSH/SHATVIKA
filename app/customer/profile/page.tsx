'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { validateFullName, validatePhone } from '@/lib/validators';

export default function ProfilePage() {
  const { customer, isLoading, error, updateProfile, logout, refreshCustomer } = useAuth();
  
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    fullName: '',
    phone: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  useEffect(() => {
    if (customer) {
      setFormData({
        fullName: customer.fullName,
        phone: customer.phone || '',
      });
    }
  }, [customer]);

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (formData.fullName !== customer?.fullName) {
      const val = validateFullName(formData.fullName);
      if (!val.valid) newErrors.fullName = val.error || '';
    }

    if (formData.phone !== (customer?.phone || '')) {
      const val = validatePhone(formData.phone);
      if (!val.valid) newErrors.phone = val.error || '';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    setSubmitError(null);
    setSubmitSuccess(false);

    if (!validateForm()) {
      return;
    }

    try {
      setIsSubmitting(true);
      const updates: Record<string, string> = {};
      
      if (formData.fullName !== customer?.fullName) {
        updates.fullName = formData.fullName;
      }
      if (formData.phone !== (customer?.phone || '')) {
        updates.phone = formData.phone;
      }

      if (Object.keys(updates).length > 0) {
        await updateProfile(updates);
        setSubmitSuccess(true);
        setIsEditing(false);
        setTimeout(() => setSubmitSuccess(false), 3000);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update profile';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (customer) {
      setFormData({
        fullName: customer.fullName,
        phone: customer.phone || '',
      });
    }
    setIsEditing(false);
    setErrors({});
    setSubmitError(null);
  };

  const handleLogout = async () => {
    await logout();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-700 dark:text-gray-300">Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-700 dark:text-gray-300 mb-4">Not authenticated</p>
          <Link href="/auth/login" className="text-blue-600 hover:text-blue-700 dark:text-blue-400">
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 sm:p-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Profile</h1>
            <Link href="/customer/addresses" className="text-sm bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg">
              Manage Addresses
            </Link>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {submitError && (
            <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-700 dark:text-red-300">{submitError}</p>
            </div>
          )}

          {submitSuccess && (
            <div className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <p className="text-sm text-green-700 dark:text-green-300">Profile updated successfully!</p>
            </div>
          )}

          {/* Profile Photo Section */}
          <div className="mb-8 pb-8 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-2xl font-bold">
                {customer.fullName.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Profile Photo</p>
                <button className="mt-2 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                  Change Photo
                </button>
              </div>
            </div>
          </div>

          {/* Profile Details Section */}
          <div className="mb-8">
            {isEditing ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={formData.fullName}
                    onChange={e => handleChange('fullName', e.target.value)}
                    className={`w-full px-4 py-2 rounded-lg border transition-colors
                      ${
                        errors.fullName
                          ? 'border-red-500 dark:border-red-500 bg-red-50 dark:bg-red-900/10'
                          : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
                      }
                      text-gray-900 dark:text-gray-100
                      focus:outline-none focus:ring-2 focus:ring-blue-500
                    `}
                  />
                  {errors.fullName && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.fullName}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Email (Read-only)
                  </label>
                  <input
                    type="email"
                    value={customer.email}
                    disabled
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Phone
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={e => handleChange('phone', e.target.value)}
                    className={`w-full px-4 py-2 rounded-lg border transition-colors
                      ${
                        errors.phone
                          ? 'border-red-500 dark:border-red-500 bg-red-50 dark:bg-red-900/10'
                          : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700'
                      }
                      text-gray-900 dark:text-gray-100
                      focus:outline-none focus:ring-2 focus:ring-blue-500
                    `}
                  />
                  {errors.phone && (
                    <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.phone}</p>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={handleSave}
                    disabled={isSubmitting}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={handleCancel}
                    disabled={isSubmitting}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 font-semibold py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Full Name</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{customer.fullName}</p>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Email</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">{customer.email}</p>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Phone</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {customer.phone ? `+91 ${customer.phone}` : 'Not set'}
                    </p>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Joined</p>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white">
                      {new Date(customer.joinedDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsEditing(true)}
                  className="w-full mt-6 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                >
                  Edit Profile
                </button>
              </div>
            )}
          </div>

          {/* Danger Zone */}
          <div className="pt-8 border-t border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={handleLogout}
                className="bg-red-600 hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                Logout
              </button>
              <Link
                href="/customer/change-password"
                className="text-center bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 font-semibold py-2 px-4 rounded-lg transition-colors"
              >
                Change Password
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
