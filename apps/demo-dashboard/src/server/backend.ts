import { existsSync } from 'fs';
import { IncomingMessage, Server as HttpServer } from 'http';
import { basename, join } from 'path';
import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import { config } from 'dotenv';
import { WebSocketServer } from 'ws';
import { ReportService } from './reports.js';
import { TerminalService } from './terminal.js';
import {
  createCrucibleRuntime,
  type CreateCrucibleRuntimeOptions,
  type CrucibleRuntime,
} from './runtime.js';
import { setupWebSocket } from './websocket.js';

export interface AttachCrucibleBackendOptions extends CreateCrucibleRuntimeOptions {
  apiBasePath?: string;
  healthPath?: string;
  wsPath?: string;
  enableCors?: boolean;
}

export interface CrucibleBackendHandle extends CrucibleRuntime {
  apiBasePath: string;
  healthPath: string;
  terminal: TerminalService;
  wsPath: string;
  wss: WebSocketServer;
  close: () => void;
}

export function attachCrucibleBackend(
  app: Express,
  server: HttpServer,
  options: AttachCrucibleBackendOptions = {},
): CrucibleBackendHandle {
  config();

  const apiBasePath = options.apiBasePath ?? '/api';
  const healthPath = options.healthPath ?? '/health';
  const wsPath = options.wsPath ?? '/';
  const enableCors = options.enableCors ?? true;

  if (enableCors) {
    app.use(cors());
  }
  app.use(express.json());

  const runtime = createCrucibleRuntime(options);
  const { db, dbPath, reportsDir, catalog, repo, engine } = runtime;
  const terminal = new TerminalService();
  const wss = new WebSocketServer({ noServer: true });

  setupWebSocket(wss, engine, terminal);

  server.on('upgrade', (request, socket, head) => {
    if (!matchesWebSocketPath(request, wsPath)) {
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  app.get(healthPath, (_req, res) => {
    res.json({ status: 'ok', timestamp: Date.now(), scenarios: catalog.size, targetUrl: engine.targetUrl });
  });

  app.get(`${apiBasePath}/executions`, (req, res) => {
    const { scenarioId, status, mode, since, until, limit, offset } = req.query;

    const validStatuses = new Set(['pending', 'running', 'completed', 'failed', 'cancelled', 'paused', 'skipped']);
    const validModes = new Set(['simulation', 'assessment']);
    const maxLimit = 200;

    if (mode && !validModes.has(mode as string)) {
      return res.status(400).json({ error: `Invalid mode: ${mode}` });
    }

    let parsedStatuses: string[] | undefined;
    if (status) {
      parsedStatuses = (status as string).split(',');
      const invalid = parsedStatuses.find((entry) => !validStatuses.has(entry));
      if (invalid) {
        return res.status(400).json({ error: `Invalid status: ${invalid}` });
      }
    }

    const parsedLimit = Math.min(Math.max(1, limit ? Number(limit) : 50), maxLimit);

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

  app.post(`${apiBasePath}/executions/pause-all`, (_req, res) => {
    const count = engine.pauseAll();
    res.json({ count });
  });

  app.post(`${apiBasePath}/executions/resume-all`, (_req, res) => {
    const count = engine.resumeAll();
    res.json({ count });
  });

  app.post(`${apiBasePath}/executions/cancel-all`, (_req, res) => {
    const count = engine.cancelAll();
    res.json({ count });
  });

  app.get(`${apiBasePath}/executions/:id`, (req, res) => {
    const execution = engine.getExecution(req.params.id);
    if (!execution) {
      return res.status(404).json({ error: 'Execution not found' });
    }
    res.json(execution);
  });

  app.post(`${apiBasePath}/executions/:id/pause`, (req, res) => {
    const ok = engine.pauseExecution(req.params.id);
    if (!ok) {
      const execution = engine.getExecution(req.params.id);
      if (!execution) {
        return res.status(404).json({ error: 'Execution not found' });
      }
      return res.status(409).json({ error: `Cannot pause execution in ${execution.status} state` });
    }
    res.json({ ok: true });
  });

  app.post(`${apiBasePath}/executions/:id/resume`, (req, res) => {
    const ok = engine.resumeExecution(req.params.id);
    if (!ok) {
      const execution = engine.getExecution(req.params.id);
      if (!execution) {
        return res.status(404).json({ error: 'Execution not found' });
      }
      return res.status(409).json({ error: `Cannot resume execution in ${execution.status} state` });
    }
    res.json({ ok: true });
  });

  app.post(`${apiBasePath}/executions/:id/cancel`, (req, res) => {
    const ok = engine.cancelExecution(req.params.id);
    if (!ok) {
      const execution = engine.getExecution(req.params.id);
      if (!execution) {
        return res.status(404).json({ error: 'Execution not found' });
      }
      return res.status(409).json({ error: `Cannot cancel execution in ${execution.status} state` });
    }
    res.json({ ok: true });
  });

  app.post(`${apiBasePath}/executions/:id/restart`, async (req, res) => {
    try {
      const executionId = await engine.restartExecution(req.params.id);
      if (!executionId) {
        return res.status(404).json({ error: 'Execution not found' });
      }
      res.json({ executionId });
    } catch {
      res.status(500).json({ error: 'Failed to restart execution' });
    }
  });

  app.get(`${apiBasePath}/scenarios`, (_req, res) => {
    res.json(catalog.listScenarios());
  });

  app.post(`${apiBasePath}/simulations`, async (req, res) => {
    try {
      const { scenarioId, targetUrl, ...triggerData } = req.body;
      if (!scenarioId) {
        return res.status(400).json({ error: 'scenarioId is required' });
      }

      const executionId = await engine.startScenario(
        scenarioId,
        'simulation',
        triggerData,
        undefined,
        normalizeLaunchTargetUrl(targetUrl),
      );
      res.json({ executionId, mode: 'simulation', wsUrl: buildWebSocketUrl(req, wsPath) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start simulation';
      const status = error instanceof ScenarioTargetUrlError ? 400 : 500;
      res.status(status).json({ error: message });
    }
  });

  app.post(`${apiBasePath}/assessments`, async (req, res) => {
    try {
      const { scenarioId, targetUrl, ...triggerData } = req.body;
      if (!scenarioId) {
        return res.status(400).json({ error: 'scenarioId is required' });
      }

      const executionId = await engine.startScenario(
        scenarioId,
        'assessment',
        triggerData,
        undefined,
        normalizeLaunchTargetUrl(targetUrl),
      );
      res.json({ executionId, mode: 'assessment', reportUrl: `${apiBasePath}/reports/${executionId}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start assessment';
      const status = error instanceof ScenarioTargetUrlError ? 400 : 500;
      res.status(status).json({ error: message });
    }
  });

  app.put(`${apiBasePath}/scenarios/:id`, (req, res) => {
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

  app.get(`${apiBasePath}/reports/:id`, (req, res) => {
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

    return sendReportFile(req.params.id, requestedFormat, res, reportsDir, engine);
  });

  app.get(`${apiBasePath}/reports/:id/${ReportService.JSON_SUFFIX}`, (req, res) => {
    return sendReportFile(req.params.id, ReportService.JSON_SUFFIX, res, reportsDir, engine);
  });

  app.get(`${apiBasePath}/reports/:id/${ReportService.HTML_SUFFIX}`, (req, res) => {
    return sendReportFile(req.params.id, ReportService.HTML_SUFFIX, res, reportsDir, engine);
  });

  app.get(`${apiBasePath}/reports/:id/pdf`, (req, res) => {
    return sendReportFile(req.params.id, 'pdf', res, reportsDir, engine);
  });

  return {
    ...runtime,
    apiBasePath,
    healthPath,
    terminal,
    wsPath,
    wss,
    close: () => {
      terminal.destroy();
      wss.close();
      db.close();
    },
  };
}

class ScenarioTargetUrlError extends Error {}

function normalizeLaunchTargetUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmed);
  } catch {
    throw new ScenarioTargetUrlError('Scenario target URL must be a valid absolute URL');
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new ScenarioTargetUrlError('Scenario target URL must use http or https');
  }

  if (!parsedUrl.hostname) {
    throw new ScenarioTargetUrlError('Scenario target URL must include a hostname');
  }

  if (parsedUrl.username || parsedUrl.password) {
    throw new ScenarioTargetUrlError('Scenario target URL must not include credentials');
  }

  if (parsedUrl.hash) {
    throw new ScenarioTargetUrlError('Scenario target URL must not include a fragment');
  }

  return trimmed.replace(/\/+$/, '');
}

function matchesWebSocketPath(request: IncomingMessage, wsPath: string): boolean {
  const requestUrl = request.url ?? '/';
  const normalizedUrl = new URL(requestUrl, 'http://127.0.0.1');
  return normalizedUrl.pathname === wsPath;
}

function buildWebSocketUrl(req: Request, wsPath: string): string {
  const host = req.get('host') ?? 'localhost';
  const protocol = req.protocol === 'https' ? 'wss' : 'ws';
  return `${protocol}://${host}${wsPath}`;
}

function sendReportFile(
  id: string,
  format: typeof ReportService.JSON_SUFFIX | typeof ReportService.HTML_SUFFIX | 'pdf',
  res: Response,
  reportsDir: string,
  engine: CrucibleRuntime['engine'],
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
