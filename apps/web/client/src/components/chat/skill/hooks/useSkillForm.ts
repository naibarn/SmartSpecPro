import { useState, useCallback, useMemo, useEffect } from 'react';
import { SkillInputSchema, SkillInputField } from '@/components/media/DynamicSkillForm';

export interface UseSkillFormOptions {
  schema: SkillInputSchema;
  initialValues?: Record<string, any>;
}

export interface ValidationError {
  fieldId: string;
  message: string;
}

export interface UseSkillFormReturn {
  values: Record<string, any>;
  setValue: (fieldId: string, value: any) => void;
  setValues: (values: Record<string, any>) => void;
  reset: () => void;
  isValid: boolean;
  errors: Record<string, string>;
  validate: () => boolean;
  validateField: (fieldId: string, value: any) => string | null;
  hasChanges: boolean;
}

/**
 * Validates a single field value
 */
function validateFieldValue(
  field: SkillInputField,
  value: any
): string | null {
  // Required check
  if (field.required) {
    const isEmpty =
      value === undefined ||
      value === null ||
      value === '' ||
      (Array.isArray(value) && value.length === 0);

    if (isEmpty) {
      return `${field.label} is required`;
    }
  }

  // Skip further validation if empty and not required
  if (value === undefined || value === null || value === '') {
    return null;
  }

  // Type-specific validation
  switch (field.type) {
    case 'text':
    case 'textarea': {
      const strValue = String(value);
      
      // Min length
      if (field.min !== undefined && strValue.length < field.min) {
        return `${field.label} must be at least ${field.min} characters`;
      }
      
      // Max length
      if (field.max !== undefined && strValue.length > field.max) {
        return `${field.label} must be at most ${field.max} characters`;
      }
      
      // Email validation
      if (field.id.toLowerCase().includes('email') || field.label.toLowerCase().includes('email')) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(strValue)) {
          return `${field.label} must be a valid email address`;
        }
      }
      break;
    }

    case 'number': {
      const numValue = Number(value);
      if (isNaN(numValue)) {
        return `${field.label} must be a valid number`;
      }
      
      // Min value
      if (field.min !== undefined && numValue < field.min) {
        return `${field.label} must be at least ${field.min}`;
      }
      
      // Max value
      if (field.max !== undefined && numValue > field.max) {
        return `${field.label} must be at most ${field.max}`;
      }
      break;
    }

    case 'slider': {
      const sliderValue = Number(value);
      if (isNaN(sliderValue)) {
        return `${field.label} must be a valid number`;
      }
      
      if (field.min !== undefined && sliderValue < field.min) {
        return `${field.label} must be at least ${field.min}`;
      }
      
      if (field.max !== undefined && sliderValue > field.max) {
        return `${field.label} must be at most ${field.max}`;
      }
      break;
    }

    case 'select': {
      const validOptions = (field.options || []).map((o) => o.value);
      if (validOptions.length > 0 && !validOptions.includes(value)) {
        return `${field.label} has an invalid value`;
      }
      break;
    }

    case 'multiselect': {
      const selectedValues = Array.isArray(value) ? value : [value];
      const validOptions = (field.options || []).map((o) => o.value);
      
      for (const selected of selectedValues) {
        if (!validOptions.includes(selected)) {
          return `${field.label} contains invalid values`;
        }
      }
      
      // Max count check
      if (field.maxCount !== undefined && selectedValues.length > field.maxCount) {
        return `${field.label} can have at most ${field.maxCount} selections`;
      }
      break;
    }

    case 'image':
    case 'images':
    case 'imageUpload': {
      // Validate URLs
      const urls = Array.isArray(value) ? value : [value];
      const urlRegex = /^(https?:\/\/|\/uploads\/|\/(?!\/)|data:image\/[a-zA-Z0-9.+-]+;base64,)/i;
      
      for (const url of urls) {
        if (typeof url !== 'string' || !urlRegex.test(url)) {
          return `${field.label} contains invalid URLs`;
        }
      }
      
      // Max images check
      if (field.maxImages !== undefined && urls.length > field.maxImages) {
        return `${field.label} can have at most ${field.maxImages} images`;
      }
      break;
    }
  }

  return null;
}

function isFieldVisible(field: SkillInputField, values: Record<string, any>): boolean {
  if (!field.dependsOn) return true;

  if (Array.isArray(field.dependsOn.all) && field.dependsOn.all.length > 0) {
    return field.dependsOn.all.every((dependency) =>
      isFieldVisible({ ...field, dependsOn: dependency }, values),
    );
  }

  if (Array.isArray(field.dependsOn.any) && field.dependsOn.any.length > 0) {
    return field.dependsOn.any.some((dependency) =>
      isFieldVisible({ ...field, dependsOn: dependency }, values),
    );
  }

  if (!field.dependsOn.field) {
    return true;
  }

  const dependentValue = values[field.dependsOn.field];

  if (field.dependsOn.notEmpty) {
    return !!dependentValue && dependentValue !== '';
  }

  if (field.dependsOn.minItems !== undefined) {
    return Array.isArray(dependentValue) && dependentValue.length >= field.dependsOn.minItems;
  }

  if (field.dependsOn.value !== undefined) {
    return dependentValue === field.dependsOn.value;
  }

  if (Array.isArray(field.dependsOn.values) && field.dependsOn.values.length > 0) {
    return field.dependsOn.values.includes(dependentValue);
  }

  return true;
}

function collectVisibleFieldErrors(
  schema: SkillInputSchema,
  values: Record<string, any>,
): Record<string, string> {
  const nextErrors: Record<string, string> = {};

  schema.sections.forEach((section) => {
    section.fields.forEach((field) => {
      if (!isFieldVisible(field, values)) {
        return;
      }

      const error = validateFieldValue(field, values[field.id]);
      if (error) {
        nextErrors[field.id] = error;
      }
    });
  });

  return nextErrors;
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

  // When the schema loads asynchronously (e.g. skill form opened after mount),
  // apply any default values that haven't been set yet by the user.
  // We use the functional updater to avoid overwriting values the user already typed.
  useEffect(() => {
    setValues((prev) => {
      const missing: Record<string, any> = {};
      Object.entries(defaultValues).forEach(([key, val]) => {
        if (prev[key] === undefined) {
          missing[key] = val;
        }
      });
      return Object.keys(missing).length > 0 ? { ...prev, ...missing } : prev;
    });
  }, [defaultValues]);

  const validateField = useCallback(
    (fieldId: string, value: any): string | null => {
      const field = schema.sections
        .flatMap((s) => s.fields)
        .find((f) => f.id === fieldId);

      if (!field) return null;
      if (!isFieldVisible(field, { ...values, [fieldId]: value })) return null;

      return validateFieldValue(field, value);
    },
    [schema, values]
  );

  const setValue = useCallback(
    (fieldId: string, value: any) => {
      setValues((prev) => {
        const nextValues = { ...prev, [fieldId]: value };
        setErrors(collectVisibleFieldErrors(schema, nextValues));
        return nextValues;
      });
    },
    [schema]
  );

  const setValuesHandler = useCallback((newValues: Record<string, any>) => {
    setValues((prev) => {
      const nextValues = { ...prev, ...newValues };
      setErrors(collectVisibleFieldErrors(schema, nextValues));
      return nextValues;
    });
  }, [schema]);

  const reset = useCallback(() => {
    setValues(defaultValues);
    setErrors({});
  }, [defaultValues]);

  const validate = useCallback((): boolean => {
    const newErrors = collectVisibleFieldErrors(schema, values);
    const valid = Object.keys(newErrors).length === 0;

    setErrors(newErrors);
    return valid;
  }, [schema, values]);

  useEffect(() => {
    setErrors((prev) => {
      const next = collectVisibleFieldErrors(schema, values);
      const prevKeys = Object.keys(prev);
      const nextKeys = Object.keys(next);

      if (
        prevKeys.length === nextKeys.length
        && prevKeys.every((key) => prev[key] === next[key])
      ) {
        return prev;
      }

      return next;
    });
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
    validateField,
    hasChanges,
  };
}
