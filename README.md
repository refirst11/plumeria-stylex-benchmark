# CSS-in-JS Benchmark: StyleX vs Plumeria

Authored by the maintainer of Plumeria. Every number here is reproducible with `npm run bench`.

Benchmarks Meta's **StyleX** against **Plumeria** on an identical Next.js app, with **CSS Modules** and **Tailwind CSS** as no-runtime controls.

All four render the same DOM: 1,000 components combining five variant axes (`color`, `size`, `padding`, `borderRadius`, `background`), plus a component exercising nested media queries, `:last-child`, and conditional styles.

|                         |  Build | Library Cost |     CSS | SSR Chunk | Client JS¹ | Class names resolved       |
| :---------------------- | -----: | -----------: | ------: | --------: | ---------: | :------------------------- |
| _CSS Modules (control)_ | 3.724s |            — |  8.26KB |    3.91KB |     2.07KB | never merged               |
| **Plumeria**            | 3.778s |          ≈ 0 |  7.71KB |    2.60KB |     0.84KB | at build                   |
| _Tailwind (control)_    | 3.722s |          ≈ 0 | 14.28KB |    2.67KB |     0.89KB | nothing to resolve         |
| **StyleX**              | 4.325s |       +601ms |  8.08KB |    4.44KB |     2.67KB | at client render, `styleq` |

The first three ship no styling runtime at all. StyleX is the only one that does.

> [!NOTE]
> **These are measurements, not verdicts.** Everything here was measured in good faith, but on one machine, one set of versions, and one fixture. Your hardware, your framework and bundler versions, the size and shape of your codebase, and factors nobody thought to control for can all move these numbers — in places by enough to reorder the table. The harness is in this repo precisely so the results can be re-run rather than taken on trust. Run `npm run bench` against your own environment before drawing a conclusion about your own project.

- **Build cost** — only StyleX's clears the noise floor. Plumeria and Tailwind are both indistinguishable from the control in this run. Most of StyleX's ~0.6s is toolchain: a `babel.config.js` that moves the app off Next.js's SWC pipeline, plus a PostCSS pass. See [Build Cost](#build-cost).
- **What ships** — once components are client-side, StyleX sends **1.83KB more to the browser** than Plumeria, mostly its `styleq` resolver. See [Class Name Strategy](#class-name-strategy).
- **What runs** — every library here executes code during `next build`. Only StyleX leaves something behind that runs again. See [What Runs, and What Survives It](#what-runs-and-what-survives-it).
- **What the runtime buys** — StyleX's resolver is not waste; it merges style objects the compiler never saw and makes correctness independent of stylesheet order. See [The Trade](#the-trade).
- **Runtime performance** — indistinguishable. All score 100/100 on Lighthouse and prerender 1,000 components in ~210ms.

<sub>¹ measured in a separate build with `Test.tsx` marked `"use client"`.</sub>

---

## Quick Start

```bash
pnpm install
npm run bench                   # 10 cold builds per project, prints the build table
npm run structure               # class-name structure and runtime, from the SSR chunks
npm run structure -- --client   # also rebuilds each project with Test.tsx as a Client Component
```

```
baseline-next/          CSS Modules — no-library control
plumeria-next/          Plumeria
stylex-next/            StyleX
tailwind-next/          Tailwind CSS v4
scripts/benchmark.mjs   build-time harness
scripts/structure.mjs   class-name structure / runtime decomposition
```

The four projects are structurally identical. In each, `src/component/Test.tsx` renders the 1,000 variant components and `src/component/*Component.tsx` carries the complex-style case; only the styling layer differs.

---

## Class Name Strategy

All four resolve a variant like `color="red"` to a class name, but they place that resolution at different points — visible in the SSR chunk each emits (`.next/server/chunks/ssr/`).

### Plumeria — resolved at build time

```js
className: "xo8omt7h x6vb0uvf x1wwwd6e "
  + ({red:"xq96bg3w", blue:"xgmn1kmt", green:"x3git8yv", …})[color]
  + " " + ({small:"xhrr6ses", medium:"xbm90xtb", …})[size]
  + …
```

One lookup table per variant axis, keyed by the variant value and inlined at the call site. The compiler has already decided which class wins for every reachable combination, so the render is an O(1) property read per axis plus concatenation. No runtime ships and no merge happens — there is nothing left to merge.

Conflicts don't blow up the enumeration: non-conflicting atoms are concatenated into a static prefix, and only mutually conflicting declarations are clustered into a branch table. The five independent axes above produce five tables, not one table of 5×4×5×5×5. The boolean conflict in `PlumeriaComponent.tsx` — `base` and `red` both set `color` and `borderColor` —

```jsx
<div styleName={[styles.base, isRed && styles.red]}>
```

compiles to a static prefix plus one two-entry branch table, each branch already reduced to the winning atoms:

```js
className: "xymmdeuh xbm90xtb xragrh7v xmt672rk x4vahbk7 " +
  ({ 0: "xgmn1kmt xvxlh81m", 1: "xq96bg3w xtopzak1" }[a ? "1" : "0"] || …);
```

Note what is baked: the _merge_, not the CSS. `isRed` is a runtime value, so the atoms of both branches stay in the stylesheet — the build eliminates the resolution work, and both outcomes remain selectable.

### StyleX — resolved at render time

```js
// the maps: 5 objects, 24 variant values, 849B
const color = { red: {kMwMTN:"x1e2nbdu", $$css:!0}, blue: {kMwMTN:"xju2f9n", $$css:!0}, … };

// the resolver: 1,247B of inlined styleq, plus a 172B props() wrapper
styleq(base, color[c], size[s], padding[p], radius[r], background[b])
```

Each key (`kMwMTN`) is a hash of the CSS _property_, not of the style name. Because two rules setting `color` collide on that key, `styleq` can walk its arguments in reverse and keep the first hit per property — last argument wins. That is the same merge Plumeria performs during the build, kept alive at render, at the cost of a bundled resolver.

Not everything is deferred: given the same `isRed && styles.red` boolean conflict, StyleX's Babel plugin bakes a branch table of finished class strings exactly as Plumeria does, never calling `styleq`. What it does not bake is the variant case, where axis values arrive as props — StyleX keeps the property-keyed maps intact and defers to `styleq`. That is the case `Test.tsx` measures.

### CSS Modules — no merge at all

```js
{ base:"Test-module__JtUlTa__base", red:"Test-module__JtUlTa__red", … }
```

One flat object mapping local style names to generated global ones, consumed with `.join(" ")`. Conflicting rules cannot be detected — both classes are emitted and the cascade decides. No runtime, but names average 28.9 characters against ~8 for either library.

### Tailwind — nothing to resolve

```js
const colorStyles = { red:"text-red-500", blue:"text-blue-500", … };
className={[base, colorStyles[color], …].join(" ")}
```

Structurally this is the CSS Modules shape, with one difference that changes everything about the measurement: the strings are the final class names, written by hand. No compiler produced them. The 735B of "structure" in Tailwind's SSR chunk is the author's own literals, and the stylesheet is generated by scanning the source for exactly those strings — the arrow points from the JS to the CSS, not the other way round.

Conflicts are not resolved, as with CSS Modules: write `text-blue-500 text-red-500` and both ship. Which one wins is decided by their order in the generated stylesheet, which Tailwind sorts canonically — deterministic across builds, but not the order you wrote them in.

The conditional case needs no library. `filter(Boolean)` covers it at zero bytes, which is exactly what the control does:

```jsx
// tailwind-next/src/component/TailwindComponent.tsx
className={["p-2 text-base text-blue-500 …", isRed && "text-red-500 border-red-500"]
  .filter(Boolean)
  .join(" ")}
```

### The size of that choice

`npm run structure` extracts just the class-name machinery from each chunk — lookup tables, baked strings, and any resolver — excluding component code and the shared `page.module.css` map:

|               | SSR chunk | Structure | Runtime |  Total | Avg name |
| :------------ | --------: | --------: | ------: | -----: | -------: |
| _CSS Modules_ |    4,008B |    1,215B |       — | 1,215B |     28.9 |
| **Plumeria**  |    2,666B |      652B |       — |   652B |      8.0 |
| _Tailwind_    |    2,734B |      735B |       — |   735B |     10.6 |
| **StyleX**    |    4,550B |    1,143B |  1,419B | 2,562B |      7.6 |

The sharpest comparison is the five variant axes, where both compilers encode the _same 24 values_: Plumeria spends 428B (`red:"xq96bg3w"`), StyleX 849B (`red:{kMwMTN:"x1e2nbdu",$$css:!0}`). The extra ~18B per value is the wrapper that makes a runtime merge possible — the property-hash key is what lets two rules touching `color` collide. Then the resolver ships on top: 1,419B, more than the entire structure it interprets.

In this benchmark the components are Server Components on a static route, so all of this stays on the server and neither library puts styling code in the browser bundle. Marking `Test.tsx` with `"use client"` — the normal case for variant-driven UI — and rebuilding:

|               | Client chunk | of which structure | Runtime |
| :------------ | -----------: | -----------------: | ------: |
| _CSS Modules_ |       2,120B |             1,061B |       — |
| **Plumeria**  |     **861B** |               457B |       — |
| _Tailwind_    |         909B |               525B |       — |
| **StyleX**    |       2,733B |               912B |  1,419B |

StyleX ships 1.83KB more than Plumeria, mostly `styleq` itself. CSS Modules is worth reading carefully here: "no runtime" is not "nothing shipped" — its name map crosses to the browser unchanged, and at ~29 characters per name it is larger than Plumeria's entire client chunk.

---

## What Runs, and What Survives It

Every library here executes code during `next build`. Plumeria's compiler runs as a Turbopack loader, StyleX's as a Babel plugin, Tailwind's as a native scanner walking the source tree. Reading that as "they all have a build step" flattens the only distinction that reaches users.

The axis that matters is not whether something runs, but whether anything is left when it stops.

|               | Runs during the build       | Left in the bundle |                                                         Runs again |
| :------------ | :-------------------------- | -----------------: | -----------------------------------------------------------------: |
| _CSS Modules_ | PostCSS module transform    |           name map |                                                              never |
| **Plumeria**  | Turbopack loader (compiler) |                  — |                                                              never |
| _Tailwind_    | oxide scanner               |                  — |                                                              never |
| **StyleX**    | Babel plugin **+ `styleq`** |    `styleq` 1,419B | every ISR regeneration, every dynamic request, every client render |

`styleq` appears in both columns, and that is the point. In _this_ benchmark it does run at build time — `Test.tsx` is a Server Component on a static route (`prerender-manifest.json` reports `initialRevalidateSeconds: false`), so React prerenders the 1,000 components once during `next build` and `styleq` executes 1,000 times right there.

But that is incidental. oxide's build-time execution is terminal: it emits CSS and is gone, and grepping `tailwind-next`'s SSR and client chunks for any scanner code returns nothing. `styleq` is still in the SSR chunk when the build ends. Switch the route to ISR and it runs per regeneration; make it dynamic and it runs per request; add `"use client"` and it runs in the browser on every render.

Read this way, Plumeria and Tailwind land on the same side of the line despite having nothing else in common — one bakes a merge at build time, the other never has a merge to bake.

---

## The Trade

This benchmark leans toward what Plumeria optimizes for, so it is worth being explicit about what StyleX's design buys in return.

**Merging styles the compiler never saw.** Plumeria can bake the merge because each axis's values are declared in one place and enumerable at build time. StyleX's `props()` accepts arbitrary style objects at render — styles passed as props across module and package boundaries, composed by callers no compiler run ever saw together — and merges them deterministically, last-wins. That composition pattern is idiomatic StyleX and has no build-time equivalent.

**Insertion-order independence.** StyleX grades every atom's specificity by where its property sits in the CSS shorthand hierarchy, so a longhand always outranks any shorthand that could set the same thing — no matter what order code-split chunks inject their stylesheets. Plumeria spends specificity only where a build-time merge cannot decide the winner, and relies on its pipeline controlling emission order (its `@media` block is always last). At Meta's scale — hundreds of lazily loaded chunks — StyleX's guarantee is the safer one, and the [CSS section](#css-three-cascade-strategies) shows it is what StyleX's larger hack count is actually buying.

**The resolver is cheap to run, not cheap to ship.** `styleq` caches merges in a `WeakMap` keyed on the style objects, and with a handful of variant objects reused across 1,000 components the cache is warm almost immediately. The recurring cost is the 1.4KB on the wire and the work on hydration and re-render, not a per-element merge.

**And it is cheap for what it is.** StyleX's runtime is structural — `styleq` is how the variant case resolves at all. Tailwind's is opt-in, and the benchmark uses none of it. Measured for reference on the same fixture, `class-variance-authority` costs 1,148B of runtime to do _less_ than `styleq`'s 1,419B: it selects and concatenates but never merges, so conflicting atoms both survive. Adding `tailwind-merge` to get the merge back costs 26,804B. Against those, `styleq` is the cheapest runtime resolver here by a wide margin.

**Where each design pays.** The resolver is free while rendering stays on the server and the route stays static — the page is rendered once at build. Under ISR or dynamic rendering it runs per regeneration or per request; in client components, on every render. Plumeria's cost is the opposite: it is paid entirely at build time, and only for combinations the compiler can see.

> [!WARNING]
> **This benchmark does not measure what atomic CSS is actually for.** StyleX was built at Meta to stop the stylesheet growing with the codebase — facebook.com went from tens of megabytes of lazy-loaded CSS to a couple of hundred kilobytes, because atomic declarations deduplicate and the bundle plateaus as components are added. This app has two styled components; at that scale the CSS column is close to noise, and Tailwind's fixed overhead dominates its own number. What this benchmark measures honestly is build cost and what each library ships as code.

---

## Build Cost

`baseline-next` builds the same DOM with plain CSS Modules; subtracting its build time isolates what each library costs. 10 cold builds each, first excluded:

| Library      | Avg Build |    Min |    Max | SD (ms) |      Library Cost |
| :----------- | --------: | -----: | -----: | ------: | ----------------: |
| _baseline_   |    3.724s | 3.582s | 4.297s |   219.9 |                 — |
| **Plumeria** |    3.778s | 3.654s | 3.900s |    70.2 | ≈ 0 (below noise) |
| _Tailwind_   |    3.722s | 3.656s | 3.910s |    91.4 | ≈ 0 (below noise) |
| **StyleX**   |    4.325s | 4.264s | 4.402s |    45.2 |      **+601.4ms** |

Only StyleX's cost clears the noise floor. The baseline drew an outlier in this run (4.297s against a 3.582s minimum), and against an SD of 219.9ms neither Plumeria's +54.2ms nor Tailwind's −1.9ms means anything. Read both as "≈ 0.1s or less"; read StyleX's as real.

This measures everything adopting the library entails, not just time inside its compiler. Most of StyleX's ~0.6s is fixed toolchain cost rather than work proportional to the two styled components: its `babel.config.js` moves the application source off Next.js's native SWC pipeline onto Babel, and a PostCSS pass runs on top.

Plumeria's is what remains after v17 removed its own PostCSS pipeline — the compiler now runs as a Turbopack loader through `withPlumeria()`. In the 16.x measurements that pipeline made the cost ~500ms.

Tailwind's decomposes cleanly. Running `@tailwindcss/postcss` in isolation on this project:

```
module load (@tailwindcss/postcss → @tailwindcss/node → oxide .node)   65.1ms
first process (scan + generate)                                        34.0ms
subsequent                                          3.5, 3.3, 2.9, 3.8ms
```

Two thirds of it is loading the 2.9MB native addon once. The actual work is 34ms cold and ~3ms warm, because Tailwind runs once over one CSS entry point rather than per module.

> [!NOTE]
> **Read Tailwind's ≈ 0 as one point, not a curve.** The two costs scale differently. Most of StyleX's is a fixed toolchain penalty — moving the app onto Babel is paid once and barely grows with the number of styled components. Tailwind's is dominated here by a one-time native module load, but the work underneath it is a scan of the whole source tree, which does grow with the codebase. With two styled components this benchmark sits at the far-left end of that curve, where the fixed cost is everything and the scan is nearly free. Nothing measured here says where the two lines cross, only that at this size StyleX's is the larger one.

---

## Inside `.next`

Measured from the build outputs of the run above, by summing real file sizes (`du` rounds every file to a disk block). The totals decompose into three moving parts; everything else — framework chunks, cache, manifests — is within ~7KB across all four projects:

|               | `.next` total | source maps | `build/` toolchain | page prerender | everything else |
| :------------ | ------------: | ----------: | -----------------: | -------------: | --------------: |
| _CSS Modules_ |        6.84MB |   3,581.5KB |                  — |      1,479.1KB |       1,939.1KB |
| **Plumeria**  |    **6.51MB** |   3,699.4KB |             75.7KB |        954.3KB |       1,941.9KB |
| _Tailwind_    |        7.32MB |   4,071.3KB |            312.5KB |      1,170.9KB |       1,943.9KB |
| **StyleX**    |        7.19MB |   4,144.8KB |            357.6KB |        928.3KB |       1,936.5KB |

None of the gap is served to users: source maps and `build/` are both toolchain artifacts.

### `build/`: what is actually in there

> [!NOTE]
> **No library's compiler is bundled into `.next`.** Every loader and plugin here is resolved from `node_modules` at build time and executed, never bundled. What lands in `.next/build/` is Turbopack's own child-process host for evaluating them — plus, for any project with a `postcss.config.js`, the PostCSS runtime itself.
>
> The test is the module-id namespace. Chunks under `[turbopack-node]/` and `[externals]/` are Turbopack's; only `[project]/` ids come from the app's `node_modules`. Plumeria's `build/` contains **zero** `[project]/` modules, and grepping it for `atomicHash`, `createAtomicMapTable`, `splitCssRules` or the string `plumeria` returns nothing — the loader's own `dist/index.js` is 100.3KB, larger than the entire 75.7KB directory.

|               | `build/` | Turbopack host | PostCSS runtime |
| :------------ | -------: | -------------: | --------------: |
| _CSS Modules_ |        — |              — |               — |
| **Plumeria**  |   75.7KB |         75.7KB |               — |
| _Tailwind_    |  312.5KB |         60.2KB |     **252.3KB** |
| **StyleX**    |  357.6KB |        105.3KB |     **252.3KB** |

The PostCSS column is `postcss` (137.5KB), `source-map-js` (111.0KB), `picocolors` and `nanoid` — and it is **the same chunk, byte for byte**, in both projects that have it. Neither `@stylexjs/postcss-plugin` nor `@tailwindcss/postcss` is in there; the only match for "stylex" anywhere in StyleX's `build/` is the directory name inside `[project]/stylex-next/postcss.config.js_.loader.mjs`.

So StyleX's 282KB advantage over Plumeria in this column is not its compiler. It is the price of running a PostCSS pipeline at all, and Tailwind pays exactly the same price for the same reason. Tailwind's own scanner is a 2.9MB `.node` binary that Turbopack cannot bundle and does not try to.

### Page prerender

The prerendered page (`index.html`, `index.rsc`, and the segment payloads — the bytes actually served for the static route) is **26,718B smaller for StyleX than Plumeria**, and the gap decomposes almost exactly into two causes:

```
class-name length   16,655B   40,231 vs 40,222 occurrences × 0.42 characters
fixture text        10,036B   "Plumeria" (8 chars) ×5,015 vs "StyleX" (6) ×5,014
residual                27B
```

The first is real: both libraries emit essentially the same number of class names across the DOM and RSC payloads, and StyleX's names are shorter on average (7.60 vs 8.02 characters). Repeated forty thousand times, 0.42 characters is 16KB. The second is an artifact of the benchmark — each project's fixture text contains its own library's name, so 10KB of the gap measures nothing but the length of the word _Plumeria_.

The controls bracket both. Counting class names in `index.html` alone:

|               |  names | avg chars | class-name bytes |
| :------------ | -----: | --------: | ---------------: |
| _CSS Modules_ |  6,013 |     28.87 |          169.5KB |
| **Plumeria**  |  8,036 |      8.01 |           62.9KB |
| _Tailwind_    | 10,038 |     10.62 |          104.1KB |
| **StyleX**    |  8,036 |      7.60 |           59.6KB |

CSS Modules pays for its 28.9-character names: 847KB of its 1,479KB prerender is class names — over half the file. Tailwind's share is 520KB of 1,171KB. Tailwind's names are middling in length but there are 2,000 more of them, because the base style that Plumeria emits as one atom — `inline-block font-medium transition-all duration-200 ease-in-out` — is five classes here.

### CSS: three cascade strategies

Plumeria and StyleX emit exactly 34 atoms each, and the difference between their stylesheets (7.71 vs 8.08KB) is mostly one thing: how many `:not(#\#)` specificity hacks each stacks onto its selectors. `:not(#\#)` matches every element and exists only to add one id's worth of specificity — atomic CSS needs it because with one declaration per class, specificity rather than rule order must decide which atom wins.

|              | hacks | bytes | strategy                                                                                                       |
| :----------- | ----: | ----: | :------------------------------------------------------------------------------------------------------------- |
| **Plumeria** |    15 |  135B | bump only where a build-time merge cannot already order the result                                             |
| **StyleX**   |    51 |  459B | a four-level ladder keyed to the shorthand hierarchy                                                           |
| _Tailwind_   |     0 |     — | native cascade layers: `@layer theme, base, components, utilities` — precedence is the layer, not the selector |

> [!IMPORTANT]
> **Do not read 15 vs 51 as economy vs waste — it is close to the opposite.** The hacks are stacked on the _longhand_ side, and StyleX stacks more of them precisely so that longhands outrank shorthands structurally.

StyleX's count is not a floor applied uniformly. `@stylexjs/shared` scores every property by its position in the CSS shorthand hierarchy, and each 1,000 points of priority becomes one `:not(#\#)`:

```js
// @stylexjs/shared/lib/utils/property-priorities.js
shorthandsOfShorthands → 1000   // padding, margin, border, background, font, inset
shorthandsOfLonghands  → 2000   // border-color, border-style, border-width, border-radius, transition
longHandLogical        → 3000   // color, background-color, font-size, font-weight, display
longHandPhysical       → 4000   // margin-bottom, padding-top, width
```

Which is exactly what this app's stylesheet contains:

| tier                          | property in this app                                        | StyleX | Plumeria |
| :---------------------------- | :---------------------------------------------------------- | -----: | -------: |
| shorthand of shorthands       | `padding`                                                   |     x0 |       x0 |
| shorthand of longhands        | `border-radius`, `transition`, `border-color/-style/-width` |     x1 |       x0 |
| logical longhand              | `color`, `display`                                          |     x2 |       x0 |
| logical longhand              | `background-color`, `font-size`, `font-weight`              |     x2 |       x1 |
| physical longhand             | `margin-bottom`                                             |     x3 |       x1 |
| physical longhand, in a query | `margin-bottom` under `@media` / `:last-child`              |     x3 |       x2 |

`10×1 + 16×2 + 3×3 = 51`. Because every longhand carries strictly more hacks than any shorthand that could set the same thing, `padding-top` beats `padding` whichever stylesheet the browser saw first — and `border-color` sits one rung lower than `color` because `border-color` is itself a shorthand of four longhands.

Plumeria's ladder is flatter, and that is where the 324B saving comes from. Read the third row: `color` is a longhand and `padding` is a shorthand, and Plumeria gives both zero hacks. Nothing in the selector separates them, so a shorthand/longhand collision is decided by emission order — which Plumeria's pipeline controls, because it is the only thing writing the stylesheet.

That is fine here and gets less fine as a codebase grows. Order-based precedence holds only while one pipeline owns the order; StyleX's holds under arbitrary chunk insertion, which is the condition that actually appears at scale. **On this axis the advantage is StyleX's, and the smaller number is the weaker guarantee.**

Tailwind sidesteps the question entirely with `@layer` — the same ordering idea, delegated to the browser instead of encoded in specificity arithmetic. It can afford to, because it never merges: there is no shorthand-versus-longhand contest to arbitrate when the author writes the final class list by hand.

Tailwind's stylesheet is nonetheless the largest at 14.28KB, and its own utilities are not why:

```
globals.css (hand-written, shared)      3,713B
@layer base (preflight)                 3,689B   fixed
@layer theme (design tokens)            1,528B   fixed
@layer properties (polyfill)              269B   fixed
@property declarations                    224B   fixed
@layer components                          18B
@layer utilities (37 selectors, in use) 2,623B
```

5,710B of it is a floor paid regardless of app size, and the utilities actually in use are 2,623B — the same order as Plumeria's 34 atoms. At two styled components the floor dominates; that is precisely the regime the [warning above](#the-trade) is about.

---

## Method

- **Build**: `npm run bench` — 10 cold builds per project, first excluded to omit V8/compiler cold start, `.next` deleted before each.
- **Sizes**: real file sizes summed recursively from the final iteration's `.next`.
- **`build/` attribution**: chunks are classified by module-id namespace — `[turbopack-node]/` and `[externals]/` are Turbopack's own host, `[project]/` ids are bundled from the app's `node_modules`. The PostCSS column is the single `node_modules__pnpm_*` chunk.
- **Class-name structure**: `npm run structure` splits the SSR chunk on Turbopack module boundaries and extracts the object literals whose every string is class-name payload, cross-checked against selectors in the project's own generated CSS. `styleq` is inlined rather than a separate module, so it is carved out by brace-matching. The shared `page.module.css` map (identical in all four projects) is excluded.
- **Authority set**: a string counts as class-name payload only if every space-separated token is a selector the build emitted. For CSS Modules and the two atomic libraries that means `-module__` names and `x`-prefixed atoms. Tailwind's utilities match neither, and loosening the pattern enough to admit `border` would admit every one-word string in the framework chunks, so Tailwind's authority is read from its `@layer utilities` block instead — by construction exactly what the scanner generated for this source.
- **Client chunk**: separate build with `Test.tsx` marked `"use client"` (`--client` flag), reverted afterwards; the committed projects are Server Components. Candidate chunks must contain the component under test, which keeps Tailwind's `flex` — generated because oxide finds the string in `page.tsx`'s inline styles — from matching the bare `"flex"` in a framework chunk.
- **Prerender decomposition**: class-name occurrences counted in `index.html`, `index.rsc`, and both segment payloads, matched against the generated stylesheet's selectors.
- **Tailwind's build cost**: `@tailwindcss/postcss` driven directly over `globals.css`, timing module load and five successive `process()` calls separately.
- **cva / tailwind-merge**: measured once by swapping `Test.tsx`, then removed; neither is a dependency of the committed `tailwind-next`.
- **Lighthouse**: `next start` (production), 1,000 components displayed.

### Environment

|           |                                                      |
| :-------- | :--------------------------------------------------- |
| Framework | Next.js 16.2.10 (Turbopack)                          |
| React     | 19.2.4                                               |
| Libraries | StyleX 0.19.0 · Plumeria 18.1.1 · Tailwind CSS 4.3.3 |
| Runtime   | Node v25.8.2 · pnpm 11.3.0                           |
| Machine   | macOS Tahoe, Apple M1 (8-core), 16GB                 |
