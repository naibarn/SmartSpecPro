import { renderHook, act } from '@testing-library/react';
import { useSkillForm } from './useSkillForm';
import { SkillInputSchema } from '@/components/media/DynamicSkillForm';

const mockSchema: SkillInputSchema = {
  title: 'Test Form',
  sections: [
    {
      id: 'basic',
      title: 'Basic',
      fields: [
        { id: 'name', type: 'text', label: 'Name', required: true },
        { id: 'age', type: 'number', label: 'Age', default: 18 },
        { id: 'email', type: 'text', label: 'Email' },
        {
          id: 'interests',
          type: 'multiselect',
          label: 'Interests',
          options: [],
        },
      ],
    },
  ],
};

describe('useSkillForm', () => {
  it('initializes with default values from schema', () => {
    const { result } = renderHook(() =>
      useSkillForm({ schema: mockSchema })
    );

    expect(result.current.values.age).toBe(18);
    expect(result.current.values.name).toBeUndefined();
  });

  it('initializes with initial values', () => {
    const { result } = renderHook(() =>
      useSkillForm({ schema: mockSchema, initialValues: { name: 'John' } })
    );

    expect(result.current.values.name).toBe('John');
    expect(result.current.values.age).toBe(18);
  });

  it('setValue updates single field', () => {
    const { result } = renderHook(() =>
      useSkillForm({ schema: mockSchema })
    );

    act(() => {
      result.current.setValue('name', 'Jane');
    });

    expect(result.current.values.name).toBe('Jane');
  });

  it('setValues updates multiple fields', () => {
    const { result } = renderHook(() =>
      useSkillForm({ schema: mockSchema })
    );

    act(() => {
      result.current.setValues({ name: 'John', age: 25 });
    });

    expect(result.current.values.name).toBe('John');
    expect(result.current.values.age).toBe(25);
  });

  it('validate returns false for empty required fields', () => {
    const { result } = renderHook(() =>
      useSkillForm({ schema: mockSchema })
    );

    let isValid: boolean;
    act(() => {
      isValid = result.current.validate();
    });

    expect(result.current.errors.name).toBe('Name is required');
    expect(result.current.isValid).toBe(false);
  });

  it('validate returns true when all required fields filled', () => {
    const { result } = renderHook(() =>
      useSkillForm({ schema: mockSchema })
    );

    act(() => {
      result.current.setValue('name', 'John');
    });

    let isValid: boolean;
    act(() => {
      isValid = result.current.validate();
    });

    expect(result.current.errors.name).toBeUndefined();
    expect(result.current.isValid).toBe(true);
  });

  it('clears error when value changes', () => {
    const { result } = renderHook(() =>
      useSkillForm({ schema: mockSchema })
    );

    act(() => {
      result.current.validate();
    });

    expect(result.current.errors.name).toBeDefined();

    act(() => {
      result.current.setValue('name', 'John');
    });

    expect(result.current.errors.name).toBeUndefined();
  });

  it('reset returns to default values', () => {
    const { result } = renderHook(() =>
      useSkillForm({ schema: mockSchema, initialValues: { name: 'John' } })
    );

    act(() => {
      result.current.setValue('name', 'Jane');
      result.current.setValue('age', 30);
    });

    act(() => {
      result.current.reset();
    });

    expect(result.current.values.name).toBe('John');
    expect(result.current.values.age).toBe(18);
    expect(result.current.errors).toEqual({});
  });

  it('tracks hasChanges correctly', () => {
    const { result } = renderHook(() =>
      useSkillForm({ schema: mockSchema })
    );

    expect(result.current.hasChanges).toBe(false);

    act(() => {
      result.current.setValue('name', 'John');
    });

    expect(result.current.hasChanges).toBe(true);

    act(() => {
      result.current.reset();
    });

    expect(result.current.hasChanges).toBe(false);
  });

  it('validates array fields correctly', () => {
    const { result } = renderHook(() =>
      useSkillForm({ schema: mockSchema })
    );

    act(() => {
      result.current.setValue('interests', []);
    });

    // Empty array for non-required field should be valid
    // (interests is not marked as required in mockSchema)
    expect(result.current.isValid).toBe(true);
  });

  it('validates null and undefined as empty', () => {
    const schemaWithRequired: SkillInputSchema = {
      title: 'Test',
      sections: [
        {
          id: 'test',
          title: 'Test',
          fields: [
            { id: 'field1', type: 'text', label: 'Field 1', required: true },
            { id: 'field2', type: 'text', label: 'Field 2', required: true },
          ],
        },
      ],
    };

    const { result } = renderHook(() =>
      useSkillForm({
        schema: schemaWithRequired,
        initialValues: { field1: null, field2: undefined },
      })
    );

    act(() => {
      result.current.validate();
    });

    expect(result.current.errors.field1).toBe('Field 1 is required');
    expect(result.current.errors.field2).toBe('Field 2 is required');
  });
});
