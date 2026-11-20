// main.ts — entrypoint penyerahan bounty "Make GTA 6 Cover Art" (make.fun).
//
// Program ini menyerahkan app cover-art ke direktori output beserta
// dossier.json yang dibaca juri:
//   - app/         : file statis offline (HTML/CSS/JS + aset) aplikasi
//                    pembuat cover art GTA 6.
//   - screenshots/ : tangkapan layar aplikasi (maks. 4) untuk juri.
//   - dossier.json : dossier yang dibangun buildDossier dari isi output.
//
// PENTING — jangan pernah menghapus direktori output:
// Di grader, /output adalah mount milik root sementara program berjalan
// sebagai user 65534 (nobody). Menghapus direktori itu akan gagal dengan
// EACCES dan program keluar dengan exit code 1 (itulah yang membuat
// round 1 entry ini ditolak grader). Grader selalu memberi direktori
// output kosong yang segar, jadi cukup buat direktori itu bila belum ada
// (mkdir rekursif) lalu salin file ke dalamnya.
//
// Hanya memakai stdlib Node: node:fs, node:path, node:url.

import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildDossier } from "./vendor/makefun-app.ts";

// Direktori repo: folder yang berisi file ini sendiri.
const repoDir = dirname(fileURLToPath(import.meta.url));

// Direktori output: dari env MAKEFUN_OUTPUT_DIR, default '/output'.
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";

// Buat direktori output bila belum ada. Jangan pernah menghapusnya.
mkdirSync(outputDir, { recursive: true });

// Salin app/ dari repo ke dalam output (rekursif).
cpSync(join(repoDir, "app"), join(outputDir, "app"), { recursive: true });

// Buat screenshots/ di output dulu (agar direktori ini selalu ada untuk
// dossier, sekalipun repo tidak membawa screenshot), lalu salin
// screenshots/ dari repo (rekursif) hanya bila ada di repo.
mkdirSync(join(outputDir, "screenshots"), { recursive: true });
const repoScreenshots = join(repoDir, "screenshots");
if (existsSync(repoScreenshots)) {
  cpSync(repoScreenshots, join(outputDir, "screenshots"), { recursive: true });
}

// Bangun dossier.json dari isi output dan tulis ke output.
const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
});
writeFileSync(join(outputDir, "dossier.json"), dossier);

console.log(`Cover art app diserahkan ke ${outputDir}`);
