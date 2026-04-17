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

  it('prioritizes Chimera-first scenarios when the saved target looks like Chimera', () => {
    mockState.scenarios = [
      makeScenario({ id: 'crapi-bola', name: 'crAPI Demo', tags: ['crapi'] }),
      makeScenario({ id: 'chimera-sqli', name: 'Chimera First', tags: ['chimera'] }),
    ];
    mockState.targetUrl = 'http://localhost:8880';

    render(<ScenariosPage />);

    expect(screen.getByText(/current target profile:/i)).toHaveTextContent('Chimera-first');

    const chimeraCard = screen.getByText('Chimera First').closest('[class*="card" i]')!;
    const crapiCard = screen.getByText('crAPI Demo').closest('[class*="card" i]')!;

    expect(chimeraCard.compareDocumentPosition(crapiCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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
      expect(mockSetTargetUrl).toHaveBeenCalledWith('http://demo.local');
    });
    await waitFor(() => {
      expect(mockStartSimulation).toHaveBeenCalledWith('sc-1', {
        targetUrl: 'http://demo.local',
        expectWafBlocking: true,
      });
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/simulations');
    });
  });

  it('lets the operator disable WAF-blocking expectations for a simulation run', async () => {
    render(<ScenariosPage />);

    fireEvent.click(screen.getAllByText(/^simulate$/i)[0]);
    const dialog = screen.getByRole('dialog');
    const blockingToggle = within(dialog).getByRole('switch', { name: /expect waf blocking/i });

    fireEvent.click(blockingToggle);
    fireEvent.click(within(dialog).getByRole('button', { name: /start simulation/i }));

    await waitFor(() => {
      expect(mockStartSimulation).toHaveBeenCalledWith('sc-1', {
        targetUrl: 'http://target.local',
        expectWafBlocking: false,
      });
    });
  });

  it('launches an assessment from the dialog and routes to assessments', async () => {
    render(<ScenariosPage />);

    fireEvent.click(screen.getAllByText(/^assess$/i)[0]);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByRole('switch', { name: /expect waf blocking/i })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: /start assessment/i }));

    await waitFor(() => {
      expect(mockStartAssessment).toHaveBeenCalledWith('sc-1', 'http://target.local');
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
    expect(within(dialog).queryByRole('switch', { name: /expect waf blocking/i })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: /start assessment/i }));

    await waitFor(() => {
      expect(mockStartAssessment).toHaveBeenCalledWith('sc-1', 'http://target.local');
    });
    expect(mockStartSimulation).not.toHaveBeenCalled();
  });

  it('warns when a Chimera-targeted scenario includes blocking assertions', () => {
    mockState.scenarios = [
      makeScenario({
        id: 'chimera-sqli',
        name: 'Chimera SQLi',
        tags: ['chimera'],
        steps: [
          {
            id: 's1',
            name: 'Probe',
            stage: 'attack',
            request: { method: 'GET', url: '/test' },
            expect: { blocked: true },
          },
        ],
      }),
    ];
    mockState.targetUrl = 'http://localhost:8880';

    render(<ScenariosPage />);

    fireEvent.click(screen.getByRole('button', { name: /assess/i }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/live chimera is intentionally vulnerable/i)).toBeDefined();
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

  it.each([
    'file:///etc/passwd',
    'data:text/html,<script>alert(1)</script>',
    'ftp://example.com',
  ])('rejects unsupported target protocol %s', (value) => {
    render(<ScenariosPage />);

    fireEvent.click(screen.getAllByText(/^simulate$/i)[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/target url/i), {
      target: { value },
    });

    expect(within(dialog).getByText('Enter an http:// or https:// target URL.')).toBeDefined();
    expect(within(dialog).getByRole('button', { name: /start simulation/i })).toBeDisabled();
  });

  it('rejects malformed target URLs', () => {
    render(<ScenariosPage />);

    fireEvent.click(screen.getAllByText(/^simulate$/i)[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/target url/i), {
      target: { value: 'http//missing-colon' },
    });

    expect(within(dialog).getByText('Target URL must be a valid absolute URL.')).toBeDefined();
    expect(within(dialog).getByRole('button', { name: /start simulation/i })).toBeDisabled();
  });

  it('shows a compatibility hint while the first target URL is still invalid', () => {
    mockState.targetUrl = null;

    render(<ScenariosPage />);

    fireEvent.click(screen.getAllByText(/^simulate$/i)[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/target url/i), {
      target: { value: 'http//missing-colon' },
    });

    expect(within(dialog).getByText('Compatibility guidance will appear once the target URL is valid.')).toBeDefined();
  });

  it('suppresses stale compatibility guidance while an edited target is invalid', () => {
    mockState.scenarios = [
      makeScenario({
        id: 'crapi-bola',
        name: 'crAPI BOLA',
        tags: ['crapi'],
      }),
    ];
    mockState.targetUrl = 'http://localhost:8880';

    render(<ScenariosPage />);

    fireEvent.click(screen.getByRole('button', { name: /simulate/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/target url/i), {
      target: { value: 'http//missing-colon' },
    });

    expect(within(dialog).queryByText('Compatibility guidance will appear once the target URL is valid.')).toBeNull();
    expect(within(dialog).queryByText(/this scenario is labeled for/i)).toBeNull();
  });

  it('falls back to the server default target when the override is blank', async () => {
    render(<ScenariosPage />);

    fireEvent.click(screen.getAllByText(/^simulate$/i)[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/target url/i), {
      target: { value: '' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /start simulation/i }));

    await waitFor(() => {
      expect(mockStartSimulation).toHaveBeenCalledWith('sc-1', {
        targetUrl: null,
        expectWafBlocking: true,
      });
    });
    expect(mockSetTargetUrl).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByText(/^simulate$/i)[0]);
    const reopenedDialog = screen.getByRole('dialog');
    expect(within(reopenedDialog).getByLabelText(/target url/i)).toHaveValue('http://target.local');
  });

  it('rejects target URLs with embedded credentials', () => {
    render(<ScenariosPage />);

    fireEvent.click(screen.getAllByText(/^simulate$/i)[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/target url/i), {
      target: { value: 'http://user:secret@demo.local/' },
    });

    expect(within(dialog).getByText('Target URLs must not include credentials.')).toBeDefined();
    expect(within(dialog).getByRole('button', { name: /start simulation/i })).toBeDisabled();
  });

  it('rejects target URLs with fragments', () => {
    render(<ScenariosPage />);

    fireEvent.click(screen.getAllByText(/^simulate$/i)[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/target url/i), {
      target: { value: 'http://demo.local/#frag' },
    });

    expect(within(dialog).getByText('Target URLs must not include fragments.')).toBeDefined();
    expect(within(dialog).getByRole('button', { name: /start simulation/i })).toBeDisabled();
  });

  it('surfaces specific absolute-url guidance for malformed target URLs', () => {
    render(<ScenariosPage />);

    fireEvent.click(screen.getAllByText(/^simulate$/i)[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/target url/i), {
      target: { value: 'http://' },
    });

    expect(within(dialog).getByText('Target URL must be a valid absolute URL.')).toBeDefined();
    expect(within(dialog).getByRole('button', { name: /start simulation/i })).toBeDisabled();
  });

  it('preserves queries while trimming a root slash from accepted target URLs', async () => {
    render(<ScenariosPage />);

    fireEvent.click(screen.getAllByText(/^simulate$/i)[0]);
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/target url/i), {
      target: { value: 'http://demo.local/?q=1' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /start simulation/i }));

    await waitFor(() => {
      expect(mockStartSimulation).toHaveBeenCalledWith('sc-1', {
        targetUrl: 'http://demo.local/?q=1',
        expectWafBlocking: true,
      });
    });
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
      expect(mockStartSimulation).toHaveBeenCalledWith('sc-1', {
        targetUrl: 'http://bad.local',
        expectWafBlocking: true,
      });
    });
    expect(mockSetTargetUrl).not.toHaveBeenCalledWith('http://bad.local');
    consoleErrorSpy.mockRestore();
  });
});
