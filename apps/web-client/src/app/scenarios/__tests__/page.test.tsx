import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import ScenariosPage from '../page';

// ── TASK-19: Test scenario pages search, filter, and dialog ─────────

// Mock store
const mockFetchScenarios = vi.fn();
const mockStartSimulation = vi.fn();
const mockStartAssessment = vi.fn();
const mockSetTargetUrl = vi.fn();
const mockClearError = vi.fn();
const mockPush = vi.fn();

let mockState: Record<string, unknown> = {};

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('@/store/useCatalogStore', () => ({
  useCatalogStore: () => ({
    scenarios: mockState.scenarios ?? [],
    isLoading: mockState.isLoading ?? false,
    error: mockState.error ?? null,
    targetUrl: mockState.targetUrl ?? null,
    targetStatus: mockState.targetStatus ?? 'unknown',
    fetchScenarios: mockFetchScenarios,
    startSimulation: mockStartSimulation,
    startAssessment: mockStartAssessment,
    setTargetUrl: mockSetTargetUrl,
    clearError: mockClearError,
  }),
}));

// Mock the detail dialog to keep tests focused
vi.mock('@/components/scenario-detail-dialog', () => ({
  ScenarioDetailDialog: ({ scenario, open }: any) =>
    open ? <div data-testid="detail-dialog">{scenario?.name}</div> : null,
}));

function makeScenario(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sc-1',
    name: 'Auth Bypass',
    description: 'Tests authentication bypass',
    category: 'auth',
    difficulty: 'intermediate',
    tags: ['security', 'auth'],
    steps: [{ id: 's1', name: 'Step 1', stage: 'main', request: { method: 'GET', url: '/test' } }],
    ...overrides,
  } as any;
}

describe('ScenariosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState = {
      scenarios: [
        makeScenario(),
        makeScenario({ id: 'sc-2', name: 'XSS Injection', description: 'Cross-site scripting test', category: 'web', difficulty: 'advanced', tags: ['xss'] }),
        makeScenario({ id: 'sc-3', name: 'SQL Injection', description: 'Database injection test', category: 'database', difficulty: 'beginner', tags: ['sql'] }),
      ],
      isLoading: false,
      targetUrl: 'http://target.local',
      targetStatus: 'online',
    };
    mockStartSimulation.mockResolvedValue('sim-1');
    mockStartAssessment.mockResolvedValue('assess-1');
  });

  it('calls fetchScenarios on mount', () => {
    render(<ScenariosPage />);
    expect(mockFetchScenarios).toHaveBeenCalledTimes(1);
  });

  it('renders all scenarios when no search query', () => {
    render(<ScenariosPage />);

    expect(screen.getByText('Auth Bypass')).toBeDefined();
    expect(screen.getByText('XSS Injection')).toBeDefined();
    expect(screen.getByText('SQL Injection')).toBeDefined();
  });

  it('filters scenarios by name (case-insensitive)', () => {
    render(<ScenariosPage />);

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'xss' } });

    expect(screen.getByText('XSS Injection')).toBeDefined();
    expect(screen.queryByText('Auth Bypass')).toBeNull();
    expect(screen.queryByText('SQL Injection')).toBeNull();
  });

  it('filters scenarios by category', () => {
    render(<ScenariosPage />);

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'database' } });

    expect(screen.getByText('SQL Injection')).toBeDefined();
    expect(screen.queryByText('Auth Bypass')).toBeNull();
  });

  it('filters scenarios by tag', () => {
    render(<ScenariosPage />);

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'security' } });

    expect(screen.getByText('Auth Bypass')).toBeDefined();
    expect(screen.queryByText('XSS Injection')).toBeNull();
  });

  it('shows empty state when no scenarios match search', () => {
    render(<ScenariosPage />);

    const searchInput = screen.getByPlaceholderText(/search/i);
    fireEvent.change(searchInput, { target: { value: 'zzzzz-no-match' } });

    expect(screen.getByText(/no scenarios match/i)).toBeDefined();
  });

  it('shows skeleton loaders during isLoading', () => {
    mockState.isLoading = true;
    mockState.scenarios = [];

    const { container } = render(<ScenariosPage />);

    // Skeleton renders divs — there should be loading placeholders
    // The page renders 6 Skeleton elements when loading
    expect(container.querySelectorAll('[class*="skeleton" i], [data-slot="skeleton"]').length).toBeGreaterThanOrEqual(1);
  });

  it('opens detail dialog when scenario card is clicked', () => {
    render(<ScenariosPage />);

    const card = screen.getByText('Auth Bypass').closest('[class*="card" i]')!;
    fireEvent.click(card);

    expect(screen.getByTestId('detail-dialog')).toBeDefined();
  });

  it('opens a launch dialog with the saved target prefilled', () => {
    render(<ScenariosPage />);

    fireEvent.click(screen.getAllByText(/^simulate$/i)[0]);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Launch Auth Bypass')).toBeDefined();
    expect(within(dialog).getByLabelText(/target url/i)).toHaveValue('http://target.local');
  });

  it('launches a simulation from the dialog and persists the chosen target', async () => {
    render(<ScenariosPage />);

    fireEvent.click(screen.getAllByText(/^simulate$/i)[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/target url/i), {
      target: { value: '  http://demo.local  ' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /start simulation/i }));

    await waitFor(() => {
      expect(mockSetTargetUrl).toHaveBeenCalledWith('http://demo.local/');
    });
    await waitFor(() => {
      expect(mockStartSimulation).toHaveBeenCalledWith('sc-1', 'http://demo.local/');
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/simulations');
    });
  });

  it('launches an assessment from the dialog and routes to assessments', async () => {
    render(<ScenariosPage />);

    fireEvent.click(screen.getAllByText(/^assess$/i)[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /start assessment/i }));

    await waitFor(() => {
      expect(mockStartAssessment).toHaveBeenCalledWith('sc-1', 'http://target.local/');
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/assessments');
    });
  });

  it('lets the operator switch launch mode before confirming', async () => {
    render(<ScenariosPage />);

    fireEvent.click(screen.getAllByText(/^simulate$/i)[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('radio', { name: /^assessment$/i }));
    fireEvent.click(within(dialog).getByRole('button', { name: /start assessment/i }));

    await waitFor(() => {
      expect(mockStartAssessment).toHaveBeenCalledWith('sc-1', 'http://target.local/');
    });
    expect(mockStartSimulation).not.toHaveBeenCalled();
  });

  it('blocks invalid target URLs before launch', () => {
    render(<ScenariosPage />);

    fireEvent.click(screen.getAllByText(/^simulate$/i)[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/target url/i), {
      target: { value: 'javascript:alert(1)' },
    });

    expect(within(dialog).getByText('Enter an http:// or https:// target URL.')).toBeDefined();
    expect(within(dialog).getByRole('button', { name: /start simulation/i })).toBeDisabled();
  });

  it('does not persist the saved target when launch fails', async () => {
    mockStartSimulation.mockRejectedValueOnce(new Error('bad target'));
    mockState.error = 'Target is invalid';
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<ScenariosPage />);

    fireEvent.click(screen.getAllByText(/^simulate$/i)[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/target url/i), {
      target: { value: 'http://bad.local' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /start simulation/i }));

    await waitFor(() => {
      expect(mockStartSimulation).toHaveBeenCalledWith('sc-1', 'http://bad.local/');
    });
    expect(mockSetTargetUrl).not.toHaveBeenCalledWith('http://bad.local/');
    consoleErrorSpy.mockRestore();
  });
});
