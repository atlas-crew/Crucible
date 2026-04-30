import { existsSync, realpathSync } from 'fs';
import { IncomingMessage, Server as HttpServer } from 'http';
import { basename, join } from 'path';
import cors from 'cors';
import express, { type Express, type Request, type Response } from 'express';
import { config } from 'dotenv';
import { WebSocketServer } from 'ws';
import { normalizeScenarioTargetUrl, ScenarioTargetUrlError } from '@crucible/catalog/client';
import { z } from 'zod';
import { ReportService } from './reports.js';
import { TerminalService } from './terminal.js';
import type { SimulationTriggerData } from '../shared/types.js';
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

const LaunchTargetUrlSchema: z.ZodType<string | null | undefined> = z
  .string()
  .nullable()
  .optional()
  .transform((value, ctx) => {
    if (value == null) {
      return value;
    }

    try {
      return normalizeScenarioTargetUrl(value);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : 'Scenario target URL is invalid',
      });
      return z.NEVER;
    }
  });

const SimulationTriggerDataSchema: z.ZodType<SimulationTriggerData> = z
  .object({
    expectWafBlocking: z.boolean().optional(),
  })
  .catchall(z.unknown());

const LegacyTriggerDataSchema = z.record(z.string(), z.unknown());

function stripUndefinedValues<T extends Record<string, unknown>>(value: T | undefined): Partial<T> | undefined {
  if (!value) {
    return undefined;
  }

  const definedEntries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined);
  return definedEntries.length > 0 ? Object.fromEntries(definedEntries) as Partial<T> : undefined;
}

function addOverlapIssue(ctx: z.RefinementCtx, key: string): void {
  const message =
    'Pass overlapping triggerData keys either at the top level or under triggerData, not both ('
    + key
    + ')';

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message,
    path: [key],
  });

  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message,
    path: ['triggerData', key],
  });
}

const SimulationLaunchRequestSchema = z
  .object({
    scenarioId: z.string().min(1, 'scenarioId is required'),
    targetUrl: LaunchTargetUrlSchema,
    triggerData: SimulationTriggerDataSchema.optional(),
  })
  .strict();

const RawSimulationLaunchRequestSchema = z
  .object({
    scenarioId: z.string().min(1, 'scenarioId is required'),
    targetUrl: LaunchTargetUrlSchema,
    triggerData: SimulationTriggerDataSchema.optional(),
    expectWafBlocking: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.expectWafBlocking !== undefined
      && value.triggerData?.expectWafBlocking !== undefined
    ) {
      addOverlapIssue(ctx, 'expectWafBlocking');
    }
  });

const AssessmentLaunchRequestSchema = z
  .object({
    scenarioId: z.string().min(1, 'scenarioId is required'),
    targetUrl: LaunchTargetUrlSchema,
    triggerData: LegacyTriggerDataSchema.optional(),
  })
  .strict();

const RawAssessmentLaunchRequestSchema = z
  .object({
    scenarioId: z.string().min(1, 'scenarioId is required'),
    targetUrl: LaunchTargetUrlSchema,
    triggerData: LegacyTriggerDataSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.triggerData?.expectWafBlocking !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'expectWafBlocking is only supported for simulation launches',
        path: ['triggerData', 'expectWafBlocking'],
      });
    }
  });

export type SimulationLaunchRequest = z.infer<typeof SimulationLaunchRequestSchema>;
export type AssessmentLaunchRequest = z.infer<typeof AssessmentLaunchRequestSchema>;

function isScenarioTargetUrlError(error: unknown): boolean {
  return error instanceof ScenarioTargetUrlError;
}

export function parseSimulationLaunchRequest(
  body: unknown,
): z.SafeParseReturnType<unknown, SimulationLaunchRequest> {
  const parsed = RawSimulationLaunchRequestSchema.safeParse(body);
  if (!parsed.success) {
    return parsed;
  }

  const { scenarioId, targetUrl, triggerData, expectWafBlocking } = parsed.data;
  const sanitizedTriggerData = stripUndefinedValues(triggerData);
  const mergedTriggerData =
    expectWafBlocking !== undefined || sanitizedTriggerData
      ? {
          ...(expectWafBlocking !== undefined ? { expectWafBlocking } : {}),
          ...(sanitizedTriggerData ?? {}),
        }
      : undefined;

  return SimulationLaunchRequestSchema.safeParse({
    scenarioId,
    targetUrl,
    ...(mergedTriggerData && Object.keys(mergedTriggerData).length > 0 ? { triggerData: mergedTriggerData } : {}),
  });
}

export function parseAssessmentLaunchRequest(
  body: unknown,
): z.SafeParseReturnType<unknown, AssessmentLaunchRequest> {
  return RawAssessmentLaunchRequestSchema.safeParse(body);
}

function formatValidationError(error: z.ZodError) {
  return {
    error: error.issues[0]?.message ?? 'Invalid request',
    issues: error.issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      path: issue.path.join('.'),
    })),
  };
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
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to restart execution';
      const status = isScenarioTargetUrlError(error) ? 400 : 500;
      res.status(status).json({ error: message });
    }
  });

  app.get(`${apiBasePath}/scenarios`, (_req, res) => {
    res.json(catalog.listScenarios());
  });

  app.post(`${apiBasePath}/simulations`, async (req, res) => {
    try {
      const parsedRequest = parseSimulationLaunchRequest(req.body);
      if (!parsedRequest.success) {
        return res.status(400).json(formatValidationError(parsedRequest.error));
      }

      const { scenarioId, targetUrl, triggerData } = parsedRequest.data;

      const executionId = await engine.startScenario(
        scenarioId,
        'simulation',
        triggerData,
        undefined,
        targetUrl ?? undefined,
      );
      res.json({ executionId, mode: 'simulation', wsUrl: buildWebSocketUrl(req, wsPath) });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start simulation';
      const status = isScenarioTargetUrlError(error) ? 400 : 500;
      res.status(status).json({ error: message });
    }
  });

  app.post(`${apiBasePath}/assessments`, async (req, res) => {
    try {
      const parsedRequest = parseAssessmentLaunchRequest(req.body);
      if (!parsedRequest.success) {
        return res.status(400).json(formatValidationError(parsedRequest.error));
      }

      const { scenarioId, targetUrl, triggerData } = parsedRequest.data;

      const executionId = await engine.startScenario(
        scenarioId,
        'assessment',
        triggerData,
        undefined,
        targetUrl ?? undefined,
      );
      res.json({ executionId, mode: 'assessment', reportUrl: `${apiBasePath}/reports/${executionId}` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to start assessment';
      const status = isScenarioTargetUrlError(error) ? 400 : 500;
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

  // Artifacts produced by external runners (k6, nuclei) live under
  // <reportsDir>/<executionId>/<stepId>/<file>. The runner returns URL paths
  // shaped like this route so consumers can download them without leaking the
  // filesystem layout.
  app.get(
    `${apiBasePath}/reports/:executionId/artifacts/:stepId/:filename`,
    (req, res) => {
      return sendArtifactFile(
        req.params.executionId,
        req.params.stepId,
        req.params.filename,
        res,
        reportsDir,
        engine,
      );
    },
  );

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

const ARTIFACT_CONTENT_TYPES: Record<string, string> = {
  '.json': 'application/json; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

export function artifactContentType(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return 'application/octet-stream';
  return ARTIFACT_CONTENT_TYPES[filename.slice(dot)] ?? 'application/octet-stream';
}

export type ResolveArtifactResult =
  | { ok: true; path: string }
  | { ok: false; status: 400 | 403 | 404 };

/**
 * Resolve an artifact filesystem path under reportsDir, rejecting any input
 * that escapes the root via path separators, traversal, or symlinks. Pure
 * function so security cases can be exercised without an express harness.
 */
export function resolveArtifactPath(
  reportsDir: string,
  executionId: string,
  stepId: string,
  filename: string,
): ResolveArtifactResult {
  // basename strips any path separators an attacker put in the URL params.
  const safeExecution = basename(executionId);
  const safeStep = basename(stepId);
  const safeFile = basename(filename);
  if (!safeExecution || !safeStep || !safeFile) {
    return { ok: false, status: 400 };
  }
  const candidatePath = join(reportsDir, safeExecution, safeStep, safeFile);
  if (!existsSync(candidatePath)) {
    return { ok: false, status: 404 };
  }
  // realpath defeats symlink-based escapes that `basename` and a literal
  // string-prefix check would miss.
  let resolvedPath: string;
  let resolvedRoot: string;
  try {
    resolvedPath = realpathSync(candidatePath);
    resolvedRoot = realpathSync(reportsDir);
  } catch {
    return { ok: false, status: 404 };
  }
  const rootWithSep = resolvedRoot.endsWith('/') ? resolvedRoot : `${resolvedRoot}/`;
  if (!resolvedPath.startsWith(rootWithSep)) {
    return { ok: false, status: 403 };
  }
  return { ok: true, path: resolvedPath };
}

/**
 * Whether an execution is allowed to expose runner artifacts via the public
 * download endpoint. Mirrors sendReportFile's gate so simulation-mode runs
 * (which may produce runner output in the future) don't silently leak.
 */
export function isArtifactExposable(
  execution: { mode?: string; steps: Array<{ stepId: string }> } | undefined,
  stepId: string,
): boolean {
  if (!execution || execution.mode !== 'assessment') return false;
  return execution.steps.some((s) => s.stepId === stepId);
}

function sendArtifactFile(
  executionId: string,
  stepId: string,
  filename: string,
  res: Response,
  reportsDir: string,
  engine: CrucibleRuntime['engine'],
) {
  const execution = engine.getExecution(executionId);
  if (!isArtifactExposable(execution, stepId)) {
    return res.status(404).json({ error: 'Artifact not found' });
  }

  const resolution = resolveArtifactPath(reportsDir, executionId, stepId, filename);
  if (!resolution.ok) {
    const messageByStatus: Record<400 | 403 | 404, string> = {
      400: 'Invalid artifact path',
      403: 'Access denied',
      404: 'Artifact not found',
    };
    return res.status(resolution.status).json({ error: messageByStatus[resolution.status] });
  }

  const safeFile = basename(filename);
  res.setHeader('Content-Type', artifactContentType(safeFile));
  // Mirror sendReportFile so curl/script consumers get a sensible filename
  // and browsers download instead of inlining text/plain.
  res.setHeader('Content-Disposition', `attachment; filename="${safeFile}"`);
  return res.sendFile(resolution.path, (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: 'Failed to serve artifact' });
    }
  });
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
