/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SkillSelector } from './SkillSelector';

vi.mock('@/features/local-ai/skills/useTauriLocalSkillRuntimeStatus', () => ({
  useTauriLocalSkillRuntimeStatus: () => ({
    available: true,
    supportsScriptBundle: true,
    supportsGemma4Text: true,
    supportsGemma4Voice: true,
    nodePath: '/usr/bin/node',
    litertLmPath: '/usr/bin/litert-lm',
    runtimeRoot: '/tmp/local-skill-runtime',
    managedModelRoot: '/tmp/local-skill-runtime/models',
    gemmaProfileIds: ['gemma4-e4b-tauri-balanced'],
    installedGemmaProfileIds: ['gemma4-e4b-tauri-balanced'],
    reason: null,
  }),
}));

vi.mock('@/features/local-ai/adapters/externalLocalTextBackend', () => ({
  shouldAllowExternalLocalBackend: () => false,
  shouldAllowOnDeviceLocalEngine: () => true,
  useExternalLocalTextBackendAvailability: () => ({
    scope: {
      tenantId: 'tenant-1',
      userId: 'user-1',
      runtimeNamespace: 'web',
    },
    backend: null,
  }),
}));

// Mock tRPC
const mockUseQuery = vi.fn();
const mockUseUtils = vi.fn();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    skills: {
      getUserVisibleSkills: {
        useQuery: (...args: any[]) => mockUseQuery(...args),
      },
    },
    useUtils: () => mockUseUtils(),
  },
}));

const mockOnClose = vi.fn();
const mockOnSelect = vi.fn();

const mockSkills = [
  {
    id: 1,
    slug: 'image-generator',
    name: 'Image Generator',
    description: 'Generate images from text',
    icon: 'image',
    category: 'Media',
    priority: 100,
    nativeBundleReady: true,
    nativeBundleFiles: ['SKILL.md', 'skill.lock.json', 'scripts/run.sh', 'scripts/verify.sh'],
  },
  {
    id: 2,
    slug: 'code-assistant',
    name: 'Code Assistant',
    description: 'Help with coding',
    icon: 'code',
    category: 'Development',
    priority: 80,
  },
  {
    id: 3,
    slug: 'text-summarizer',
    name: 'Text Summarizer',
    description: 'Summarize long text',
    icon: 'file-text',
    category: 'Productivity',
    priority: 60,
  },
];

describe('SkillSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseQuery.mockReturnValue({
      data: { skills: mockSkills },
      isLoading: false,
    });
    mockUseUtils.mockReturnValue({
      skills: {
        getInputSchema: {
          fetch: vi.fn().mockResolvedValue({ hasSchema: false }),
        },
      },
    });
    delete (window as any).__TAURI__;
  });

  describe('Rendering', () => {
    it('renders skill list grouped by category', () => {
      render(
        <SkillSelector
          open={true}
          onClose={mockOnClose}
          onSelect={mockOnSelect}
        />
      );

      expect(screen.getByText('Image Generator')).toBeInTheDocument();
      expect(screen.getByText('Code Assistant')).toBeInTheDocument();
      expect(screen.getByText('Text Summarizer')).toBeInTheDocument();
      expect(screen.getByText('Media')).toBeInTheDocument();
      expect(screen.getByText('Development')).toBeInTheDocument();
    });

    it('shows loading state', () => {
      mockUseQuery.mockReturnValue({
        data: null,
        isLoading: true,
      });

      render(
        <SkillSelector
          open={true}
          onClose={mockOnClose}
          onSelect={mockOnSelect}
        />
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('shows native bundle badge for native skills', () => {
      render(
        <SkillSelector
          open={true}
          onClose={mockOnClose}
          onSelect={mockOnSelect}
        />
      );

      expect(screen.getByText('Native')).toBeInTheDocument();
    });

    it('shows empty state when no skills', () => {
      mockUseQuery.mockReturnValue({
        data: { skills: [] },
        isLoading: false,
      });

      render(
        <SkillSelector
          open={true}
          onClose={mockOnClose}
          onSelect={mockOnSelect}
        />
      );

      expect(screen.getByText('No skills available')).toBeInTheDocument();
    });
  });

  describe('Search', () => {
    it('filters skills by search term', async () => {
      const user = userEvent.setup();

      render(
        <SkillSelector
          open={true}
          onClose={mockOnClose}
          onSelect={mockOnSelect}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search skills...');
      await user.type(searchInput, 'image');

      expect(screen.getByText('Image Generator')).toBeInTheDocument();
      expect(screen.queryByText('Code Assistant')).not.toBeInTheDocument();
    });

    it('shows empty state when no search results', async () => {
      const user = userEvent.setup();

      render(
        <SkillSelector
          open={true}
          onClose={mockOnClose}
          onSelect={mockOnSelect}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search skills...');
      await user.type(searchInput, 'nonexistent');

      expect(screen.getByText(/No skills match/)).toBeInTheDocument();
    });
  });

  describe('Schema Indicator', () => {
    it.skip('shows settings icon for skills with schema', async () => {
      mockUseUtils.mockReturnValue({
        skills: {
          getInputSchema: {
            fetch: vi.fn().mockImplementation(({ skillId }: { skillId: string }) => {
              return Promise.resolve({ hasSchema: skillId === 'image-generator' });
            }),
          },
        },
      });

      render(
        <SkillSelector
          open={true}
          onClose={mockOnClose}
          onSelect={mockOnSelect}
        />
      );

      // Wait for schema check
      await waitFor(() => {
        const settingsIcons = screen.getAllByRole('img', { hidden: true });
        // Should have at least one settings icon
        expect(settingsIcons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Selection', () => {
    it('calls onSelect when skill clicked', async () => {
      const user = userEvent.setup();

      render(
        <SkillSelector
          open={true}
          onClose={mockOnClose}
          onSelect={mockOnSelect}
        />
      );

      await user.click(screen.getByText('Image Generator'));

      await waitFor(() => {
        expect(mockOnSelect).toHaveBeenCalledWith('image-generator', expect.any(Boolean));
      });
    });

    it('calls onSelect with correct args', async () => {
      const user = userEvent.setup();

      mockUseUtils.mockReturnValue({
        skills: {
          getInputSchema: {
            fetch: vi.fn().mockResolvedValue({ hasSchema: true }),
          },
        },
      });

      render(
        <SkillSelector
          open={true}
          onClose={mockOnClose}
          onSelect={mockOnSelect}
        />
      );

      await waitFor(() => {
        // Wait for schema check
      });

      await user.click(screen.getByText('Image Generator'));

      await waitFor(() => {
        expect(mockOnSelect).toHaveBeenCalledWith('image-generator', true);
      });
    });
  });

  describe('Local execution badges', () => {
    it('does not render a local-safe badge on web-only sessions', () => {
      mockUseQuery.mockReturnValue({
        data: {
          skills: [
            {
              ...mockSkills[1],
              localExecutionPolicy: {
                tier: 'local_safe',
                runtimeKind: 'gemma4_text',
                eligible: false,
                reviewed: true,
                allowOffline: true,
                requiresTauri: true,
                reason: 'local_safe_requires_tauri',
                warnings: [],
                derivedFrom: ['frontmatter'],
                signals: {
                  requiresNetwork: false,
                  requiresBrowser: false,
                  maxRuntimeSeconds: null,
                  maxInputMb: null,
                  sandboxProfileSlug: null,
                },
                localScriptManifest: null,
              },
            },
          ],
        },
        isLoading: false,
      });

      render(
        <SkillSelector
          open={true}
          onClose={mockOnClose}
          onSelect={mockOnSelect}
        />
      );

      expect(screen.queryByText('Local Safe')).not.toBeInTheDocument();
    });

    it('renders a local-safe badge for tauri-safe skills', () => {
      (window as any).__TAURI__ = {};
      mockUseQuery.mockReturnValue({
        data: {
          skills: [
            {
              ...mockSkills[1],
              localExecutionPolicy: {
                tier: 'local_safe',
                runtimeKind: 'gemma4_text',
                eligible: true,
                reviewed: true,
                allowOffline: true,
                requiresTauri: true,
                reason: 'local_safe_text_skill',
                warnings: [],
                derivedFrom: ['frontmatter'],
                signals: {
                  requiresNetwork: false,
                  requiresBrowser: false,
                  maxRuntimeSeconds: null,
                  maxInputMb: null,
                  sandboxProfileSlug: null,
                },
                localScriptManifest: null,
              },
            },
          ],
        },
        isLoading: false,
      });

      render(
        <SkillSelector
          open={true}
          onClose={mockOnClose}
          onSelect={mockOnSelect}
        />
      );

      expect(screen.getByText('Local Safe')).toBeInTheDocument();
    });
  });

  describe('Keyboard Navigation', () => {
    it('navigates with arrow keys', () => {
      render(
        <SkillSelector
          open={true}
          onClose={mockOnClose}
          onSelect={mockOnSelect}
        />
      );

      // Press arrow down to select first item
      fireEvent.keyDown(window, { key: 'ArrowDown' });

      // Press enter to select
      fireEvent.keyDown(window, { key: 'Enter' });

      expect(mockOnSelect).toHaveBeenCalled();
    });

    it('closes with escape key', () => {
      render(
        <SkillSelector
          open={true}
          onClose={mockOnClose}
          onSelect={mockOnSelect}
        />
      );

      fireEvent.keyDown(window, { key: 'Escape' });

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Dialog Behavior', () => {
    it('calls onClose when dialog closes', async () => {
      const user = userEvent.setup();

      render(
        <SkillSelector
          open={true}
          onClose={mockOnClose}
          onSelect={mockOnSelect}
        />
      );

      // Click outside or close button
      const closeButton = screen.getByRole('button', { name: /close/i });
      await user.click(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('resets state when closed', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <SkillSelector
          open={true}
          onClose={mockOnClose}
          onSelect={mockOnSelect}
        />
      );

      // Type in search
      const searchInput = screen.getByPlaceholderText('Search skills...');
      await user.type(searchInput, 'test');

      // Close and reopen
      rerender(
        <SkillSelector
          open={false}
          onClose={mockOnClose}
          onSelect={mockOnSelect}
        />
      );

      rerender(
        <SkillSelector
          open={true}
          onClose={mockOnClose}
          onSelect={mockOnSelect}
        />
      );

      // Search should be reset
      expect(screen.getByPlaceholderText('Search skills...')).toHaveValue('');
    });
  });
});
