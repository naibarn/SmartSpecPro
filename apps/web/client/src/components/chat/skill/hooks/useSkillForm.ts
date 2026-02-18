import { useState, useCallback, useMemo } from 'react';
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
      const urlRegex = /^(https?:\/\/|\/uploads\/)/i;
      
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

  const validateField = useCallback(
    (fieldId: string, value: any): string | null => {
      const field = schema.sections
        .flatMap((s) => s.fields)
        .find((f) => f.id === fieldId);

      if (!field) return null;

      return validateFieldValue(field, value);
    },
    [schema]
  );

  const setValue = useCallback(
    (fieldId: string, value: any) => {
      setValues((prev) => ({ ...prev, [fieldId]: value }));
      
      // Validate and clear/set error
      const error = validateField(fieldId, value);
      setErrors((prev) => {
        const next = { ...prev };
        if (error) {
          next[fieldId] = error;
        } else {
          delete next[fieldId];
        }
        return next;
      });
    },
    [validateField]
  );

  const setValuesHandler = useCallback((newValues: Record<string, any>) => {
    setValues((prev) => ({ ...prev, ...newValues }));
    
    // Validate all updated fields
    setErrors((prev) => {
      const next = { ...prev };
      Object.entries(newValues).forEach(([fieldId, value]) => {
        const error = validateField(fieldId, value);
        if (error) {
          next[fieldId] = error;
        } else {
          delete next[fieldId];
        }
      });
      return next;
    });
  }, [validateField]);

  const reset = useCallback(() => {
    setValues(defaultValues);
    setErrors({});
  }, [defaultValues]);

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    let valid = true;

    schema.sections.forEach((section) => {
      section.fields.forEach((field) => {
        const value = values[field.id];
        const error = validateFieldValue(field, value);
        
        if (error) {
          newErrors[field.id] = error;
          valid = false;
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
    validateField,
    hasChanges,
  };
}
