import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { config } from 'dotenv';
import { CatalogService } from '@crucible/catalog';
import { setupWebSocket } from './websocket.js';
import { ScenarioEngine } from './engine.js';

config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

const catalog = new CatalogService();
const engine = new ScenarioEngine(catalog);

// WebSocket setup
setupWebSocket(wss, engine);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), scenarios: catalog.size });
});

// ── Global execution control routes (BEFORE parameterized routes) ────

app.post('/api/executions/pause-all', (_req, res) => {
  const count = engine.pauseAll();
  res.json({ count });
});

app.post('/api/executions/resume-all', (_req, res) => {
  const count = engine.resumeAll();
  res.json({ count });
});

app.post('/api/executions/cancel-all', (_req, res) => {
  const count = engine.cancelAll();
  res.json({ count });
});

// ── Per-execution control routes ─────────────────────────────────────

app.post('/api/executions/:id/pause', (req, res) => {
  const ok = engine.pauseExecution(req.params.id);
  if (!ok) {
    const exec = engine.getExecution(req.params.id);
    if (!exec) return res.status(404).json({ error: 'Execution not found' });
    return res.status(409).json({ error: `Cannot pause execution in ${exec.status} state` });
  }
  res.json({ ok: true });
});

app.post('/api/executions/:id/resume', (req, res) => {
  const ok = engine.resumeExecution(req.params.id);
  if (!ok) {
    const exec = engine.getExecution(req.params.id);
    if (!exec) return res.status(404).json({ error: 'Execution not found' });
    return res.status(409).json({ error: `Cannot resume execution in ${exec.status} state` });
  }
  res.json({ ok: true });
});

app.post('/api/executions/:id/cancel', (req, res) => {
  const ok = engine.cancelExecution(req.params.id);
  if (!ok) {
    const exec = engine.getExecution(req.params.id);
    if (!exec) return res.status(404).json({ error: 'Execution not found' });
    return res.status(409).json({ error: `Cannot cancel execution in ${exec.status} state` });
  }
  res.json({ ok: true });
});

app.post('/api/executions/:id/restart', async (req, res) => {
  try {
    const executionId = await engine.restartExecution(req.params.id);
    if (!executionId) {
      return res.status(404).json({ error: 'Execution not found' });
    }
    res.json({ executionId });
  } catch (error) {
    res.status(500).json({ error: 'Failed to restart execution' });
  }
});

// API routes
app.get('/api/scenarios', (_req, res) => {
  const scenarios = catalog.listScenarios();
  res.json(scenarios);
});

// Start a Real-time Simulation (WebSockets)
app.post('/api/simulations', async (req, res) => {
  try {
    const { scenarioId, ...triggerData } = req.body;
    if (!scenarioId) return res.status(400).json({ error: 'scenarioId is required' });

    const executionId = await engine.startScenario(scenarioId, 'simulation', triggerData);
    res.json({ executionId, mode: 'simulation', wsUrl: `ws://localhost:${PORT}` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start simulation' });
  }
});

// Start a Run-and-Report Assessment (Persistent)
app.post('/api/assessments', async (req, res) => {
  try {
    const { scenarioId, ...triggerData } = req.body;
    if (!scenarioId) return res.status(400).json({ error: 'scenarioId is required' });

    const executionId = await engine.startScenario(scenarioId, 'assessment', triggerData);
    res.json({ executionId, mode: 'assessment', reportUrl: `/api/reports/${executionId}` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start assessment' });
  }
});

app.put('/api/scenarios/:id', (req, res) => {
  try {
    const { id } = req.params;
    if (!catalog.getScenario(id)) {
      return res.status(404).json({ error: `Scenario "${id}" not found` });
    }
    const updated = catalog.updateScenario(id, req.body);
    res.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.startsWith('Validation failed') ? 400 : 500;
    res.status(status).json({ error: message });
  }
});

app.get('/api/reports/:id', (req, res) => {
  const execution = engine.getExecution(req.params.id);
  if (!execution || execution.mode !== 'assessment') {
    return res.status(404).json({ error: 'Report not found' });
  }
  if (execution.status !== 'completed' && execution.status !== 'failed') {
    return res.status(202).json(execution);
  }
  res.json(execution.report || execution);
});

server.listen(PORT, () => {
  console.log(`Demo Dashboard server running on port ${PORT} (${catalog.size} scenarios loaded)`);
});
