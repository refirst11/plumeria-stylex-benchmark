import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { performance } from "perf_hooks";

const projects = ["plumeria-next", "stylex-next"];
const rootDir = process.cwd();

const ITERATIONS = 10;

async function getCssSize(dirPath) {
  let size = 0;
  if (!fs.existsSync(dirPath)) return 0;
  
  const files = fs.readdirSync(dirPath);
  for (const file of files) {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);
    
    if (stats.isDirectory()) {
      size += await getCssSize(filePath);
    } else if (file.endsWith(".css")) {
      size += stats.size;
    }
  }
  return size;
}

async function runBenchmark() {
  const results = {};

  for (const project of projects) {
    console.log(`\n🚀 Benchmarking ${project} (${ITERATIONS} iterations)...`);
    const projectPath = path.join(rootDir, project);
    const times = [];
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

      // Last iteration: measure CSS size
      if (i === ITERATIONS) {
        const staticPath = path.join(projectPath, ".next", "static");
        cssSize = await getCssSize(staticPath);
      }
    }

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);

    results[project] = {
      "Avg Build (s)": avg.toFixed(3),
      "Min (s)": min.toFixed(3),
      "Max (s)": max.toFixed(3),
      "CSS size (KB)": (cssSize / 1024).toFixed(2),
    };
  }

  console.log("\n📊 Final Benchmark Results (Cold Build):");
  console.table(results);
}

runBenchmark().catch(console.error);
