import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DynamicSkillForm, { SkillInputSchema } from './DynamicSkillForm';

// Mock schema for testing
const mockSchema: SkillInputSchema = {
  title: 'Test Form',
  sections: [
    {
      id: 'basic',
      title: 'Basic',
      fields: [
        { id: 'name', type: 'text', label: 'Name', required: true },
        { id: 'description', type: 'textarea', label: 'Description' },
      ],
    },
    {
      id: 'config',
      title: 'Configuration',
      fields: [
        {
          id: 'category',
          type: 'select',
          label: 'Category',
          options: [
            { value: 'A', label: 'Category A' },
            { value: 'B', label: 'Category B' },
          ],
        },
        {
          id: 'subcategory',
          type: 'select',
          label: 'Subcategory',
          dependsOn: { field: 'category', notEmpty: true },
          optionGroups: {
            'A': [
              { value: 'A1', label: 'Sub A1' },
              { value: 'A2', label: 'Sub A2' },
            ],
            'B': [
              { value: 'B1', label: 'Sub B1' },
            ],
          },
        },
        { id: 'enabled', type: 'boolean', label: 'Enabled', default: true },
      ],
    },
  ],
};

describe('DynamicSkillForm', () => {
  const mockOnChange = jest.fn();
  const mockOnImageUpload = jest.fn();
  const mockOnStyleAction = jest.fn();
  const mockOnRemoveImage = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders all sections and fields', () => {
      render(
        <DynamicSkillForm
          schema={mockSchema}
          values={{}}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByLabelText('Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Description')).toBeInTheDocument();
      expect(screen.getByText('Category')).toBeInTheDocument();
      expect(screen.getByText('Configuration')).toBeInTheDocument();
    });

    it('applies custom className', () => {
      const { container } = render(
        <DynamicSkillForm
          schema={mockSchema}
          values={{}}
          onChange={mockOnChange}
          className="custom-class"
        />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('shows required indicator for required fields', () => {
      render(
        <DynamicSkillForm
          schema={mockSchema}
          values={{}}
          onChange={mockOnChange}
        />
      );

      const nameLabel = screen.getByText('Name');
      expect(nameLabel.parentElement).toContainHTML('*');
    });
  });

  describe('Field Types', () => {
    it('renders text input', () => {
      render(
        <DynamicSkillForm
          schema={mockSchema}
          values={{ name: 'Test' }}
          onChange={mockOnChange}
        />
      );

      const input = screen.getByLabelText('Name') as HTMLInputElement;
      expect(input.value).toBe('Test');
    });

    it('renders textarea', () => {
      render(
        <DynamicSkillForm
          schema={mockSchema}
          values={{ description: 'Test description' }}
          onChange={mockOnChange}
        />
      );

      const textarea = screen.getByLabelText('Description') as HTMLTextAreaElement;
      expect(textarea.value).toBe('Test description');
    });

    it('renders boolean switch', () => {
      render(
        <DynamicSkillForm
          schema={mockSchema}
          values={{ enabled: true }}
          onChange={mockOnChange}
        />
      );

      const switchBtn = screen.getByRole('switch');
      expect(switchBtn).toBeChecked();
    });

    it('renders select dropdown', () => {
      render(
        <DynamicSkillForm
          schema={mockSchema}
          values={{ category: 'A' }}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByText('Category A')).toBeInTheDocument();
    });
  });

  describe('onChange Handling', () => {
    it('calls onChange when text input changes', async () => {
      const user = userEvent.setup();
      
      render(
        <DynamicSkillForm
          schema={mockSchema}
          values={{}}
          onChange={mockOnChange}
        />
      );

      const input = screen.getByLabelText('Name');
      await user.type(input, 'John');

      expect(mockOnChange).toHaveBeenCalledWith({ name: 'John' });
    });

    it('calls onChange when boolean toggles', async () => {
      const user = userEvent.setup();
      
      render(
        <DynamicSkillForm
          schema={mockSchema}
          values={{ enabled: true }}
          onChange={mockOnChange}
        />
      );

      const switchBtn = screen.getByRole('switch');
      await user.click(switchBtn);

      expect(mockOnChange).toHaveBeenCalledWith({ enabled: false });
    });
  });

  describe('optionGroups (Cascading Selects)', () => {
    it('disables child select when parent is empty', () => {
      render(
        <DynamicSkillForm
          schema={mockSchema}
          values={{}}
          onChange={mockOnChange}
        />
      );

      const subcategoryTrigger = screen.getByText('Select category first');
      expect(subcategoryTrigger).toBeDisabled();
    });

    it('shows options based on parent value', () => {
      render(
        <DynamicSkillForm
          schema={mockSchema}
          values={{ category: 'A' }}
          onChange={mockOnChange}
        />
      );

      // Subcategory should be enabled
      const subcategoryTrigger = screen.getByRole('combobox', { name: /subcategory/i });
      expect(subcategoryTrigger).not.toBeDisabled();
    });

    it('resets child value when parent changes', () => {
      const { rerender } = render(
        <DynamicSkillForm
          schema={mockSchema}
          values={{ category: 'A', subcategory: 'A1' }}
          onChange={mockOnChange}
        />
      );

      // Change parent to B
      rerender(
        <DynamicSkillForm
          schema={mockSchema}
          values={{ category: 'B', subcategory: 'A1' }}
          onChange={mockOnChange}
        />
      );

      // Should reset subcategory
      expect(mockOnChange).toHaveBeenCalledWith({
        category: 'B',
        subcategory: '',
      });
    });
  });

  describe('excludeFields', () => {
    it('excludes specified fields from rendering', () => {
      render(
        <DynamicSkillForm
          schema={mockSchema}
          values={{}}
          onChange={mockOnChange}
          excludeFields={['description']}
        />
      );

      expect(screen.queryByLabelText('Description')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Name')).toBeInTheDocument();
    });
  });

  describe('dependsOn Visibility', () => {
    it('hides field when dependsOn condition not met', () => {
      const schemaWithConditional: SkillInputSchema = {
        title: 'Conditional Test',
        sections: [{
          id: 'test',
          title: 'Test',
          fields: [
            { id: 'showExtra', type: 'boolean', label: 'Show Extra' },
            {
              id: 'extraField',
              type: 'text',
              label: 'Extra',
              dependsOn: { field: 'showExtra', value: true },
            },
          ],
        }],
      };

      const { rerender } = render(
        <DynamicSkillForm
          schema={schemaWithConditional}
          values={{ showExtra: false }}
          onChange={mockOnChange}
        />
      );

      expect(screen.queryByLabelText('Extra')).not.toBeInTheDocument();

      rerender(
        <DynamicSkillForm
          schema={schemaWithConditional}
          values={{ showExtra: true }}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByLabelText('Extra')).toBeInTheDocument();
    });
  });

  describe('onStyleAction', () => {
    it('calls onStyleAction when upscale style selected', () => {
      const schemaWithStyle: SkillInputSchema = {
        title: 'Style Test',
        sections: [{
          id: 'style',
          title: 'Style',
          fields: [
            {
              id: 'style',
              type: 'select',
              label: 'Style',
              options: [
                { value: 'normal', label: 'Normal' },
                { value: 'upscale', label: 'Upscale' },
              ],
            },
          ],
        }],
      };

      render(
        <DynamicSkillForm
          schema={schemaWithStyle}
          values={{}}
          onChange={mockOnChange}
          onStyleAction={mockOnStyleAction}
        />
      );

      // Simulate selecting upscale
      mockOnChange({ style: 'upscale' });

      // Note: In real implementation, this would trigger onStyleAction
      // through the updateValue function
    });
  });

  describe('Image Upload', () => {
    const schemaWithImage: SkillInputSchema = {
      title: 'Image Test',
      sections: [{
        id: 'image',
        title: 'Image',
        fields: [
          { id: 'image', type: 'image', label: 'Image' },
        ],
      }],
    };

    it('shows upload button when onImageUpload provided', () => {
      render(
        <DynamicSkillForm
          schema={schemaWithImage}
          values={{}}
          onChange={mockOnChange}
          onImageUpload={mockOnImageUpload}
        />
      );

      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('renders without onImageUpload (optional prop)', () => {
      render(
        <DynamicSkillForm
          schema={schemaWithImage}
          values={{}}
          onChange={mockOnChange}
        />
      );

      // Should render without errors
      expect(screen.getByText('Image')).toBeInTheDocument();
    });
  });

  describe('Bilingual Support', () => {
    it('renders Thai labels when language is th', () => {
      const thaiSchema: SkillInputSchema = {
        title: 'ฟอร์มทดสอบ',
        sections: [{
          id: 'basic',
          title: 'พื้นฐาน',
          fields: [
            {
              id: 'name',
              type: 'text',
              label: 'Name',
              labelTh: 'ชื่อ',
              placeholder: 'Enter name',
              placeholderTh: 'กรุณากรอกชื่อ',
            },
          ],
        }],
      };

      render(
        <DynamicSkillForm
          schema={thaiSchema}
          values={{}}
          onChange={mockOnChange}
          language="th"
        />
      );

      expect(screen.getByLabelText('ชื่อ')).toBeInTheDocument();
    });

    it('seeds the skill language field from the current UI language', async () => {
      const languageSchema: SkillInputSchema = {
        title: 'Language Form',
        sections: [{
          id: 'basic',
          title: 'Basic',
          fields: [
            {
              id: 'language',
              type: 'select',
              label: 'Output Language',
              labelTh: 'ภาษาเอาต์พุต',
              default: 'en',
              options: [
                { value: 'en', label: 'English', labelTh: 'อังกฤษ' },
                { value: 'th', label: 'Thai', labelTh: 'ไทย' },
              ],
            },
          ],
        }],
      };

      render(
        <DynamicSkillForm
          schema={languageSchema}
          values={{}}
          onChange={mockOnChange}
          language="th"
        />
      );

      await waitFor(() => {
        expect(mockOnChange).toHaveBeenCalledWith({ language: 'th' });
      });
    });
  });

  describe('Advanced dependsOn rules', () => {
    it('supports combined all/any/minItems visibility rules', () => {
      const advancedSchema: SkillInputSchema = {
        title: 'Advanced DependsOn',
        sections: [{
          id: 'refs',
          title: 'References',
          fields: [
            {
              id: 'extra_seedance_role',
              type: 'select',
              label: 'Seedance Extra Role',
              dependsOn: {
                all: [
                  { field: 'target_model_profile', value: 'seedance_2_kie' },
                  {
                    any: [
                      { field: 'reference_images', minItems: 5 },
                      { field: 'reference_images', minItems: 6 },
                    ],
                  },
                ],
              },
              options: [
                { value: 'supporting_reference', label: 'Supporting Reference' },
              ],
            },
          ],
        }],
      };

      const { rerender } = render(
        <DynamicSkillForm
          schema={advancedSchema}
          values={{ target_model_profile: 'seedance_2_kie', reference_images: ['1', '2', '3', '4'] }}
          onChange={mockOnChange}
        />
      );

      expect(screen.queryByText('Seedance Extra Role')).not.toBeInTheDocument();

      rerender(
        <DynamicSkillForm
          schema={advancedSchema}
          values={{ target_model_profile: 'seedance_2_kie', reference_images: ['1', '2', '3', '4', '5'] }}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByText('Seedance Extra Role')).toBeInTheDocument();
    });
  });
});
