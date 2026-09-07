'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { validatePhone } from '@/lib/validators';

interface Address {
  _id?: string;
  label: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string;
  isDefault: boolean;
}

export default function AddressesPage() {
  const { customer, isLoading } = useAuth();
  
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    label: '',
    street: '',
    city: '',
    state: '',
    zipCode: '',
    phone: '',
    isDefault: false,
  });

  // Fetch addresses
  useEffect(() => {
    const loadAddresses = async () => {
      try {
        setIsLoadingAddresses(true);
        const res = await fetch('/api/user/addresses', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setAddresses(data.addresses || []);
        }
      } catch (err) {
        console.error('Failed to load addresses:', err);
      } finally {
        setIsLoadingAddresses(false);
      }
    };

    if (customer) {
      loadAddresses();
    }
  }, [customer]);

  const resetForm = () => {
    setFormData({
      label: '',
      street: '',
      city: '',
      state: '',
      zipCode: '',
      phone: '',
      isDefault: false,
    });
    setErrors({});
    setEditingId(null);
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.label.trim()) newErrors.label = 'Label is required';
    if (!formData.street.trim()) newErrors.street = 'Street is required';
    if (!formData.city.trim()) newErrors.city = 'City is required';
    if (!formData.state.trim()) newErrors.state = 'State is required';
    if (!formData.zipCode.trim()) newErrors.zipCode = 'Zip code is required';

    const phoneVal = validatePhone(formData.phone);
    if (!phoneVal.valid) newErrors.phone = phoneVal.error || '';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmitAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    setSuccess(null);

    if (!validateForm()) return;

    try {
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId ? `/api/user/addresses/${editingId}` : '/api/user/addresses';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          phone: formData.phone.replace(/\D/g, ''),
        }),
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save address');
      }

      const data = await res.json();
      setAddresses(data.addresses || []);
      setSuccess(editingId ? 'Address updated!' : 'Address added!');
      resetForm();
      setShowAddForm(false);

      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to save address';
      setApiError(message);
    }
  };

  const handleEditAddress = (address: Address) => {
    setFormData({
      label: address.label,
      street: address.street,
      city: address.city,
      state: address.state,
      zipCode: address.zipCode,
      phone: address.phone,
      isDefault: address.isDefault,
    });
    setEditingId(address._id || null);
    setShowAddForm(true);
  };

  const handleDeleteAddress = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this address?')) return;

    try {
      setApiError(null);
      const res = await fetch(`/api/user/addresses/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete address');
      }

      setAddresses(addresses.filter(a => a._id !== id));
      setSuccess('Address deleted!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete address';
      setApiError(message);
    }
  };

  const handleSetDefault = async (id: string) => {
    try {
      setApiError(null);
      const res = await fetch(`/api/user/addresses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to set default');
      }

      setAddresses(prev =>
        prev.map(a => ({
          ...a,
          isDefault: a._id === id,
        }))
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to set default';
      setApiError(message);
    }
  };

  if (isLoading || isLoadingAddresses) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
          <p className="text-gray-700 dark:text-gray-300">Loading addresses...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 sm:p-6 lg:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 sm:p-8">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Addresses</h1>
            <Link href="/customer/profile" className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400">
              Back to Profile
            </Link>
          </div>

          {apiError && (
            <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-700 dark:text-red-300">{apiError}</p>
            </div>
          )}

          {success && (
            <div className="mb-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
              <p className="text-sm text-green-700 dark:text-green-300">{success}</p>
            </div>
          )}

          {/* Add/Edit Form */}
          {showAddForm && (
            <div className="mb-8 p-6 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                {editingId ? 'Edit Address' : 'Add New Address'}
              </h2>

              <form onSubmit={handleSubmitAddress} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Label (Home, Office, etc)
                  </label>
                  <input
                    type="text"
                    value={formData.label}
                    onChange={e => setFormData(prev => ({ ...prev, label: e.target.value }))}
                    className={`w-full px-4 py-2 rounded-lg border
                      ${
                        errors.label
                          ? 'border-red-500 dark:border-red-500'
                          : 'border-gray-300 dark:border-gray-600'
                      }
                      bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100`}
                  />
                  {errors.label && <p className="text-sm text-red-600 dark:text-red-400 mt-1">{errors.label}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Street Address
                  </label>
                  <input
                    type="text"
                    value={formData.street}
                    onChange={e => setFormData(prev => ({ ...prev, street: e.target.value }))}
                    className={`w-full px-4 py-2 rounded-lg border
                      ${
                        errors.street
                          ? 'border-red-500 dark:border-red-500'
                          : 'border-gray-300 dark:border-gray-600'
                      }
                      bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100`}
                  />
                  {errors.street && <p className="text-sm text-red-600 dark:text-red-400 mt-1">{errors.street}</p>}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      City
                    </label>
                    <input
                      type="text"
                      value={formData.city}
                      onChange={e => setFormData(prev => ({ ...prev, city: e.target.value }))}
                      className={`w-full px-4 py-2 rounded-lg border
                        ${
                          errors.city
                            ? 'border-red-500 dark:border-red-500'
                            : 'border-gray-300 dark:border-gray-600'
                        }
                        bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100`}
                    />
                    {errors.city && <p className="text-sm text-red-600 dark:text-red-400 mt-1">{errors.city}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      State
                    </label>
                    <input
                      type="text"
                      value={formData.state}
                      onChange={e => setFormData(prev => ({ ...prev, state: e.target.value }))}
                      className={`w-full px-4 py-2 rounded-lg border
                        ${
                          errors.state
                            ? 'border-red-500 dark:border-red-500'
                            : 'border-gray-300 dark:border-gray-600'
                        }
                        bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100`}
                    />
                    {errors.state && <p className="text-sm text-red-600 dark:text-red-400 mt-1">{errors.state}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Zip Code
                    </label>
                    <input
                      type="text"
                      value={formData.zipCode}
                      onChange={e => setFormData(prev => ({ ...prev, zipCode: e.target.value }))}
                      className={`w-full px-4 py-2 rounded-lg border
                        ${
                          errors.zipCode
                            ? 'border-red-500 dark:border-red-500'
                            : 'border-gray-300 dark:border-gray-600'
                        }
                        bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100`}
                    />
                    {errors.zipCode && <p className="text-sm text-red-600 dark:text-red-400 mt-1">{errors.zipCode}</p>}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                      className={`w-full px-4 py-2 rounded-lg border
                        ${
                          errors.phone
                            ? 'border-red-500 dark:border-red-500'
                            : 'border-gray-300 dark:border-gray-600'
                        }
                        bg-white dark:bg-gray-600 text-gray-900 dark:text-gray-100`}
                    />
                    {errors.phone && <p className="text-sm text-red-600 dark:text-red-400 mt-1">{errors.phone}</p>}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isDefault"
                    checked={formData.isDefault}
                    onChange={e => setFormData(prev => ({ ...prev, isDefault: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600"
                  />
                  <label htmlFor="isDefault" className="text-sm text-gray-700 dark:text-gray-300">
                    Set as default address
                  </label>
                </div>

                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                  >
                    {editingId ? 'Update Address' : 'Add Address'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      setShowAddForm(false);
                    }}
                    className="flex-1 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-100 font-semibold py-2 px-4 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Add Address Button */}
          {!showAddForm && (
            <button
              onClick={() => setShowAddForm(true)}
              className="w-full mb-8 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
            >
              + Add New Address
            </button>
          )}

          {/* Addresses List */}
          {addresses.length === 0 ? (
            <p className="text-center text-gray-600 dark:text-gray-400 py-8">No addresses yet</p>
          ) : (
            <div className="space-y-4">
              {addresses.map(address => (
                <div
                  key={address._id}
                  className={`p-4 rounded-lg border-2 ${
                    address.isDefault
                      ? 'border-blue-600 dark:border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        {address.label}
                        {address.isDefault && (
                          <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded">Default</span>
                        )}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {address.street}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {address.city}, {address.state} {address.zipCode}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Phone: +91 {address.phone}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {!address.isDefault && (
                      <button
                        onClick={() => handleSetDefault(address._id!)}
                        className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        Set as Default
                      </button>
                    )}
                    <button
                      onClick={() => handleEditAddress(address)}
                      className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteAddress(address._id!)}
                      className="text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
