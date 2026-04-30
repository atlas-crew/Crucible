import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { CatalogService, createDb, ExecutionRepository } from '@crucible/catalog';
import { ScenarioEngine } from './engine.js';
import { ReportService } from './reports.js';

export interface CreateCrucibleRuntimeOptions {
  port?: number;
  baseUrl?: string;
  dbPath?: string;
  reportsDir?: string;
  scenariosDir?: string;
  targetUrl?: string;
}

export interface CrucibleRuntime {
  baseUrl: string;
  db: ReturnType<typeof createDb>;
  dbPath: string;
  reportsDir: string;
  catalog: CatalogService;
  repo: ExecutionRepository;
  reportService: ReportService;
  engine: ScenarioEngine;
}

export function createCrucibleRuntime(
  options: CreateCrucibleRuntimeOptions = {},
): CrucibleRuntime {
  const port = options.port ?? Number(process.env.PORT ?? 3001);
  const configuredDbPath = options.dbPath ?? process.env.CRUCIBLE_DB_PATH ?? './data/crucible.db';
  const scenariosDir = options.scenariosDir ?? process.env.CRUCIBLE_SCENARIOS_DIR;
  const dbPath = configuredDbPath === ':memory:' ? configuredDbPath : resolve(configuredDbPath);
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = createDb(dbPath);
  const repo = new ExecutionRepository(db);
  repo.ensureTables();

  const reportsDir = resolve(options.reportsDir ?? process.env.CRUCIBLE_REPORTS_DIR ?? './data/reports');
  mkdirSync(reportsDir, { recursive: true });

  const baseUrl = options.baseUrl ?? process.env.CRUCIBLE_BASE_URL ?? `http://localhost:${port}`;
  const reportService = new ReportService({ reportsDir, baseUrl });
  const catalog = new CatalogService(scenariosDir);
  const engine = new ScenarioEngine(
    catalog,
    repo,
    reportService,
    {
      reportsDir,
      ...(options.targetUrl ? { targetUrl: options.targetUrl } : {}),
    },
  );

  return {
    baseUrl,
    db,
    dbPath,
    reportsDir,
    catalog,
    repo,
    reportService,
    engine,
  };
}
