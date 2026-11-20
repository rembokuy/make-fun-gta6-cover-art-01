// Neon Coast Cover Studio — submission entrypoint.
//
// The grader runs this file as user 65534 (nobody) with /output mounted as a
// root-owned directory. NEVER delete /output (or anything outside it): an
// rmSync on /output fails with EACCES and exits 1, which is exactly what got
// round 1 rejected. We only create the directory if missing and write into
// it; everything else is a copy from the read-only repo.

import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDossier } from "./vendor/makefun-app.ts";

const repoDir = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || "/output";

// Create the output directory when it does not exist yet. No deletion here.
mkdirSync(outDir, { recursive: true });

// Ship the app itself.
cpSync(join(repoDir, "app"), join(outDir, "app"), { recursive: true });

// Ship the screenshots when the repo has any.
if (existsSync(join(repoDir, "screenshots"))) {
  mkdirSync(join(outDir, "screenshots"), { recursive: true });
  cpSync(join(repoDir, "screenshots"), join(outDir, "screenshots"), {
    recursive: true,
  });
}

const dossier = await buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});

writeFileSync(join(outDir, "dossier.json"), dossier);
console.log(`Neon Coast Cover Studio submitted to ${outDir}`);
