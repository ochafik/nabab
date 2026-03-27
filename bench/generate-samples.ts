#!/usr/bin/env npx tsx
/**
 * Generate sample CSV datasets for testing structure learning.
 *
 * Each dataset is sampled from a known Bayesian network so that the learned
 * structure should recover the ground-truth edges (or close to them).
 *
 * Usage:  npx tsx bench/generate-samples.ts
 */

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Pseudo-random number generator (seedable for reproducibility) ──

function mulberry32(seed: number) {
  return (): number => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function choose<T>(rng: () => number, options: T[], weights: number[]): T {
  const r = rng();
  let cumulative = 0;
  for (let i = 0; i < options.length; i++) {
    cumulative += weights[i];
    if (r < cumulative) return options[i];
  }
  return options[options.length - 1];
}

// ─── Weather BN ──────────────────────────────────────────────────────
//
// Season -> Rain -> WetGrass
//              \-> SlipperyRoad
// Season -> Sprinkler -> WetGrass
//
// Structure:
//   Season        : root
//   Rain          : parents=[Season]
//   Sprinkler     : parents=[Season]
//   WetGrass      : parents=[Rain, Sprinkler]
//   SlipperyRoad  : parents=[Rain]

function generateWeather(n: number, seed: number): string[][] {
  const rng = mulberry32(seed);
  const rows: string[][] = [];

  for (let i = 0; i < n; i++) {
    // Season: uniform over 4 seasons
    const season = choose(rng, ['Spring', 'Summer', 'Fall', 'Winter'], [0.25, 0.25, 0.25, 0.25]);

    // P(Rain | Season)
    const pRain: Record<string, number> = {
      Spring: 0.45, Summer: 0.15, Fall: 0.55, Winter: 0.60,
    };
    const rain = rng() < pRain[season] ? 'Yes' : 'No';

    // P(Sprinkler | Season) - people water lawns more in summer
    const pSprinkler: Record<string, number> = {
      Spring: 0.30, Summer: 0.70, Fall: 0.15, Winter: 0.05,
    };
    const sprinkler = rng() < pSprinkler[season] ? 'On' : 'Off';

    // P(WetGrass | Rain, Sprinkler)
    let pWet: number;
    if (rain === 'Yes' && sprinkler === 'On') pWet = 0.99;
    else if (rain === 'Yes' && sprinkler === 'Off') pWet = 0.90;
    else if (rain === 'No' && sprinkler === 'On') pWet = 0.85;
    else pWet = 0.02;
    const wetGrass = rng() < pWet ? 'Wet' : 'Dry';

    // P(SlipperyRoad | Rain)
    const pSlippery = rain === 'Yes' ? 0.75 : 0.05;
    const slipperyRoad = rng() < pSlippery ? 'Yes' : 'No';

    rows.push([season, rain, sprinkler, wetGrass, slipperyRoad]);
  }

  return rows;
}

// ─── Students BN ─────────────────────────────────────────────────────
//
// Classic BN from Koller & Friedman:
//   Difficulty  : root
//   Intelligence: root
//   Grade       : parents=[Difficulty, Intelligence]
//   SAT         : parents=[Intelligence]
//   Letter      : parents=[Grade]

function generateStudents(n: number, seed: number): string[][] {
  const rng = mulberry32(seed);
  const rows: string[][] = [];

  for (let i = 0; i < n; i++) {
    // Difficulty: 40% Hard, 60% Easy
    const difficulty = rng() < 0.4 ? 'Hard' : 'Easy';

    // Intelligence: 30% High, 50% Medium, 20% Low
    const intelligence = choose(rng, ['High', 'Medium', 'Low'], [0.30, 0.50, 0.20]);

    // Grade: depends on Difficulty and Intelligence
    // P(Grade | Difficulty, Intelligence)
    let gradeWeights: number[];
    if (difficulty === 'Easy' && intelligence === 'High') {
      gradeWeights = [0.70, 0.25, 0.05]; // A, B, C
    } else if (difficulty === 'Easy' && intelligence === 'Medium') {
      gradeWeights = [0.35, 0.50, 0.15];
    } else if (difficulty === 'Easy' && intelligence === 'Low') {
      gradeWeights = [0.10, 0.40, 0.50];
    } else if (difficulty === 'Hard' && intelligence === 'High') {
      gradeWeights = [0.40, 0.40, 0.20];
    } else if (difficulty === 'Hard' && intelligence === 'Medium') {
      gradeWeights = [0.10, 0.40, 0.50];
    } else {
      // Hard + Low
      gradeWeights = [0.02, 0.18, 0.80];
    }
    const grade = choose(rng, ['A', 'B', 'C'], gradeWeights);

    // SAT: depends on Intelligence
    let satWeights: number[];
    if (intelligence === 'High') satWeights = [0.75, 0.20, 0.05];
    else if (intelligence === 'Medium') satWeights = [0.25, 0.50, 0.25];
    else satWeights = [0.05, 0.25, 0.70];
    const sat = choose(rng, ['High', 'Medium', 'Low'], satWeights);

    // Letter: depends on Grade
    let pLetter: number;
    if (grade === 'A') pLetter = 0.90;
    else if (grade === 'B') pLetter = 0.50;
    else pLetter = 0.10;
    const letter = rng() < pLetter ? 'Strong' : 'Weak';

    rows.push([difficulty, intelligence, grade, sat, letter]);
  }

  return rows;
}

// ─── Write CSV files ─────────────────────────────────────────────────

function toCSV(headers: string[], rows: string[][]): string {
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n') + '\n';
}

const samplesDir = resolve(__dirname, 'samples');

const weatherCSV = toCSV(
  ['Season', 'Rain', 'Sprinkler', 'WetGrass', 'SlipperyRoad'],
  generateWeather(200, 42),
);
writeFileSync(resolve(samplesDir, 'weather.csv'), weatherCSV);
console.log(`Wrote bench/samples/weather.csv (200 rows)`);

const studentsCSV = toCSV(
  ['Difficulty', 'Intelligence', 'Grade', 'SAT', 'Letter'],
  generateStudents(300, 123),
);
writeFileSync(resolve(samplesDir, 'students.csv'), studentsCSV);
console.log(`Wrote bench/samples/students.csv (300 rows)`);
