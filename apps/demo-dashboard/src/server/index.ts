import { existsSync, mkdirSync } from 'fs';
import { join, basename, resolve } from 'path';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { config } from 'dotenv';
import { CatalogService, createDb, ExecutionRepository } from '@crucible/catalog';
import { setupWebSocket } from './websocket.js';
import { ScenarioEngine } from './engine.js';
import { ReportService } from './reports.js';
import { TerminalService } from './terminal.js';

config();

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// ── Database setup ───────────────────────────────────────────────────
const dbPath = process.env.CRUCIBLE_DB_PATH || './data/crucible.db';
mkdirSync(dbPath.replace(/\/[^/]+$/, ''), { recursive: true });
const db = createDb(dbPath);
const repo = new ExecutionRepository(db);
repo.ensureTables();

const reportsDir = resolve(process.env.CRUCIBLE_REPORTS_DIR || './data/reports');
mkdirSync(reportsDir, { recursive: true });

const reportService = new ReportService({ 
  reportsDir, 
  baseUrl: process.env.CRUCIBLE_BASE_URL || `http://localhost:${PORT}` 
});

const catalog = new CatalogService();
const engine = new ScenarioEngine(catalog, repo, reportService);
const terminal = new TerminalService();

// WebSocket setup
setupWebSocket(wss, engine, terminal);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: Date.now(), scenarios: catalog.size, targetUrl: engine.targetUrl });
});

// ── Execution history ────────────────────────────────────────────────

app.get('/api/executions', (req, res) => {
  const { scenarioId, status, mode, since, until, limit, offset } = req.query;

  const VALID_STATUSES = new Set(['pending', 'running', 'completed', 'failed', 'cancelled', 'paused', 'skipped']);
  const VALID_MODES = new Set(['simulation', 'assessment']);
  const MAX_LIMIT = 200;

  if (mode && !VALID_MODES.has(mode as string)) {
    return res.status(400).json({ error: `Invalid mode: ${mode}` });
  }

  let parsedStatuses: string[] | undefined;
  if (status) {
    parsedStatuses = (status as string).split(',');
    const invalid = parsedStatuses.find((s) => !VALID_STATUSES.has(s));
    if (invalid) {
      return res.status(400).json({ error: `Invalid status: ${invalid}` });
    }
  }

  const parsedLimit = Math.min(Math.max(1, limit ? Number(limit) : 50), MAX_LIMIT);

  const executions = repo.listExecutions({
    scenarioId: scenarioId as string | undefined,
    status: parsedStatuses as never,
    mode: mode as 'simulation' | 'assessment' | undefined,
    since: since ? Number(since) : undefined,
    until: until ? Number(until) : undefined,
    limit: parsedLimit,
    offset: offset ? Number(offset) : undefined,
  });
  res.json(executions);
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

app.get('/api/executions/:id', (req, res) => {
  const execution = engine.getExecution(req.params.id);
  if (!execution) {
    return res.status(404).json({ error: 'Execution not found' });
  }
  res.json(execution);
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

  const requestedFormat =
    req.query.format === ReportService.JSON_SUFFIX || req.query.format === ReportService.HTML_SUFFIX
      ? req.query.format
      : undefined;

  if (execution.status !== 'completed' && execution.status !== 'failed') {
    return requestedFormat
      ? res.status(202).json({ error: 'Report is still being generated', execution })
      : res.status(202).json(execution);
  }

  if (!requestedFormat) {
    return res.json(execution.report || execution);
  }

  return sendReportFile(req.params.id, requestedFormat, res);
});

app.get(`/api/reports/:id/${ReportService.JSON_SUFFIX}`, (req, res) => {
  return sendReportFile(req.params.id, ReportService.JSON_SUFFIX, res);
});

app.get(`/api/reports/:id/${ReportService.HTML_SUFFIX}`, (req, res) => {
  return sendReportFile(req.params.id, ReportService.HTML_SUFFIX, res);
});

// Legacy compatibility for older persisted assessment artifacts.
app.get('/api/reports/:id/pdf', (req, res) => {
  return sendReportFile(req.params.id, 'pdf', res);
});

server.listen(PORT, () => {
  console.log(`Demo Dashboard server running on port ${PORT} (${catalog.size} scenarios loaded, target: ${engine.targetUrl}, db: ${dbPath})`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────
function shutdown() {
  console.log('Shutting down…');
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

function sendReportFile(
  id: string,
  format: typeof ReportService.JSON_SUFFIX | typeof ReportService.HTML_SUFFIX | 'pdf',
  res: express.Response,
) {
  const execution = engine.getExecution(id);
  if (!execution || execution.mode !== 'assessment') {
    return res.status(404).json({ error: 'Report not found' });
  }

  if (execution.status !== 'completed' && execution.status !== 'failed') {
    return res.status(202).json({ error: 'Report is still being generated', execution });
  }

  const safeId = basename(id);
  const fileName = `${safeId}.${format}`;
  const filePath = join(reportsDir, fileName);

  if (format === ReportService.HTML_SUFFIX) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
  } else if (format === ReportService.JSON_SUFFIX) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
  } else {
    res.setHeader('Content-Type', 'application/pdf');
  }

  if (!existsSync(filePath)) {
    return res.status(202).json({ error: 'Report is still being generated', execution });
  }

  res.setHeader('Content-Disposition', `attachment; filename="${safeId}-report.${format}"`);
  return res.sendFile(fileName, { root: reportsDir }, (err) => {
    if (!err) {
      return;
    }

    if (!res.headersSent) {
      const statusCode =
        typeof err === 'object' && err != null && 'code' in err && err.code === 'ENOENT'
          ? 202
          : 404;
      res.status(statusCode).json({
        error:
          statusCode === 202
            ? 'Report is still being generated'
            : `${format.toUpperCase()} report file not found`,
        execution,
      });
    }
  });
}
