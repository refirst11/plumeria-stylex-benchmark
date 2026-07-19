import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { performance } from "perf_hooks";

// baseline-next is the control: the same app, the same DOM, the same 1,000
// components, styled with plain CSS Modules and no CSS-in-JS library. The cost
// of each library is simply how much longer its build takes than the baseline's.
const BASELINE_PROJECT = "baseline-next";
const projects = [BASELINE_PROJECT, "plumeria-next", "stylex-next"];
const rootDir = process.cwd();

const ITERATIONS = 10;

// The first iteration absorbs V8/compiler cold start overhead and is excluded
// from every average, as documented in the README.
const WARMUP_ITERATIONS = 1;

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// Sample standard deviation, reported so the reader can judge whether a
// build-time difference is actually above the noise floor.
function stdDev(xs) {
  const m = mean(xs);
  return Math.sqrt(
    xs.reduce((total, x) => total + (x - m) ** 2, 0) / (xs.length - 1),
  );
}

// Sums real file sizes rather than shelling out to `du`, which rounds every
// file up to a disk block and would overstate a tree of many small files.
function dirSize(dirPath, matches = () => true) {
  if (!fs.existsSync(dirPath)) return 0;

  let size = 0;
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      size += dirSize(entryPath, matches);
    } else if (entry.isFile() && matches(entry.name)) {
      size += fs.statSync(entryPath).size;
    }
  }
  return size;
}

function runBenchmark() {
  const measurements = {};

  for (const project of projects) {
    console.log(`\n🚀 Benchmarking ${project} (${ITERATIONS} iterations)...`);
    const projectPath = path.join(rootDir, project);
    const times = [];
    let buildSize = 0;
    let cssSize = 0;

    for (let i = 1; i <= ITERATIONS; i++) {
      process.stdout.write(`  Iteration ${i}/${ITERATIONS}... `);

      // Clean build every time for a fair comparison of cold builds
      execSync("npm run prebuild", { cwd: projectPath, stdio: "ignore" });

      const start = performance.now();
      execSync("npm run build", { cwd: projectPath, stdio: "ignore" });
      const end = performance.now();

      const buildTime = (end - start) / 1000;
      times.push(buildTime);
      process.stdout.write(`${buildTime.toFixed(2)}s\n`);

      // Last iteration: measure the build output
      if (i === ITERATIONS) {
        const nextPath = path.join(projectPath, ".next");
        buildSize = dirSize(nextPath);
        cssSize = dirSize(nextPath, (name) => name.endsWith(".css"));
      }
    }

    measurements[project] = {
      times: times.slice(WARMUP_ITERATIONS),
      buildSize,
      cssSize,
    };
  }

  const baselineMean = mean(measurements[BASELINE_PROJECT].times);
  const results = {};

  for (const project of projects) {
    const { times, buildSize, cssSize } = measurements[project];

    results[project] = {
      "Avg Build (s)": mean(times).toFixed(3),
      "Min (s)": Math.min(...times).toFixed(3),
      "Max (s)": Math.max(...times).toFixed(3),
      "SD (ms)": (stdDev(times) * 1000).toFixed(1),
      "Library Cost (ms)":
        project === BASELINE_PROJECT
          ? "—"
          : ((mean(times) - baselineMean) * 1000).toFixed(1),
      ".next (MB)": (buildSize / 1024 / 1024).toFixed(2),
      "CSS (KB)": (cssSize / 1024).toFixed(2),
    };
  }

  console.log(
    `\n📊 Final Benchmark Results (Cold Build, first ${WARMUP_ITERATIONS} iteration excluded):`,
  );
  console.table(results);
  console.log(
    `Library Cost = this project's average build time minus ${BASELINE_PROJECT}'s (${baselineMean.toFixed(3)}s).`,
  );
}

runBenchmark();
