# CSS-in-JS Benchmark: StyleX vs Plumeria

Authored by the maintainer of Plumeria.

Benchmarks Meta's **StyleX** against **Plumeria** on an identical Next.js app, with a third **CSS Modules** project as a no-library control.

All three render the same DOM: 1,000 components combining five variant axes (`color`, `size`, `padding`, `borderRadius`, `background`), plus a component exercising nested media queries, `:last-child`, and conditional styles.

|                         |  Build | Library Cost |    CSS | SSR Chunk | Client JS¹ | Class names resolved       |
| :---------------------- | -----: | -----------: | -----: | --------: | ---------: | :------------------------- |
| _CSS Modules (control)_ | 3.508s |            — | 8.26KB |    3.91KB |     2.07KB | never merged               |
| **Plumeria**            | 3.623s |        115ms | 7.71KB |    2.60KB |     0.84KB | at build                   |
| **StyleX**              | 4.124s |        617ms | 8.08KB |    4.44KB |     2.67KB | at client render, `styleq` |

- **Build cost** — adopting Plumeria adds ~0.1s to the build, StyleX ~0.6s. Most of StyleX's cost is toolchain: a `babel.config.js` that moves the app off Next.js's SWC pipeline, plus a PostCSS pass. See [Build Cost](#build-cost).
- **Shipped code** — once components are client-side, StyleX sends **1.83KB more to the browser**, mostly its `styleq` resolver. Plumeria ships no runtime. See [Class Name Strategy](#class-name-strategy).
- **What the runtime buys** — StyleX's resolver is not waste; it merges style objects the compiler never saw and makes correctness independent of stylesheet order. See [The Trade](#the-trade).
- **Runtime performance** — indistinguishable. Both score 100/100 on Lighthouse and prerender 1,000 components in ~210ms.

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
scripts/benchmark.mjs   build-time harness
scripts/structure.mjs   class-name structure / runtime decomposition
```

The three projects are structurally identical. In each, `src/component/Test.tsx` renders the 1,000 variant components and `src/component/*Component.tsx` carries the complex-style case; only the styling layer differs.

---

## Class Name Strategy

Both libraries resolve a variant like `color="red"` to an atomic class name, but they place that resolution on opposite sides of the build boundary — visible in the SSR chunk each emits (`.next/server/chunks/ssr/`).

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

Note what is baked: the *merge*, not the CSS. `isRed` is a runtime value, so the atoms of both branches stay in the stylesheet — the build eliminates the resolution work, and both outcomes remain selectable.

### StyleX — resolved at render time

```js
// the maps: 5 objects, 24 variant values, 849B
const color = { red: {kMwMTN:"x1e2nbdu", $$css:!0}, blue: {kMwMTN:"xju2f9n", $$css:!0}, … };

// the resolver: 1,247B of inlined styleq, plus a 172B props() wrapper
styleq(base, color[c], size[s], padding[p], radius[r], background[b])
```

Each key (`kMwMTN`) is a hash of the CSS *property*, not of the style name. Because two rules setting `color` collide on that key, `styleq` can walk its arguments in reverse and keep the first hit per property — last argument wins. That is the same merge Plumeria performs during the build, kept alive at render, at the cost of a bundled resolver.

Not everything is deferred: given the same `isRed && styles.red` boolean conflict, StyleX's Babel plugin bakes a branch table of finished class strings exactly as Plumeria does, never calling `styleq`. What it does not bake is the variant case, where axis values arrive as props — StyleX keeps the property-keyed maps intact and defers to `styleq`. That is the case `Test.tsx` measures.

### CSS Modules — no merge at all

```js
{ base:"Test-module__JtUlTa__base", red:"Test-module__JtUlTa__red", … }
```

One flat object mapping local style names to generated global ones, consumed with `.join(" ")`. Conflicting rules cannot be detected — both classes are emitted and the cascade decides. No runtime, but names average 28.9 characters against ~8 for either library.

### The size of that choice

`npm run structure` extracts just the class-name machinery from each chunk — lookup tables, baked strings, and any resolver — excluding component code and the shared `page.module.css` map:

|               | SSR chunk | Structure | Runtime | Total  | Avg name |
| :------------ | --------: | --------: | ------: | -----: | -------: |
| _CSS Modules_ |    4,008B |    1,215B |       — | 1,215B |     28.9 |
| **Plumeria**  |    2,666B |      652B |       — |   652B |      8.0 |
| **StyleX**    |    4,550B |    1,143B |  1,419B | 2,562B |      7.6 |

The sharpest comparison is the five variant axes, where both compilers encode the *same 24 values*: Plumeria spends 428B (`red:"xq96bg3w"`), StyleX 849B (`red:{kMwMTN:"x1e2nbdu",$$css:!0}`). The extra ~18B per value is the wrapper that makes a runtime merge possible — the property-hash key is what lets two rules touching `color` collide. Then the resolver ships on top: 1,419B, more than the entire structure it interprets.

In this benchmark the components are Server Components on a static route, so all of this stays on the server and neither library puts styling code in the browser bundle. Marking `Test.tsx` with `"use client"` — the normal case for variant-driven UI — and rebuilding:

|               | Client chunk | of which structure | Runtime |
| :------------ | -----------: | -----------------: | ------: |
| _CSS Modules_ |       2,120B |             1,061B |       — |
| **Plumeria**  |     **861B** |               457B |       — |
| **StyleX**    |       2,733B |               912B |  1,419B |

StyleX ships 1.83KB more than Plumeria, mostly `styleq` itself. CSS Modules is worth reading carefully here: "no runtime" is not "nothing shipped" — its name map crosses to the browser unchanged, and at ~29 characters per name it is larger than Plumeria's entire client chunk.

---

## The Trade

This benchmark leans toward what Plumeria optimizes for, so it is worth being explicit about what StyleX's design buys in return.

**Merging styles the compiler never saw.** Plumeria can bake the merge because each axis's values are declared in one place and enumerable at build time. StyleX's `props()` accepts arbitrary style objects at render — styles passed as props across module and package boundaries, composed by callers no compiler run ever saw together — and merges them deterministically, last-wins. That composition pattern is idiomatic StyleX and has no build-time equivalent.

**Insertion-order independence.** StyleX gives nearly every atom a uniform specificity floor of `:not(#\#)` hacks so that any atom can override any earlier one no matter what order code-split chunks inject their stylesheets. Plumeria spends specificity only where a build-time merge cannot decide the winner and relies on its pipeline controlling emission order (its `@media` block is always last). At Meta's scale — hundreds of lazily loaded chunks — StyleX's guarantee is the safer one.

**The resolver is cheap to run, not cheap to ship.** `styleq` caches merges in a `WeakMap` keyed on the style objects, and with a handful of variant objects reused across 1,000 components the cache is warm almost immediately. The recurring cost is the 1.4KB on the wire and the work on hydration and re-render, not a per-element merge.

**Where each design pays.** The resolver is free while rendering stays on the server and the route stays static (`prerender-manifest.json` reports `initialRevalidateSeconds: false` here — the page is rendered once at build). Under ISR or dynamic rendering it runs per regeneration or per request; in client components, on every render. Plumeria's cost is the opposite: it is paid entirely at build time, and only for combinations the compiler can see.

> [!WARNING]
> **This benchmark does not measure what atomic CSS is actually for.** StyleX was built at Meta to stop the stylesheet growing with the codebase — facebook.com went from tens of megabytes of lazy-loaded CSS to a couple of hundred kilobytes, because atomic declarations deduplicate and the bundle plateaus as components are added. This app has two styled components; at that scale all three stylesheets land within 7% of each other and the CSS column is close to noise. What this benchmark measures honestly is build cost and what each library ships as code.

---

## Build Cost

`baseline-next` builds the same DOM with plain CSS Modules; subtracting its build time isolates what each library costs. 10 cold builds each, first excluded:

| Library      | Avg Build |    Min |    Max | SD (ms) | Library Cost |
| :----------- | --------: | -----: | -----: | ------: | -----------: |
| _baseline_   |    3.508s | 3.468s | 3.634s |    51.7 |            — |
| **Plumeria** |    3.623s | 3.572s | 3.691s |    42.3 |  **115.2ms** |
| **StyleX**   |    4.124s | 4.076s | 4.168s |    29.4 |  **616.8ms** |

This measures everything adopting the library entails, not just time inside its compiler. Most of StyleX's ~0.6s is fixed toolchain cost rather than work proportional to the two styled components: its `babel.config.js` moves the application source off Next.js's native SWC pipeline onto Babel, and a PostCSS pass runs on top.

Plumeria's ~0.1s is what remains after v17 removed its own PostCSS pipeline — the compiler now runs as a Turbopack loader through `withPlumeria()`. In the 16.x measurements that pipeline made the cost ~500ms.

> [!NOTE]
> Library Cost is a difference of two wall-clock averages and varies by roughly ±100ms between full runs — previous runs have measured Plumeria's as low as −11ms. StyleX's ordering and rough magnitude are stable across runs; read Plumeria's as "≈0.1s or less", not as a precise constant.

---

## Inside `.next`

Measured from the build outputs of the run above, by summing real file sizes (`du` rounds every file to a disk block). The totals decompose into three moving parts; everything else — framework chunks, cache, manifests — is within ~6KB across all three projects:

|               | `.next` total | source maps | `build/` toolchain | page prerender | everything else |
| :------------ | ------------: | ----------: | -----------------: | -------------: | --------------: |
| _CSS Modules_ |        6.84MB |   3,581.5KB |                  — |      1,428.5KB |       1,989.8KB |
| **Plumeria**  |        6.51MB |   3,699.4KB |             75.7KB |        903.7KB |       1,992.5KB |
| **StyleX**    |        7.19MB |   4,144.8KB |            357.6KB |        877.6KB |       1,987.1KB |

Plumeria's `.next` is 0.68MB smaller than StyleX's, and none of that is served to users: source maps account for 445KB of the gap and `build/` — where Turbopack bundles each project's plugin toolchain — for another 282KB, both toolchain artifacts of the Babel + PostCSS pipeline StyleX brings with it. The control has no `build/` directory at all.

### Page prerender: the column that favors StyleX

The prerendered page (`index.html`, `index.rsc`, and the segment payloads — the bytes actually served for the static route) is **26.1KB smaller for StyleX**, and the gap decomposes almost exactly into two causes:

```
class-name length   16,655B   40,174 occurrences × 0.41 characters
fixture text        10,036B   "Plumeria" (8 chars) vs "StyleX" (6), ~5,015 occurrences
residual                27B
```

The first is real: both libraries emit essentially the same number of class names (40,174 vs 40,165) across the DOM and RSC payloads, and StyleX's names are shorter on average (7.60 vs 8.01 characters). Repeated forty thousand times, 0.41 characters is 16KB. The second is an artifact of the benchmark — each project's fixture text contains its own library's name, so 10KB of the gap measures nothing but the length of the word *Plumeria*. CSS Modules pays for its 28.9-character names here: 846KB of its 1,428KB prerender is class names.

### CSS: two cascade strategies

Both compilers emit exactly 34 atoms, and the stylesheet sizes (7.71 vs 8.08KB) differ mostly in one thing: how many `:not(#\#)` specificity hacks each stacks onto its selectors. `:not(#\#)` matches every element and exists only to add one id's worth of specificity — atomic CSS needs it because with one declaration per class, specificity rather than rule order must decide which atom wins.

|              | hacks |  bytes | strategy                                                                                              |
| :----------- | ----: | -----: | :---------------------------------------------------------------------------------------------------- |
| **Plumeria** |    15 |   135B | bump only longhands and rules inside queries — the cases a build-time merge cannot already order       |
| **StyleX**   |    51 |   459B | uniform floor on nearly every atom, so precedence holds in any insertion order — what `styleq` relies on |

That 324B difference is most of the 376B gap between the stylesheets. It is the same trade as [above](#the-trade): Plumeria's economy depends on its pipeline controlling where rules land; StyleX pays per-selector so that placement never matters. At two components, either way, the CSS column is noise — see the warning above.

---

## Method

- **Build**: `npm run bench` — 10 cold builds per project, first excluded to omit V8/compiler cold start, `.next` deleted before each.
- **Sizes**: real file sizes summed recursively from the final iteration's `.next`.
- **Class-name structure**: `npm run structure` splits the SSR chunk on Turbopack module boundaries and extracts the object literals whose every string is class-name payload, cross-checked against selectors in the project's own generated CSS. `styleq` is inlined rather than a separate module, so it is carved out by brace-matching. The shared `page.module.css` map (identical in all three projects) is excluded.
- **Client chunk**: separate build with `Test.tsx` marked `"use client"` (`--client` flag), reverted afterwards; the committed projects are Server Components.
- **Prerender decomposition**: class-name occurrences counted in `index.html`, `index.rsc`, and both segment payloads, matched against the generated stylesheet's selectors.
- **Lighthouse**: `next start` (production), 1,000 components displayed.

### Environment

|           |                                      |
| :-------- | :----------------------------------- |
| Framework | Next.js 16.2.10 (Turbopack)          |
| React     | 19.2.4                               |
| Libraries | StyleX 0.19.0 · Plumeria 18.1.1      |
| Runtime   | Node v25.8.2 · pnpm 11.3.0           |
| Machine   | macOS Tahoe, Apple M1 (8-core), 16GB |
