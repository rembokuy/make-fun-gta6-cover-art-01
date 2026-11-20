// Neon Coast Cover Studio — submission entrypoint.
//
// This program copies app/ and screenshots/ into the output directory and
// writes the dossier the scorer reads. It runs under Node 22 with only the
// standard library, no build step and no network.
//
// NOTE — never delete the output directory here. On the grader /output is a
// mount owned by root while this program runs as user 65534 (nobody): a
// remove would fail with EACCES and exit 1, which is exactly what rejected
// round 1. So we only create the directory when it is missing (mkdir with
// recursive: true) and copy into it, never rmSync it or anything inside it.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

// The repository root is the folder holding this file.
const repoDir = dirname(fileURLToPath(import.meta.url));

// The grader hands us the output directory through the environment;
// outside the grader it defaults to /output, the same path.
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Create the output directory when it is missing. Recursive mkdir is a
// no-op when it already exists, and it never removes anything.
mkdirSync(outputDir, { recursive: true });

// Copy the whole app/ tree into the output directory.
cpSync(join(repoDir, 'app'), join(outputDir, 'app'), { recursive: true });

// Copy screenshots/ when the repository has them; the dossier step below
// refuses an entry with no screenshots, so a missing folder is an error
// we surface rather than silently producing an empty entry.
const shotsDir = join(repoDir, 'screenshots');
if (existsSync(shotsDir)) {
  mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
  cpSync(shotsDir, join(outputDir, 'screenshots'), { recursive: true });
}

// Build the dossier from what is now in the output directory and write it.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);

console.log(`Neon Coast Cover Studio submitted to ${outputDir}`);
