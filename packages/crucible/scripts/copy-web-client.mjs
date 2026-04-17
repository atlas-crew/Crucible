import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(scriptDir, '..');
const repoRoot = resolve(packageDir, '..', '..');
const sourceDir = resolve(repoRoot, 'apps', 'web-client');
const scenariosSourceDir = resolve(repoRoot, 'packages', 'catalog', 'scenarios');
const scenariosTargetDir = resolve(packageDir, 'scenarios');
const targetDir = resolve(packageDir, 'web-client');

await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });
await rm(scenariosTargetDir, { recursive: true, force: true });
await mkdir(scenariosTargetDir, { recursive: true });

for (const relativePath of ['.next', 'public']) {
  const sourcePath = resolve(sourceDir, relativePath);
  if (!existsSync(sourcePath)) {
    continue;
  }

  const targetPath = resolve(targetDir, relativePath);
  await mkdir(targetPath, { recursive: true });
  // Copying the directory contents into a pre-created destination avoids
  // intermittent mkdir races around the top-level .next folder during full workspace builds.
  await cp(resolve(sourcePath, '.'), targetPath, { recursive: true, force: true });
}

for (const relativePath of ['.next/cache', '.next/standalone', '.next/trace', '.next/trace-build', '.next/types']) {
  await rm(resolve(targetDir, relativePath), { recursive: true, force: true });
}

await cp(scenariosSourceDir, scenariosTargetDir, { recursive: true });

await writeFile(
  resolve(targetDir, 'package.json'),
  JSON.stringify(
    {
      name: '@atlascrew/crucible-web-client',
      private: true
    },
    null,
    2,
  ) + '\n',
  'utf8',
);
