'use client';

import React, { useState, ReactNode } from 'react';

export interface FormField {
  name: string;
  label: string;
  type: string;
  placeholder?: string;
  value: string;
  error?: string;
  onChange?: (value: string) => void;
  validation?: (value: string) => { valid: boolean; errors: string[] } | { valid: boolean; error?: string };
  showFeedback?: boolean;
  required?: boolean;
}

interface AuthFormProps {
  fields: FormField[];
  onFieldChange?: (name: string, value: string) => void;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  isLoading?: boolean;
  error?: string | null;
  submitLabel?: string;
  footerText?: ReactNode;
}

export function AuthForm({
  fields,
  onFieldChange = () => {},
  onSubmit,
  isLoading = false,
  error = null,
  submitLabel = 'Submit',
  footerText,
}: AuthFormProps) {
  const [touched, setTouched] = useState<Set<string>>(new Set());

  const handleBlur = (name: string) => {
    setTouched(prev => new Set([...prev, name]));
  };

  const handleChange = (name: string, value: string) => {
    onFieldChange?.(name, value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Mark all fields as touched before submission
    const allNames = new Set(fields.map(f => f.name));
    setTouched(allNames);
    await onSubmit(e);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 w-full">
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {fields.map(field => {
        const isTouched = touched.has(field.name);
        const showError = isTouched && field.error;
        const showValidation = field.showFeedback && isTouched && field.validation;

        let validationResult = null;
        if (showValidation) {
          validationResult = field.validation?.(field.value);
        }

        const isValid = validationResult && 'valid' in validationResult && validationResult.valid;

        return (
          <div key={field.name}>
            <label htmlFor={field.name} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {field.label}
              {field.required && <span className="text-red-500 ml-1">*</span>}
            </label>

            <input
              id={field.name}
              name={field.name}
              type={field.type}
              placeholder={field.placeholder}
              value={field.value}
              onChange={e => field.onChange ? field.onChange(e.target.value) : handleChange(field.name, e.target.value)}
              onBlur={() => handleBlur(field.name)}
              disabled={isLoading}
              className={`w-full px-4 py-2.5 rounded-lg border transition-colors
                ${
                  showError
                    ? 'border-red-500 dark:border-red-500 bg-red-50 dark:bg-red-900/10'
                    : isValid
                      ? 'border-green-500 dark:border-green-500 bg-green-50 dark:bg-green-900/10'
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                }
                text-gray-900 dark:text-gray-100
                placeholder-gray-500 dark:placeholder-gray-400
                focus:outline-none focus:ring-2 focus:ring-offset-0
                ${
                  showError
                    ? 'focus:ring-red-500'
                    : isValid
                      ? 'focus:ring-green-500'
                      : 'focus:ring-blue-500'
                }
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            />

            {showError && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{field.error}</p>
            )}

            {showValidation && validationResult && 'errors' in validationResult && validationResult.errors.length > 0 && (
              <ul className="mt-2 space-y-1 list-none">
                {validationResult.errors.map((err, idx) => (
                  <li key={idx} className="text-xs text-amber-600 dark:text-amber-400">
                    • {err}
                  </li>
                ))}
              </ul>
            )}

            {isValid && (
              <p className="mt-1 text-sm text-green-600 dark:text-green-400">✓ Valid</p>
            )}
          </div>
        );
      })}

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isLoading ? (
          <>
            <svg className="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Loading...</span>
          </>
        ) : (
          submitLabel
        )}
      </button>

      {footerText && (
        <div className="text-center text-sm text-gray-600 dark:text-gray-400">
          {footerText}
        </div>
      )}
    </form>
  );
}
