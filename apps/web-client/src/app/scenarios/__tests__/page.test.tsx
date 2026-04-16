import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

  it('updates the launch target override from the input field', () => {
    render(<ScenariosPage />);

    const targetInput = screen.getByLabelText(/target url/i);
    fireEvent.change(targetInput, { target: { value: '  http://demo.local  ' } });

    expect(mockSetTargetUrl).toHaveBeenCalledWith('http://demo.local');
  });

  it('Simulate button launches with the selected target and routes to simulations', async () => {
    render(<ScenariosPage />);

    const simulateButtons = screen.getAllByText(/^simulate$/i);
    fireEvent.click(simulateButtons[0]);

    await waitFor(() => {
      expect(mockStartSimulation).toHaveBeenCalledWith('sc-1', 'http://target.local');
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/simulations');
    });
  });

  it('Assess button launches with the selected target and routes to assessments', async () => {
    render(<ScenariosPage />);

    const assessButtons = screen.getAllByText(/^assess$/i);
    fireEvent.click(assessButtons[0]);

    await waitFor(() => {
      expect(mockStartAssessment).toHaveBeenCalledWith('sc-1', 'http://target.local');
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/assessments');
    });
  });
});
