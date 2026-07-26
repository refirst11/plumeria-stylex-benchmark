import { execSync } from "child_process";
import fs from "fs";
import path from "path";

// Decomposes the class-name machinery each styling layer emits, so the README's
// "class-name structure" and "runtime" columns are reproducible rather than
// hand-counted.
//
// Two rules keep the measurement honest:
//
//   1. A string is only counted as class-name payload if every one of its
//      space-separated tokens appears as a selector in the project's own
//      generated CSS. Minified source is full of short lowercase strings that
//      look like atoms -- `"xlarge"` is a variant *value* in the 1,000-item
//      props array, not a class -- and cross-checking against the stylesheet
//      rejects them without a hand-maintained denylist.
//
//   2. `page.module.css` is excluded everywhere. It is identical CSS Modules
//      output in all three projects and belongs to none of the strategies
//      being compared.
const projects = {
  "baseline-next": "CSS Modules",
  "plumeria-next": "Plumeria",
  "stylex-next": "StyleX",
};
const rootDir = process.cwd();

// Present in all three projects' Test component, and stable across rebuilds --
// unlike the content-hashed chunk filenames, which cannot be hardcoded.
const APP_MARKER = "Test Component with Bracket Notation Variants";
const SHARED_STYLESHEET = "page-module__";

// Walks a balanced `{...}` starting at `openIndex`, skipping over string
// literals so that a brace inside a string cannot unbalance the scan.
function scanBlock(src, openIndex) {
  let depth = 0;
  let quote = null;

  for (let i = openIndex; i < src.length; i++) {
    const ch = src[i];

    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return i + 1;
  }
  throw new Error("unbalanced block");
}

function readFiles(dir, filter) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter(filter)
    .map((name) => ({
      name,
      path: path.join(dir, name),
      source: fs.readFileSync(path.join(dir, name), "utf8"),
    }));
}

// A generated class name: `Test-module__JtUlTa__base` from CSS Modules, or the
// `x`-prefixed atom both libraries emit. Restricting to these keeps
// hand-written selectors out of the authority set -- `globals.css` contributes
// a bare `.p`, and a one-character name would match the string `"p"` in every
// React element type in the framework chunks.
const GENERATED = /-module__|^x[a-z0-9]{5,}$/;

// Every class name the build actually emitted a rule for. This is the authority
// on what counts as a class name in the JS.
function cssClassNames(projectPath) {
  const names = new Set();
  for (const { source } of readFiles(
    path.join(projectPath, ".next/static/chunks"),
    (name) => name.endsWith(".css"),
  )) {
    for (const [, name] of source.matchAll(/\.([A-Za-z_][\w-]*)/g)) {
      if (GENERATED.test(name)) names.add(name);
    }
  }
  return names;
}

function stringLiterals(src) {
  const out = [];
  for (const m of src.matchAll(/"((?:[^"\\]|\\.)*)"/g)) {
    out.push({ start: m.index, end: m.index + m[0].length, value: m[1] });
  }
  return out;
}

const isClassPayload = (value, classNames) => {
  const tokens = value.trim().split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((t) => classNames.has(t));
};

// Turbopack emits `<id>,<param>=>{...}` entries into one `push([...])` call;
// splitting on that boundary gives exact per-module bytes without any pattern
// matching inside the module bodies. The parameter name is whatever the
// minifier picked -- `a` in the SSR chunks, `e` in the client ones -- so it
// cannot be hardcoded.
function splitModules(chunk) {
  const marks = [
    ...chunk.matchAll(/(\d{3,6}),(?=(?:[A-Za-z_$][\w$]*|\([^)]*\))=>\{)/g),
  ].map((m) => ({ id: m[1], index: m.index }));

  return marks.map((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].index : chunk.length;
    return { id: mark.id, body: chunk.slice(mark.index, end) };
  });
}

// The maximal object literals holding class-name payload: StyleX's `$$css`
// variant objects, Plumeria's lookup tables, a CSS Modules `a.v({...})` map.
// Maximal rather than innermost, because StyleX nests one object per variant
// value inside the axis object and the shipped structure is the whole thing.
function payloadObjects(src, classNames) {
  const found = [];

  for (let i = 0; i < src.length; i++) {
    if (src[i] !== "{") continue;
    if (found.some((o) => i < o.end)) continue; // already inside a match

    let end;
    try {
      end = scanBlock(src, i);
    } catch {
      continue;
    }
    const body = src.slice(i, end);

    // A function body is code, not a lookup table.
    if (/=>|function\s*\(/.test(body)) continue;

    const literals = stringLiterals(body);
    if (!literals.length) continue;
    if (!literals.every((l) => isClassPayload(l.value, classNames))) continue;

    found.push({ start: i, end, body, entries: countEntries(body) });
  }
  return found;
}

const countEntries = (body) =>
  [...body.matchAll(/[{,]\s*(?:[A-Za-z_$][\w$]*|\d+|"[^"]*")\s*:/g)].length;

// Numerically keyed tables are the per-branch results of a conflict the
// compiler resolved at build time; both libraries emit them for the
// `isRed && styles.red` case, and they are keyed by branch rather than by
// variant, so they read differently in the report.
const describeMap = (body) =>
  body.includes("$$css")
    ? "$$css variant map"
    : /^\{\s*\d+\s*:/.test(body)
      ? "conflict branch table"
      : "variant lookup";

// Class-name strings that are not part of a lookup table -- the prefixes
// Plumeria concatenates, and the fully baked `className` strings StyleX's
// Babel plugin produces for its own conflict cases.
function bakedStrings(src, classNames, objects) {
  return stringLiterals(src).filter(
    (l) =>
      isClassPayload(l.value, classNames) &&
      !objects.some((o) => l.start > o.start && l.end <= o.end),
  );
}

// styleq ships as an inlined IIFE rather than its own module, so it has to be
// carved out by anchor. `f.styleq=void 0` is emitted by its CommonJS preamble.
function styleqRuntime(src) {
  const marker = src.indexOf(".styleq=void 0");
  if (marker === -1) return null;

  const open = src.lastIndexOf("=function(){", marker);
  if (open === -1) return null;

  const bodyStart = src.indexOf("{", open);
  let end = scanBlock(src, bodyStart);
  if (src.slice(end, end + 2) === "()") end += 2;

  const parts = [{ label: "styleq (inlined IIFE)", bytes: end - open }];

  // The `props()` wrapper StyleX inlines at each call site to invoke styleq and
  // split its result into className / style / data-style-src.
  const callSite = src.indexOf(".styleq(");
  if (callSite !== -1 && (callSite < open || callSite > end)) {
    const fnStart = src.lastIndexOf("function", callSite);
    const wrapEnd = scanBlock(src, src.indexOf("{", fnStart));
    parts.push({ label: "props() call-site wrapper", bytes: wrapEnd - fnStart });
  }
  return parts;
}

function analyseChunk(chunk, classNames) {
  const modules = splitModules(chunk);
  const rows = [];
  let structure = 0;
  let runtime = 0;

  for (const { body } of modules) {
    const objects = payloadObjects(body, classNames);
    const baked = bakedStrings(body, classNames, objects);
    if (!objects.length && !baked.length) continue;

    // A CSS Modules stylesheet map is a whole module of the form `<x>.v({...})`;
    // the shared page.module.css one is reported but never counted.
    const cssModuleMap = objects.length === 1 && /\w+\.v\(\{/.test(body);
    const shared = body.includes(SHARED_STYLESHEET);

    for (const o of objects) {
      const label = cssModuleMap
        ? `${o.body.match(/"([\w-]+)-module__/)?.[1] ?? "?"}.module.css map`
        : describeMap(o.body);
      rows.push({
        label,
        bytes: o.body.length,
        entries: o.entries,
        counted: !shared,
        text: o.body,
      });
      if (!shared) structure += o.body.length;
    }

    const bakedBytes = baked.reduce((n, l) => n + (l.end - l.start), 0);
    if (bakedBytes) {
      rows.push({
        label: "baked class strings",
        bytes: bakedBytes,
        entries: baked.length,
        counted: !shared,
        text: baked.map((l) => body.slice(l.start, l.end)).join(" "),
      });
      if (!shared) structure += bakedBytes;
    }

    for (const part of styleqRuntime(body) ?? []) {
      rows.push({
        label: part.label,
        bytes: part.bytes,
        runtime: true,
        counted: true,
      });
      runtime += part.bytes;
    }
  }
  return { rows, structure, runtime, total: chunk.length };
}

function ssrChunk(projectPath) {
  const found = readFiles(
    path.join(projectPath, ".next/server/chunks/ssr"),
    (name) => name.endsWith(".js"),
  ).find(({ source }) => source.includes(APP_MARKER));

  if (!found) throw new Error(`no app SSR chunk in ${projectPath} -- build it first`);
  return found;
}

// The client-side numbers need a second build: with everything a Server
// Component, no styling code reaches `static/chunks` at all. Sources are
// restored in `finally` so an interrupted run cannot leave them patched.
function withClientComponent(projectPath, fn) {
  const testFile = path.join(projectPath, "src/component/Test.tsx");
  const original = fs.readFileSync(testFile, "utf8");

  try {
    fs.writeFileSync(testFile, `"use client";\n${original}`);
    execSync("npm run build", { cwd: projectPath, stdio: "ignore" });
    return fn();
  } finally {
    fs.writeFileSync(testFile, original);
    execSync("npm run build", { cwd: projectPath, stdio: "ignore" });
  }
}

function clientChunks(projectPath, classNames) {
  return readFiles(
    path.join(projectPath, ".next/static/chunks"),
    (name) => name.endsWith(".js"),
  ).filter(({ source }) =>
    stringLiterals(source).some((l) => isClassPayload(l.value, classNames)),
  );
}

function report(title, { rows, structure, runtime, total }, chunkName) {
  console.log(`\n  ${title}  ${total}B  ${chunkName}`);
  for (const row of rows) {
    const entries = row.entries ? `${row.entries} entries` : "";
    const note = row.counted ? "" : "  [shared control, excluded]";
    console.log(
      `    ${String(row.bytes).padStart(6)}B  ${row.label.padEnd(28)} ${entries.padEnd(12)}${note}`,
    );
  }
  console.log(
    `    ${"-".repeat(6)}  structure ${structure}B` +
      (runtime ? ` + runtime ${runtime}B = ${structure + runtime}B` : " + no runtime"),
  );
}

// Same label appearing in more than one module is summed, so that e.g. all five
// `$$css` variant maps collapse into one comparable line.
function foldRows(rows) {
  const folded = new Map();
  for (const row of rows) {
    if (!row.counted) continue;
    const prev = folded.get(row.label) ?? { bytes: 0, count: 0, runtime: row.runtime };
    folded.set(row.label, {
      bytes: prev.bytes + row.bytes,
      count: prev.count + 1,
      runtime: row.runtime,
    });
  }
  return folded;
}

// The point of the comparison: which parts of the class-name machinery exist on
// both sides of the boundary. Anything present in both columns is bundled twice
// -- once into the server build, once into the browser build.
function compare(ssrRows, clientRows) {
  const ssr = foldRows(ssrRows);
  const client = foldRows(clientRows);
  const labels = [...new Set([...ssr.keys(), ...client.keys()])];

  console.log(
    `\n    ${"".padEnd(30)}${"SSR".padStart(8)}${"Client".padStart(9)}   `,
  );
  let bothStructure = 0;
  let bothRuntime = 0;

  for (const label of labels) {
    const a = ssr.get(label);
    const b = client.get(label);
    const both = a && b && a.bytes === b.bytes;
    if (both) (a.runtime ? (bothRuntime += a.bytes) : (bothStructure += a.bytes));

    console.log(
      `    ${label.padEnd(30)}${(a ? a.bytes + "B" : "—").padStart(8)}${(b ? b.bytes + "B" : "—").padStart(9)}` +
        (both ? "   ← identical, shipped twice" : ""),
    );
  }
  console.log(
    `\n    duplicated across both bundles: ${bothStructure + bothRuntime}B` +
      (bothRuntime ? ` (of which ${bothRuntime}B is runtime)` : ""),
  );
}

function dump(title, rows) {
  console.log(`\n  --- ${title}`);
  for (const row of rows) {
    if (!row.text) continue;
    console.log(`    ${row.label} (${row.bytes}B):\n      ${row.text}`);
  }
}

function run() {
  const measureClient = process.argv.includes("--client");
  const showContents = process.argv.includes("--dump");
  const summary = {};

  for (const [project, label] of Object.entries(projects)) {
    const projectPath = path.join(rootDir, project);
    if (!fs.existsSync(path.join(projectPath, ".next"))) {
      console.log(`\n🔨 ${project} has no build; building...`);
      execSync("npm run build", { cwd: projectPath, stdio: "ignore" });
    }

    const classNames = cssClassNames(projectPath);
    const chunk = ssrChunk(projectPath);
    const ssr = analyseChunk(chunk.source, classNames);

    console.log(`\n=== ${label}  (${project})`);
    report("SSR chunk", ssr, chunk.name);
    if (showContents) dump("SSR chunk contents", ssr.rows);

    const row = {
      "SSR chunk (B)": ssr.total,
      "Structure (B)": ssr.structure,
      "Runtime (B)": ssr.runtime || "—",
      "Structure + runtime (B)": ssr.structure + ssr.runtime,
    };

    if (measureClient) {
      const client = withClientComponent(projectPath, () => {
        const chunks = clientChunks(projectPath, classNames);
        return chunks.map((c) => ({
          name: c.name,
          ...analyseChunk(c.source, classNames),
        }));
      });
      const clientBytes = client.reduce((n, c) => n + c.total, 0);
      const clientRows = client.flatMap((c) => c.rows);
      for (const c of client) report('Client chunk ("use client")', c, c.name);
      if (showContents) dump("Client chunk contents", clientRows);
      compare(ssr.rows, clientRows);
      row["Client chunk (B)"] = clientBytes;
    }

    summary[label] = row;
  }

  console.log("\n📊 Class-name structure\n");
  console.table(summary);
  console.log(
    "Structure excludes page.module.css, which is identical CSS Modules output in all three projects.",
  );
  if (!measureClient) {
    console.log("Pass --client to also measure the `\"use client\"` build (rebuilds each project twice).");
  }
}

run();
