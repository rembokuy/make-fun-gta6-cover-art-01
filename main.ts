// Neon Coast Cover Studio — submission entrypoint.
//
// This program copies the static app into the output directory and writes
// dossier.json there. It deliberately NEVER deletes the output directory:
// on the grader /output is a mount owned by root while this program runs
// as uid 65534 (nobody), so removing it fails with EACCES and exits 1 —
// that is exactly what rejected round 1. We only create the directory
// (recursively, if missing) and write inside it.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

// The repository root is the folder holding this file.
const repoDir = resolve(dirname(fileURLToPath(import.meta.url)));

// The output directory comes from the environment, defaulting to /output.
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Create the output directory when it is missing. mkdirSync with
// recursive:true is a no-op when it already exists, and it never removes
// anything — safe on the grader's root-owned /output mount.
mkdirSync(outDir, { recursive: true });

// Copy the whole app/ tree into the output directory.
const appSrc = join(repoDir, 'app');
cpSync(appSrc, join(outDir, 'app'), { recursive: true });

// Copy screenshots/ into the output directory, when the repo has any.
const shotsSrc = join(repoDir, 'screenshots');
if (existsSync(shotsSrc)) {
  mkdirSync(join(outDir, 'screenshots'), { recursive: true });
  cpSync(shotsSrc, join(outDir, 'screenshots'), { recursive: true });
}

// Build the dossier from what is now in the output directory and write it.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

console.log(`Neon Coast Cover Studio submitted to ${outDir}`);
