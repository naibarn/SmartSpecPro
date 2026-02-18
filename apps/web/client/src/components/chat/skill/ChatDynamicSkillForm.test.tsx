import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatDynamicSkillForm } from './ChatDynamicSkillForm';
import { SkillInputSchema } from '@/components/media/DynamicSkillForm';

// Mock hooks
jest.mock('./hooks/useImageUpload', () => ({
  useImageUpload: jest.fn(() => ({
    upload: jest.fn(),
    isUploading: false,
    error: null,
    retry: jest.fn(),
    reset: jest.fn(),
    retryCount: 0,
  })),
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    error: jest.fn(),
  },
}));

import { useImageUpload } from './hooks/useImageUpload';
import { toast } from 'sonner';

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
  ],
};

describe('ChatDynamicSkillForm', () => {
  const mockOnChange = jest.fn();
  const mockOnClearError = jest.fn();
  const mockUpload = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useImageUpload as jest.Mock).mockReturnValue({
      upload: mockUpload,
      isUploading: false,
      error: null,
      retry: jest.fn(),
      reset: jest.fn(),
      retryCount: 0,
    });
  });

  describe('Rendering', () => {
    it('renders DynamicSkillForm with chat styling', () => {
      render(
        <ChatDynamicSkillForm
          schema={mockSchema}
          values={{}}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByLabelText('Name')).toBeInTheDocument();
      expect(screen.getByLabelText('Description')).toBeInTheDocument();
    });

    it('applies chat styling (bg-muted/30)', () => {
      const { container } = render(
        <ChatDynamicSkillForm
          schema={mockSchema}
          values={{}}
          onChange={mockOnChange}
        />
      );

      const formContainer = container.querySelector('.bg-muted\\/30');
      expect(formContainer).toBeInTheDocument();
    });

    it('shows error alert when error prop provided', () => {
      render(
        <ChatDynamicSkillForm
          schema={mockSchema}
          values={{}}
          onChange={mockOnChange}
          error="Something went wrong"
        />
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('shows clear error button when onClearError provided', () => {
      render(
        <ChatDynamicSkillForm
          schema={mockSchema}
          values={{}}
          onChange={mockOnChange}
          error="Something went wrong"
          onClearError={mockOnClearError}
        />
      );

      const clearButton = screen.getByRole('button', { name: '' });
      expect(clearButton).toBeInTheDocument();
    });

    it('calls onClearError when clear button clicked', async () => {
      const user = userEvent.setup();

      render(
        <ChatDynamicSkillForm
          schema={mockSchema}
          values={{}}
          onChange={mockOnChange}
          error="Something went wrong"
          onClearError={mockOnClearError}
        />
      );

      const clearButton = screen.getByRole('button', { name: '' });
      await user.click(clearButton);

      expect(mockOnClearError).toHaveBeenCalled();
    });
  });

  describe('Image Upload', () => {
    const schemaWithImage: SkillInputSchema = {
      title: 'Image Test',
      sections: [
        {
          id: 'image',
          title: 'Image',
          fields: [
            { id: 'image', type: 'image', label: 'Image' },
          ],
        },
      ],
    };

    it('handles successful image upload', async () => {
      mockUpload.mockResolvedValue('http://example.com/image.png');

      render(
        <ChatDynamicSkillForm
          schema={schemaWithImage}
          values={{}}
          onChange={mockOnChange}
        />
      );

      // Upload functionality is handled by DynamicSkillForm
      // We just verify the hook is called correctly
      expect(useImageUpload).toHaveBeenCalled();
    });

    it('shows uploading state', () => {
      (useImageUpload as jest.Mock).mockReturnValue({
        upload: mockUpload,
        isUploading: true,
        error: null,
        retry: jest.fn(),
        reset: jest.fn(),
        retryCount: 0,
      });

      render(
        <ChatDynamicSkillForm
          schema={schemaWithImage}
          values={{}}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByText('Uploading images...')).toBeInTheDocument();
    });

    it('shows upload error with retry button', () => {
      (useImageUpload as jest.Mock).mockReturnValue({
        upload: mockUpload,
        isUploading: false,
        error: new Error('Upload failed'),
        retry: jest.fn(),
        reset: jest.fn(),
        retryCount: 0,
      });

      render(
        <ChatDynamicSkillForm
          schema={schemaWithImage}
          values={{}}
          onChange={mockOnChange}
        />
      );

      expect(screen.getByText('Upload failed: Upload failed')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    });

    it('calls retry when retry button clicked', async () => {
      const mockRetry = jest.fn();
      const user = userEvent.setup();

      (useImageUpload as jest.Mock).mockReturnValue({
        upload: mockUpload,
        isUploading: false,
        error: new Error('Upload failed'),
        retry: mockRetry,
        reset: jest.fn(),
        retryCount: 0,
      });

      render(
        <ChatDynamicSkillForm
          schema={schemaWithImage}
          values={{}}
          onChange={mockOnChange}
        />
      );

      const retryButton = screen.getByRole('button', { name: 'Retry' });
      await user.click(retryButton);

      expect(mockRetry).toHaveBeenCalled();
    });
  });

  describe('Loading State', () => {
    it('shows loading indicator when isLoading is true', () => {
      render(
        <ChatDynamicSkillForm
          schema={mockSchema}
          values={{}}
          onChange={mockOnChange}
          isLoading={true}
        />
      );

      expect(screen.getByText('Processing...')).toBeInTheDocument();
      expect(screen.getByRole('img', { hidden: true })).toHaveClass('animate-spin');
    });
  });

  describe('Form Interaction', () => {
    it('forwards onChange to DynamicSkillForm', async () => {
      const user = userEvent.setup();

      render(
        <ChatDynamicSkillForm
          schema={mockSchema}
          values={{ name: '' }}
          onChange={mockOnChange}
        />
      );

      const input = screen.getByLabelText('Name');
      await user.type(input, 'John');

      expect(mockOnChange).toHaveBeenCalled();
    });

    it('passes values to DynamicSkillForm', () => {
      render(
        <ChatDynamicSkillForm
          schema={mockSchema}
          values={{ name: 'Jane', description: 'Test' }}
          onChange={mockOnChange}
        />
      );

      const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
      expect(nameInput.value).toBe('Jane');
    });
  });
});
