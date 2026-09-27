#!/usr/bin/env node
/**
 * Quality ratchet.
 *
 * This project carries a large number of pre-existing lint failures, so gating
 * CI on "zero problems" would block every pull request. The check is compared
 * against a committed baseline count instead:
 *
 *   - more than the baseline  -> fail (a regression was introduced)
 *   - fewer than the baseline -> fail, asking you to lower the baseline so the
 *                                progress is locked in
 *   - equal                   -> pass
 *
 * The count only ever moves down. When it reaches 0, delete this script and
 * run `pnpm run lint` directly in CI.
 *
 * Typecheck is deliberately not ratcheted here: `pnpm run type-check` is
 * already clean, so CI enforces zero errors directly.
 *
 *   node scripts/ratchet.mjs lint
 *   node scripts/ratchet.mjs lint --update    rewrite the baseline
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselineFile = join(projectRoot, '.ratchet-baseline.json');

/**
 * Run a command, returning its streams whether or not it exits non-zero.
 *
 * stdout and stderr are kept separate on purpose: npm and npx write warnings
 * to stderr, and merging them corrupts machine-readable stdout (eslint's JSON
 * report in particular).
 */
function capture(command, args) {
  try {
    const stdout = execFileSync(command, args, {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 64 * 1024 * 1024,
    });
    return { stdout, stderr: '' };
  } catch (error) {
    if (error.stdout === undefined && error.stderr === undefined) throw error;
    return { stdout: error.stdout ?? '', stderr: error.stderr ?? '' };
  }
}

const CHECKS = {
  lint: {
    label: 'lint error',
    command: 'pnpm run lint',
    run() {
      // Same globs as the "lint" script in package.json. JSON output is parsed
      // rather than scraped: counting text lines breaks on multi-line
      // messages, which this config produces.
      const { stdout, stderr } = capture('npx', [
        'eslint',
        'src/**/*.ts',
        'processes/**/*.ts',
        'config/**/*.ts',
        'tests/**/*.ts',
        '--format',
        'json',
      ]);
      const start = stdout.indexOf('[');
      const end = stdout.lastIndexOf(']');
      if (start === -1 || end === -1) {
        console.error('Could not parse eslint output.\n');
        console.error(stdout.trim() || stderr.trim());
        process.exit(1);
      }

      const results = JSON.parse(stdout.slice(start, end + 1));
      const count = results.reduce((total, file) => total + file.errorCount, 0);
      const warnings = results.reduce((total, file) => total + file.warningCount, 0);
      const worst = results
        .filter((file) => file.errorCount > 0)
        .sort((a, b) => b.errorCount - a.errorCount)
        .slice(0, 10)
        .map((file) => `  ${file.errorCount.toString().padStart(4)}  ${file.filePath}`)
        .join('\n');

      return {
        count,
        detail: `Warnings (not ratcheted): ${warnings}\n\nFiles with the most errors:\n${worst}`,
      };
    },
  },
};

const [checkName, ...flags] = process.argv.slice(2);
const shouldUpdate = flags.includes('--update');
const check = CHECKS[checkName];

if (!check) {
  console.error(`Unknown check "${checkName ?? ''}".`);
  console.error(`Available: ${Object.keys(CHECKS).join(', ')}`);
  process.exit(1);
}

const baselines = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')) : {};
const { count, detail } = check.run();

if (shouldUpdate || baselines[checkName] === undefined) {
  baselines[checkName] = count;
  const ordered = Object.fromEntries(Object.entries(baselines).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(baselineFile, `${JSON.stringify(ordered, null, 2)}\n`);
  console.log(`Baseline for "${checkName}" written: ${count} ${check.label}(s).`);
  process.exit(0);
}

const baseline = baselines[checkName];

if (count > baseline) {
  console.error(`${checkName} regression: ${count} ${check.label}s, baseline is ${baseline}.`);
  console.error(`${count - baseline} new ${check.label}(s) introduced.\n`);
  console.error(detail);
  console.error(`\nRun \`${check.command}\` to see everything.`);
  process.exit(1);
}

if (count < baseline) {
  console.error(`${checkName} improved: ${count} ${check.label}s, baseline is ${baseline}.`);
  console.error('Lower the baseline to lock this in:\n');
  console.error(`  node scripts/ratchet.mjs ${checkName} --update\n`);
  process.exit(1);
}

console.log(`${checkName} at baseline: ${count} pre-existing ${check.label}(s), no regressions.`);
