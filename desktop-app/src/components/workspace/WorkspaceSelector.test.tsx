import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import WorkspaceSelector from './WorkspaceSelector';
import * as workspaceService from '../../services/workspaceService';

// Mock the workspace service
vi.mock('../../services/workspaceService', async () => {
  const actual = await vi.importActual('../../services/workspaceService');
  return {
    ...actual,
    useWorkspace: vi.fn(),
  };
});

describe('WorkspaceSelector Component', () => {
  const mockWorkspaces = [
    {
      id: '1',
      name: 'Workspace 1',
      path: '/path/1',
      git_remote: null,
      created_at: '2023-01-01T00:00:00Z',
      last_accessed_at: '2023-01-01T00:00:00Z',
      is_active: true,
      metadata_json: null,
    },
    {
      id: '2',
      name: 'Workspace 2',
      path: '/path/2',
      git_remote: 'https://github.com/test/repo.git',
      created_at: '2023-01-02T00:00:00Z',
      last_accessed_at: '2023-01-02T00:00:00Z',
      is_active: false,
      metadata_json: null,
    },
  ];

  const mockUseWorkspace = {
    currentWorkspace: mockWorkspaces[0],
    workspaces: mockWorkspaces,
    loading: false,
    setCurrentWorkspace: vi.fn(),
    createNewWorkspace: vi.fn(),
    refreshWorkspaces: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (workspaceService.useWorkspace as any).mockReturnValue(mockUseWorkspace);
  });

  it('renders current workspace name', () => {
    render(<WorkspaceSelector />);
    expect(screen.getByText('Workspace 1')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    (workspaceService.useWorkspace as any).mockReturnValue({
      ...mockUseWorkspace,
      loading: true,
    });
    render(<WorkspaceSelector />);
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('opens dropdown when clicked', () => {
    render(<WorkspaceSelector />);
    const button = screen.getByRole('button', { name: /Workspace 1/i });
    fireEvent.click(button);
    
    expect(screen.getByText('Workspace 2')).toBeInTheDocument();
    expect(screen.getByText('Create New Workspace')).toBeInTheDocument();
  });

  it('calls setCurrentWorkspace when a workspace is selected', () => {
    render(<WorkspaceSelector />);
    fireEvent.click(screen.getByRole('button', { name: /Workspace 1/i }));
    
    const workspace2Button = screen.getByText('Workspace 2').closest('button');
    fireEvent.click(workspace2Button!);
    
    expect(mockUseWorkspace.setCurrentWorkspace).toHaveBeenCalledWith(mockWorkspaces[1]);
  });

  it('opens create modal and handles workspace creation', async () => {
    mockUseWorkspace.createNewWorkspace.mockResolvedValue({ id: '3', name: 'New Workspace' });
    
    render(<WorkspaceSelector />);
    
    // Open dropdown
    fireEvent.click(screen.getByRole('button', { name: /Workspace 1/i }));
    
    // Click create button
    fireEvent.click(screen.getByText('Create New Workspace'));
    
    // Check if modal is open
    expect(screen.getByText('Create New Workspace', { selector: 'h3' })).toBeInTheDocument();
    
    // Fill form
    const nameInput = screen.getByPlaceholderText('My Project');
    fireEvent.change(nameInput, { target: { value: 'New Workspace' } });
    
    const createBtn = screen.getByRole('button', { name: 'Create' });
    fireEvent.click(createBtn);
    
    await waitFor(() => {
      expect(mockUseWorkspace.createNewWorkspace).toHaveBeenCalledWith('New Workspace', undefined);
    });
    
    // Modal should be closed
    expect(screen.queryByText('Create New Workspace', { selector: 'h3' })).not.toBeInTheDocument();
  });
});
