import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { ScenarioSchema, type Scenario } from '../models/types.js';
import { validateScenario } from '../validation/scenario-validator.js';

/**
 * In-process catalog service that loads scenario JSON files from disk.
 *
 * Replaces the HTTP-based CatalogClient with a zero-network-dependency
 * loader. All scenarios are loaded once at construction and served from memory.
 */
export class CatalogService {
  private scenarios: Map<string, Scenario> = new Map();
  private readonly scenariosDir: string;

  constructor(scenariosDir?: string) {
    this.scenariosDir = scenariosDir ?? this.defaultScenariosDir();
    this.loadScenarios(this.scenariosDir);
  }

  private defaultScenariosDir(): string {
    // Resolve relative to this file's location: ../../scenarios/
    const thisDir = typeof __dirname !== 'undefined'
      ? __dirname
      : fileURLToPath(new URL('.', import.meta.url));
    return resolve(thisDir, '..', '..', 'scenarios');
  }

  private loadScenarios(dir: string): void {
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.endsWith('.json'));
    } catch {
      console.warn(`CatalogService: scenarios directory not found at ${dir}`);
      return;
    }

    for (const file of files) {
      try {
        const raw = readFileSync(join(dir, file), 'utf-8');
        const data = JSON.parse(raw);
        const scenario = ScenarioSchema.parse(data);

        // Validate structural integrity (cycles, missing refs, templates)
        const result = validateScenario(scenario);
        if (!result.valid) {
          console.warn(`CatalogService: validation errors in ${file}:`, result.errors);
          continue; // skip invalid scenarios
        }
        if (result.warnings.length > 0) {
          console.warn(`CatalogService: warnings in ${file}:`, result.warnings);
        }

        this.scenarios.set(scenario.id, scenario);
      } catch (err) {
        console.warn(`CatalogService: failed to load ${file}:`, err);
      }
    }
  }

  listScenarios(): Scenario[] {
    return Array.from(this.scenarios.values());
  }

  getScenario(id: string): Scenario | undefined {
    return this.scenarios.get(id);
  }

  getScenariosByCategory(category: string): Scenario[] {
    return this.listScenarios().filter((s) => s.category === category);
  }

  getCategories(): string[] {
    const categories = new Set<string>();
    for (const s of this.scenarios.values()) {
      if (s.category) categories.add(s.category);
    }
    return Array.from(categories).sort();
  }

  updateScenario(id: string, data: Scenario): Scenario {
    const scenario = ScenarioSchema.parse(data);
    const result = validateScenario(scenario);
    if (!result.valid) {
      throw new Error(`Validation failed: ${result.errors.join('; ')}`);
    }

    const filePath = join(this.scenariosDir, `${id}.json`);
    writeFileSync(filePath, JSON.stringify(scenario, null, 2), 'utf-8');
    this.scenarios.set(id, scenario);
    return scenario;
  }

  get size(): number {
    return this.scenarios.size;
  }
}
