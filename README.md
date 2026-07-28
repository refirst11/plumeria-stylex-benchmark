# CSS-in-JS Benchmark: StyleX vs Plumeria

Authored by the maintainer of Plumeria.

Benchmarks Meta's **StyleX** against **Plumeria** on an identical Next.js app, with a third **CSS Modules** project as a no-library control.

All three render the same DOM: 1,000 components combining five variant axes (`color`, `size`, `padding`, `borderRadius`, `background`), plus a component exercising nested media queries, `:last-child`, and conditional styles.

|                         |  Build | Library Cost |        CSS |  SSR Chunk | Client JS¹ | Class names resolved       |
| :---------------------- | -----: | -----------: | ---------: | ---------: | ---------: | :------------------------- |
| _CSS Modules (control)_ |     3.676s |            — |     8.26KB |     3.91KB |     2.07KB | never merged               |
| **Plumeria**            | **3.665s** |  **−10.9ms** | **7.71KB** | **2.60KB** | **0.84KB** | **at build**               |
| **StyleX**              |     4.121s |      445.0ms |     8.08KB |     4.44KB |     2.67KB | at client render, `styleq` |

### Key findings

- **Build cost** — Plumeria's is now indistinguishable from zero. At −10.9ms against a control whose own runs vary by ±74ms, adopting it costs no measurable build time; StyleX costs 445.0ms. Plumeria 17 dropped the PostCSS pipeline for a native Turbopack loader, and the ~500ms it used to cost went with it.
- **Shipped code** — StyleX sends **1.83KB more to the browser** once components are client-side, the bulk of it the `styleq` resolver. Plumeria ships no runtime.
- **Runtime performance** — indistinguishable. Both score 100/100 on Lighthouse and prerender 1,000 components in ~210ms.

<sub>¹ measured with `Test.tsx` marked `"use client"`; see [Where the resolver is paid for](#where-the-resolver-is-paid-for).</sub>

### Contents

- [Quick Start](#quick-start)
- [Class Name Strategy](#class-name-strategy) — where the two libraries actually differ
- [Output Sizes](#output-sizes) — why the raw totals mislead
- [Build Cost](#build-cost)
- [Method](#method)

---

## Quick Start

```bash
pnpm install
npm run bench
```

Runs 10 cold builds of each project and prints the build table. To decompose what each styling layer actually emits:

```bash
npm run structure            # class-name structure and runtime, from the SSR chunks
npm run structure -- --client   # also rebuilds each project with `Test.tsx` as a Client Component
```

To build one project on its own:

```bash
cd plumeria-next && npm run build   # or stylex-next, baseline-next
```

### Repository layout

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

This is where the two libraries actually differ. Both resolve a variant like `color="red"` to an atomic class name, but they place that resolution on opposite sides of the build boundary — visible in the SSR chunk each emits, `.next/server/chunks/ssr/[root-of-the-server]__*.js`.

The thing to watch is **what each map is keyed by**, because that decides whether a last-wins merge is even possible at runtime:

| Keyed by                          | Enables                                                                                                         |
| :-------------------------------- | :-------------------------------------------------------------------------------------------------------------- |
| local style name (`base`, `red`)  | nothing — the key says nothing about which CSS property is being set, so overlapping rules cannot be reconciled |
| variant value (`red`, `large`)    | nothing at runtime — the overlap was already resolved when the strings were baked                               |
| CSS property (`kMwMTN` = `color`) | last-wins merge, since two rules touching the same property collide on the same key                             |

### Plumeria — variant-keyed lookup tables, resolved at build time

```js
className: "xo8omt7h x6vb0uvf x1wwwd6e "
  + ({red:"xq96bg3w", blue:"xgmn1kmt", green:"x3git8yv", …})[color]
  + " " + ({small:"xhrr6ses", medium:"xbm90xtb", …})[size]
  + …
```

**One literal per variant axis, inlined at the call site and keyed by the variant value.** The compiler has already decided which class wins for every reachable combination, so the render is one O(1) property read per axis plus a concatenation. No runtime is shipped, and no merge happens — there is nothing left to merge.

#### Conflicts cluster, the rest concatenates

The five axes above are independent — `color`, `size`, `padding`, `borderRadius` and `background` each set a different property — so nothing overlaps and every axis stays its own table. When declarations _do_ collide the compiler splits the output in two: **non-conflicting atoms are concatenated into a static prefix, and only the conflicting ones are clustered into a bracket.** `PlumeriaComponent.tsx` is that case — `base` sets `color: blue` and `borderColor: blue`, `red` overrides both, and the choice is a runtime boolean:

```jsx
<div styleName={[styles.base, isRed && styles.red]}>
```

compiles to

```js
className: "xymmdeuh xbm90xtb xragrh7v xmt672rk x4vahbk7 " +
  ({ 0: "xgmn1kmt xvxlh81m", 1: "xq96bg3w xtopzak1" }[a ? "1" : "0"] ||
    "xgmn1kmt xvxlh81m");
```

verbatim from the SSR chunk, where `a` is `isRed` after minification. The trailing `||` is the same default guard the variant tables carry as `||""`; here `a?"1":"0"` can only produce keys the object already has, so it is emitted but unreachable.

`base` declares seven properties but only five reach the prefix. The two that `red` also sets are lifted out and appear once per branch, already reduced to the winner:

|               | atoms                                          | declarations                                                        |
| :------------ | :--------------------------------------------- | :------------------------------------------------------------------ |
| static prefix | `xymmdeuh xbm90xtb xragrh7v xmt672rk x4vahbk7` | `padding` `font-size` `border-style` `border-width` `border-radius` |
| branch `0`    | `xgmn1kmt xvxlh81m`                            | `color:#00f` `border-color:#00f`                                    |
| branch `1`    | `xq96bg3w xtopzak1`                            | `color:red` `border-color:red`                                      |

**What is baked is the class name each branch produces — not which rules ship.** Both `.xgmn1kmt{color:#00f}` and `.xq96bg3w{color:red}` are in the stylesheet and have to be: `isRed` is a runtime value, so both branches are reachable and both atoms must exist for either to be selectable. The build eliminates the _merge_, not the CSS — the same distinction drawn in [Where the resolver is paid for](#where-the-resolver-is-paid-for), where what a build resolves is the output rather than the code.

Clustering is also what keeps the enumeration small. It is scoped to each set of mutually conflicting declarations rather than to the axes as a whole, so independent axes compose by concatenation instead of multiplying — the five in `Test.tsx` produce five tables, not one table of 5×4×5×5×5.

### StyleX — property-keyed hash map, resolved at render time

```js
// the maps: 5 objects, 24 variant values, 849B
const color = { red: {kMwMTN:"x1e2nbdu", $$css:!0}, blue: {kMwMTN:"xju2f9n", $$css:!0}, … };

// the resolver: 1,247B of inlined styleq, plus a 172B props() wrapper
styleq(base, color[c], size[s], padding[p], radius[r], background[b])
```

**Each key (`kMwMTN`) is a hash of the CSS property, not of the style name**, and `$$css` marks the object as pre-compiled. Because two rules setting `color` collide on that key, `styleq` can walk the arguments in reverse and keep only the first hit per property — last argument wins. That is the same merge Plumeria performs during the build, kept alive at render instead, at the cost of a bundled resolver.

"At render time" applies to the variant case, not to everything. Given the boolean conflict of `StyleXComponent.tsx` — the same `isRed && styles.red` shape shown above — the Babel plugin resolves it at build exactly as Plumeria does, emitting a 153B branch table of finished class strings and never calling `styleq`:

```js
{0:{className:"xe8ttls x1j61zf2 xju2f9n x1118g2m x1y0btm7 xmkeg23 x12oqio5"},
 1:{className:"xe8ttls x1j61zf2 x1y0btm7 xmkeg23 x12oqio5 x1e2nbdu x71xlcl"}}[0|!!isRed]
```

What it does not bake is the variant case, where the axis values arrive as props. Nothing makes that impossible — Plumeria bakes it by enumerating each axis's declared values rather than its call sites — but StyleX keeps the `$$css` objects intact and defers to `styleq`. That is the case `Test.tsx` measures, and the one that costs a resolver.

### CSS Modules — name-keyed map, no merge at all

```js
{ base:"Test-module__JtUlTa__base", red:"Test-module__JtUlTa__red", … }
```

**One flat object per stylesheet**, mapping the local style name to the generated global one, consumed with `.join(" ")`. Because the key is the style name, conflicting rules cannot be detected — two classes that both set `color` are simply both emitted and the cascade decides. No runtime, but names average 29.8 characters against ~8 for either library.

### The size of that choice

Extracting just the class-name structures from each chunk — the maps themselves, with component code and the shared `page.module.css` map excluded — gives the like-for-like comparison. `npm run structure` reproduces every number in this section:

|               |  SSR chunk | Class-name structure                                                                        |    Runtime | Structure + runtime | Avg name |
| :------------ | ---------: | :------------------------------------------------------------------------------------------ | ---------: | ------------------: | -------: |
| _CSS Modules_ |     3.91KB | **1,215B** — name-keyed, 28 entries over two maps                                           |          — |          **1,215B** |     29.8 |
| **Plumeria**  | **2.60KB** | **652B** — 428B variant lookups + 45B conflict table + 179B baked strings                   |          — |            **652B** |      8.0 |
| **StyleX**    |     4.44KB | **1,143B** — 849B `$$css` variant maps + 63B base + 153B conflict table + 78B baked strings | **1,419B** |          **2,562B** |      7.6 |

The sharpest comparison is the five variant axes, because both compilers encode the _same 24 values_ there — five colors, four sizes, five paddings, five radii, five backgrounds:

|              | five variant axes | per value | emitted form                       |
| :----------- | ----------------: | --------: | :--------------------------------- |
| **Plumeria** |          **428B** | **17.8B** | `red:"xq96bg3w"`                   |
| **StyleX**   |              849B |     35.4B | `red:{kMwMTN:"x1e2nbdu",$$css:!0}` |

**StyleX spends twice the bytes to encode identical information.** The extra ~18B per value is not the class name — StyleX's names are marginally _shorter_ — it is the wrapper: an object per value, a property-hash key, and the `$$css` marker. That wrapper is exactly what makes a runtime merge possible, since it is the property key that lets two rules touching `color` collide. It is the price of the design, paid per variant value, before any resolver is shipped.

Then the resolver is shipped anyway: **1,419B, made of 1,247B of inlined `styleq` plus a 172B `props()` wrapper at the call site** — more than the entire structure it interprets. Plumeria carries neither, so it lands **3.9x smaller in total**, 652B against 2,562B. CSS Modules sits between them: its 28 entries cost 1,215B because both keys and values are human-readable long names, but with nothing to ship at runtime it still comes in under half of StyleX. At the whole-chunk level this shows up as **StyleX being 1.84KB larger than Plumeria.**

Note that this is not a per-render cost. `styleq` caches merges in a `WeakMap` keyed on the style objects themselves, and with a handful of variant objects reused across 1,000 components the cache is warm almost immediately. Merging is not where the two differ — **shipping the resolver is.**

### Where the resolver is paid for

In this benchmark the components are Server Components on a statically prerendered route, so `styleq` runs at build time and never reaches the browser — neither project puts styling code in `static/chunks`. That changes the moment a styled component becomes a Client Component, which is the normal case for variant-driven UI. Marking `Test.tsx` with `"use client"` and rebuilding:

|               |      Client chunk | of which structure |    Runtime | Contents                                    |
| :------------ | ----------------: | -----------------: | ---------: | :------------------------------------------ |
| _CSS Modules_ |   2,120B (2.07KB) |             1,061B |          — | `Test.module.css` name map + variant tables |
| **Plumeria**  | **861B** (0.84KB) |           **457B** |          — | five variant lookups + the baked prefix     |
| **StyleX**    |   2,733B (2.67KB) |               912B | **1,419B** | `styleq` + `props()` wrapper + `$$css` maps |

**StyleX ships 1.83KB more to the browser than Plumeria**, mostly `styleq` itself, and that resolver then runs on hydration and on every client re-render. Plumeria has no runtime to ship — the merge was resolved during the build, and only the lookup tables and the concatenation survive into the bundle.

CSS Modules is the one to read carefully here, because "no runtime" is not the same as "nothing shipped". Its map is **byte-identical in the SSR and client chunks — 1,061B in both** — so the whole structure crosses to the browser unchanged, and at 29.6 characters per name it is larger than Plumeria's entire client chunk. What CSS Modules avoids is the resolver, not the payload.

So the map-plus-resolver design is free only while rendering stays on the server **and the route stays static**. `prerender-manifest.json` reports `initialRevalidateSeconds: false` here, so the page renders once at build time and every request is served from the generated HTML. Under ISR or a dynamic route the resolver runs again per regeneration or per request; in a client-rendered React app it runs on every render, always. Note also that `styleq` is not eliminated by the build even when it never executes — it stays in `.next/server/chunks/ssr/` and is listed among the 113 traced dependencies in `page.js.nft.json`. What is resolved at build time is the _output_, not the code.

---

## Output Sizes

The prerendered output comes out marginally smaller for StyleX, and the `.next` total marginally smaller for Plumeria. Neither number is served code, and neither reflects much that is architectural — both need decomposing before they mean anything.

|               | `.next` total | `build/chunks` | source maps | prerender artifacts |
| :------------ | ------------: | -------------: | ----------: | ------------------: |
| _CSS Modules_ |       6.84MB |              — |   3581.50KB |           1431.78KB |
| **Plumeria**  |   **6.51MB** |   **195.28KB** |   3699.36KB |            907.00KB |
| **StyleX**    |       7.19MB |       908.05KB |   4144.84KB |            880.91KB |

**Plumeria's `.next` is 0.68MB smaller than StyleX's, and almost all of that is toolchain rather than output.** `build/chunks` — where Turbopack bundles the PostCSS configs and plugins a project pulls in — accounts for 712.77KB of the gap on its own, StyleX still running a PostCSS pass that Plumeria 17 no longer needs. Source maps add another 445.48KB in the same direction. Against those, Plumeria's prerendered output is 26.09KB _larger_ — and as the next section shows, only 16.27KB of even that is attributable to the styling layer, the rest being the benchmark's own fixture text. The control has no `build/chunks` directory, having no plugin toolchain to bundle.

**None of that 26,718-byte gap is architectural, and it decomposes into two causes that between them close it to within 27 bytes:**

```
class-name length   16,655B    40,176 occurrences × 0.41 characters
fixture text        10,036B    "Plumeria" (8 chars) vs "StyleX" (6), 5,015 occurrences
residual                27B
                    ────────
total gap           26,718B
```

The first is real but small per occurrence. Both libraries emit essentially the same number of class names — 40,176 against 40,167 — across the rendered DOM, the inlined RSC payload in `index.html`, `index.rsc`, and the segment payloads. Plumeria's average 8.01 characters to StyleX's 7.60, and that 0.41-character difference is what the class-name column below measures.

**The second is an artifact of this benchmark rather than of either library.** Each project's component renders its own library's name — `"Plumeria Test Component with Bracket Notation Variants"` against `"StyleX Test Component with Bracket Notation Variants"`, plus `"Hello from …!"` and the page heading — and those strings are emitted 5,015 times across the same artifacts. At two characters a time that is 10,036 bytes measuring nothing but the length of the word _Plumeria_. **The fixtures are not byte-comparable on this axis**, and the prerender column should be read with that subtracted.

|               | Prerender artifacts | of which class names | occurrences | avg name |
| :------------ | ------------------: | -------------------: | ----------: | -------: |
| _CSS Modules_ |           1431.78KB |             846.54KB |      30,026 |    28.87 |
| **Plumeria**  |            907.00KB |             314.37KB |      40,176 |     8.01 |
| **StyleX**    |            880.91KB |             298.10KB |      40,167 |     7.60 |

**At equal name length and equal fixture text the two would produce the same prerendered bytes to within 27 bytes**, and Plumeria would keep both its smaller chunk and its lack of a runtime.

Both libraries are far ahead of CSS Modules regardless — its 28.9-character names alone cost 847KB, and it needs fewer occurrences to get there.

### Why the CSS column tips to Plumeria

The stylesheet sizes (7.71 vs 8.08KB) invert what name length predicts. Both compilers emit exactly 34 atoms here, and Plumeria's names are the _longer_ ones (8.01 vs 7.60 characters), which should make its CSS the larger of the two. It doesn't, because **inside a stylesheet each atomic name appears exactly once**, in its own selector, so the 0.41-character difference is worth ~14 bytes across 34 rules. (This is the mirror of the prerender table above, where each name repeats tens of thousands of times and the same 0.41 characters cost 16KB.) Name length is simply not what the CSS column measures.

What it measures is **how many `:not(#\#)` specificity hacks each compiler stacks onto its selectors.** `:not(#\#)` matches every element — nothing has an id of literally `#` — so it changes no matching; it exists only to add one id's worth of specificity. Atomic CSS needs the tool: with one declaration per class, the cascade can no longer be steered by writing rules in a deliberate order, so specificity decides which atom wins when two touch the same property.

The two spend it very differently:

|              | `:not(#\#)` hacks | plain atoms | bumped atoms                   | extra                                                                                     |
| :----------- | ----------------: | ----------: | :----------------------------- | :---------------------------------------------------------------------------------------- |
| **Plumeria** |     15 (**135B**) |     21 / 34 | 13 (2 doubled)                 | —                                                                                         |
| **StyleX**   |     51 (**459B**) |      5 / 34 | 29 (**16 doubled, 3 tripled**) | reset wrapped in `@layer` _and_ emitted twice; class doubled in the media rule (`.x….x…`) |

Plumeria's count is not a heuristic. The level is just how many of two conditions hold — the declaration is a **longhand**, and it sits **inside a query**:

|               | base | in query |
| :------------ | ---: | -------: |
| **shorthand** |    0 |        1 |
| **longhand**  |    1 |        2 |

That reproduces the stylesheet exactly. The 21 bare atoms are all shorthands or standalone properties (`padding`, `color`, `border-color` / `-style` / `-width`, `border-radius`, `display`, `transition`); the 11 single-hack atoms are all longhands (`font-size` ×4, `background-color` ×5, `font-weight`, `margin-bottom`); and the only two double-hack rules are longhands in a nested context — `margin-bottom` under `:last-child`, and `margin-bottom` inside the media query. `0×21 + 1×11 + 2×2 = 15`, the measured total.

What the rule restores is the cascade relationship atomisation destroys. Split into one class per declaration, a longhand no longer outranks the shorthand it belongs to — `padding-top` and `padding` become two unrelated classes of equal weight — so the longhand is given exactly one level to win that back, and one more to clear the same property declared outside a query. Nothing is spent anywhere else.

StyleX instead gives almost every atom a uniform specificity floor of one or two hacks and pushes the override-heavy rules to three, so any atom can win over any earlier one in any insertion order — the guarantee `styleq` leans on when it merges arbitrary style objects at render. That is a sound choice for a runtime merger, but on paper **the 36 extra hacks cost 324 bytes — most of the 376-byte gap between the two stylesheets.** With both emitting 34 atoms, names and formatting roughly cancel around it.

Part of Plumeria's economy is positional rather than selectorial: its `@media` block is emitted **last in the stylesheet**, without exception. That placement is what lets the two-level scale stay this short — a shorthand inside a query and a longhand outside one both land on level 1, and the tie is broken not by adding a third level but by the query block being further down the file. StyleX buys no such guarantee: the same media rule is emitted as `.x….x…:not(#\#):not(#\#):not(#\#)` — the class doubled _and_ three hacks — precedence encoded entirely in the selector, holding wherever the rule lands and in whatever order code-split chunks insert their stylesheets.

That is the real trade. Plumeria spends bytes only where a build-time merge cannot already decide the winner, and leans on a pipeline that controls placement; StyleX spends them everywhere so that placement never matters. So the CSS column is not measuring compression or name length; it is measuring two cascade strategies, and the ~4% gap is the price of StyleX's position-independence — still, at two components, well inside the noise the next note describes.

> [!WARNING]
> **This benchmark does not measure what atomic CSS is actually for.** StyleX was built at Meta to stop the stylesheet growing linearly with the codebase — facebook.com went from tens of megabytes of lazy-loaded CSS to a couple of hundred kilobytes, roughly an 80% cut, because atomic declarations deduplicate and the bundle _plateaus_ as components are added.
>
> This app has two styled components. At that scale the plateau has nothing to plateau from, which is why all three stylesheets land within 7% of each other (7.71 / 8.08 / 8.26KB) and the control is barely behind. Judging either library's stylesheet strategy from these numbers would be a mistake; the CSS column here is close to noise. What this benchmark does measure honestly is build cost and what each library ships as code.

---

## Build Cost

`baseline-next` is the control: the same DOM and the same 1,000 components, styled with plain CSS Modules and no CSS-in-JS library. Subtracting its build time isolates what each library costs.

```
Library Cost = (project build time) − (baseline-next build time)
```

| Library      | Avg Build (s) |    Min |    Max | SD (ms) | Library Cost |
| :----------- | ------------: | -----: | -----: | ------: | -----------: |
| _baseline_   |        3.676s | 3.566s | 3.770s |    74.3 |            — |
| **Plumeria** |    **3.665s** | 3.607s | 3.762s |    50.2 |  **−10.9ms** |
| **StyleX**   |        4.121s | 4.064s | 4.179s |    34.2 |      445.0ms |

This measures everything adopting the library entails, not just time inside its compiler: loading the plugin packages, whatever pipeline the control never runs, and — for StyleX — a `babel.config.js` that moves the application source off Next.js's native SWC pipeline onto Babel. Most of that is fixed cost rather than work proportional to the styles compiled; StyleX is not spending 445ms on two component files, and the bulk is toolchain it brings with it.

**Plumeria's cost has gone to zero, and the reason is visible in the project directory rather than in the timings.** Version 17 removed `postcss.config.js`: the compiler now runs as a Turbopack loader through `withPlumeria()`, so the build no longer starts a PostCSS pass at all. In the 16.5 measurements that pipeline was the bulk of a ~500ms library cost. What is left is inside the noise floor — −10.9ms against a control with a 74.3ms standard deviation is a negative number only by accident of sampling, and should be read as _no measurable cost_, not as a speedup.

The same change shows in the build artifacts: `.next/build/chunks`, where Turbopack bundles PostCSS configs and plugins, is 908.05KB for StyleX and only 195.28KB for Plumeria.

> [!NOTE]
> Library Cost is a difference of two wall-clock averages and varies by roughly ±100ms between full runs. StyleX's ordering and rough magnitude have been stable across runs; Plumeria's sits close enough to zero that its sign is not meaningful.

---

## Method

- **Build**: 10 cold builds per project, first excluded to omit V8/compiler cold start. `.next` is deleted before each.
- **Sizes**: computed by summing actual file sizes recursively, not `du`, which rounds every file to a disk block.
- **Served payload**: `.next` minus source maps, `build/` toolchain, and bookkeeping (`.nft.json`, `.tsbuildinfo`, `cache/`).
- **Client chunk**: measured in a separate build with `Test.tsx` marked `"use client"`, isolating what each library's `import` pulls into `static/chunks`. Reverted afterwards; the committed projects are Server Components.
- **Class-name structure**: `npm run structure` (add `--client` for the client-chunk column). It splits the SSR chunk on Turbopack module boundaries, then inside each module takes the maximal object literals whose every string is class-name payload, plus the class-name strings outside them. A string counts as payload only if all its space-separated tokens appear as selectors in the project's own generated CSS — which is what keeps a variant _value_ like `"xlarge"`, or the string `"p"` in a framework chunk, from being mistaken for a class. `styleq` is inlined rather than given its own module, so it is carved out by brace-matching from its `styleq=void 0` preamble. Component code is excluded, as is the `page.module.css` map, which is identical CSS Modules output in all three projects.
- **Lighthouse**: `next start` (production), 1,000 components displayed.

### Environment

|           |                                      |
| :-------- | :----------------------------------- |
| Framework | Next.js 16.2.10 (Turbopack)          |
| React     | 19.2.4                               |
| Libraries | StyleX 0.19.0 · Plumeria 17.0.0      |
| Runtime   | Node v25.8.2 · pnpm 11.3.0           |
| Machine   | macOS Tahoe, Apple M1 (8-core), 16GB |
