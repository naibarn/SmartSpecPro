import { useState, useCallback, useMemo } from 'react';
import { SkillInputSchema } from '@/components/media/DynamicSkillForm';

export interface UseSkillFormOptions {
  schema: SkillInputSchema;
  initialValues?: Record<string, any>;
}

export interface UseSkillFormReturn {
  values: Record<string, any>;
  setValue: (fieldId: string, value: any) => void;
  setValues: (values: Record<string, any>) => void;
  reset: () => void;
  isValid: boolean;
  errors: Record<string, string>;
  validate: () => boolean;
  hasChanges: boolean;
}

export function useSkillForm(options: UseSkillFormOptions): UseSkillFormReturn {
  const { schema, initialValues } = options;

  // Extract default values from schema
  const defaultValues = useMemo(() => {
    const defaults: Record<string, any> = {};

    schema.sections.forEach((section) => {
      section.fields.forEach((field) => {
        if (field.default !== undefined) {
          defaults[field.id] = field.default;
        }
      });
    });

    return { ...defaults, ...initialValues };
  }, [schema, initialValues]);

  const [values, setValues] = useState<Record<string, any>>(defaultValues);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setValue = useCallback(
    (fieldId: string, value: any) => {
      setValues((prev) => ({ ...prev, [fieldId]: value }));
      // Clear error when value changes
      setErrors((prev) => {
        const next = { ...prev };
        delete next[fieldId];
        return next;
      });
    },
    []
  );

  const setValuesHandler = useCallback((newValues: Record<string, any>) => {
    setValues((prev) => ({ ...prev, ...newValues }));
  }, []);

  const reset = useCallback(() => {
    setValues(defaultValues);
    setErrors({});
  }, [defaultValues]);

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    let valid = true;

    schema.sections.forEach((section) => {
      section.fields.forEach((field) => {
        if (field.required) {
          const value = values[field.id];
          const isEmpty =
            value === undefined ||
            value === null ||
            value === '' ||
            (Array.isArray(value) && value.length === 0);

          if (isEmpty) {
            newErrors[field.id] = `${field.label} is required`;
            valid = false;
          }
        }
      });
    });

    setErrors(newErrors);
    return valid;
  }, [schema, values]);

  const isValid = useMemo(() => {
    return Object.keys(errors).length === 0;
  }, [errors]);

  const hasChanges = useMemo(() => {
    return JSON.stringify(values) !== JSON.stringify(defaultValues);
  }, [values, defaultValues]);

  return {
    values,
    setValue,
    setValues: setValuesHandler,
    reset,
    isValid,
    errors,
    validate,
    hasChanges,
  };
}
