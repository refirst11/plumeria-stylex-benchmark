# CSS-in-JS Benchmark: StyleX vs Plumeria

Authored by the maintainer of Plumeria.

Benchmarks Meta's **StyleX** against **Plumeria** on an identical Next.js app, with a third **CSS Modules** project as a no-library control.

All three render the same DOM: 1,000 components combining five variant axes (`color`, `size`, `padding`, `borderRadius`, `background`), plus a component exercising nested media queries, `:last-child`, and conditional styles.

|                         |  Build | Library Cost |        CSS |  SSR Chunk | Client JS¹ | Class names resolved       |
| :---------------------- | -----: | -----------: | ---------: | ---------: | ---------: | :------------------------- |
| _CSS Modules (control)_ | 3.483s |            — |     8.26KB |     3.91KB |     2.07KB | never merged               |
| **Plumeria**            | 3.982s |  **498.4ms** | **7.79KB** | **2.60KB** | **0.84KB** | **at build**               |
| **StyleX**              | 4.179s |      696.3ms |     8.08KB |     4.44KB |     2.67KB | at client render, `styleq` |

### Key findings

- **Build cost** — Plumeria is 28% cheaper to adopt: 498.4ms against StyleX's 696.3ms.
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

The `.next` total and the prerendered output both come out marginally smaller for StyleX, and both numbers are misleading without decomposition — neither is served code, and neither reflects anything architectural.

**`.next` totals sit within ~15KB of each other (StyleX 7.19MB vs Plumeria 7.21MB), and that gap is not served code.** It is dominated by the one artifact decomposed next — Plumeria's prerendered output is ~26KB larger purely because its hash names are longer — which slightly outweighs Plumeria's 13.9KB _smaller_ source maps. Build bookkeeping (`.nft.json`, `.tsbuildinfo`) is a wash, within 4KB. Both library projects also carry ~0.89MB of `.next/build/chunks`, where Turbopack bundles the PostCSS config and plugins; the control has no such directory.

**Plumeria's prerendered output is 25.8KB larger, but none of that is architectural.** Its hash names average 8.0 characters against StyleX's 7.6, and each name is emitted roughly eight times over — the rendered DOM plus the inlined RSC payload in `index.html`, then again in `index.rsc` and the two `.segment.rsc` files. The arithmetic closes exactly:

```
0.4 chars × 8,036 occurrences × 8 appearances = 25.7KB
```

Whitespace and separator overhead are identical (6.86KB each); neither emits stray padding. **At equal name length the two would produce the same prerendered bytes**, and Plumeria would keep both its smaller chunk and its lack of a runtime.

|               | Prerender artifacts | of which class names |
| :------------ | ------------------: | -------------------: |
| _CSS Modules_ |           1432.38KB |             847.93KB |
| **Plumeria**  |            906.30KB |             314.83KB |
| **StyleX**    |            882.05KB |             298.59KB |

Both libraries are far ahead of CSS Modules regardless — its 29.8-character names alone cost 848KB.

### Why the CSS column tips to Plumeria

The stylesheet sizes (7.79 vs 8.08KB) invert what name length predicts. Plumeria's names are _longer_ (8.0 vs 7.6 characters) and it emits _more_ atoms (37 vs 34) — both should make its CSS larger. They don't, because **inside a stylesheet each atomic name appears exactly once**, in its own selector, so the 0.4-character difference is worth ~15 bytes across 37 rules. (This is the mirror of the prerender table above, where each name repeats thousands of times and the same 0.4 characters cost 26KB.) Name length is simply not what the CSS column measures.

What it measures is **how many `:not(#\#)` specificity hacks each compiler stacks onto its selectors.** `:not(#\#)` matches every element — nothing has an id of literally `#` — so it changes no matching; it exists only to add one id's worth of specificity. Atomic CSS needs the tool: with one declaration per class, the cascade can no longer be steered by writing rules in a deliberate order, so specificity decides which atom wins when two touch the same property.

The two spend it very differently:

|              | `:not(#\#)` hacks | plain atoms | bumped atoms                   | extra                                                                                     |
| :----------- | ----------------: | ----------: | :----------------------------- | :---------------------------------------------------------------------------------------- |
| **Plumeria** |     16 (**144B**) |     23 / 37 | 14 (2 doubled)                 | —                                                                                         |
| **StyleX**   |     51 (**459B**) |      5 / 34 | 29 (**19 doubled, 3 tripled**) | reset wrapped in `@layer` _and_ emitted twice; class doubled in the media rule (`.x….x…`) |

Plumeria's count is not a heuristic. The level is just how many of two conditions hold — the declaration is a **longhand**, and it sits **inside a query**:

|               | base | in query |
| :------------ | ---: | -------: |
| **shorthand** |    0 |        1 |
| **longhand**  |    1 |        2 |

That reproduces the stylesheet exactly. The 23 bare atoms are all shorthands or standalone properties (`padding`, `color`, `border-color` / `-style` / `-width`, `border-radius`, `display`, `transition`, `gap`); the 12 single-hack atoms are all longhands (`font-size`, `font-weight`, `background-color`, `margin-bottom`, `flex-wrap`); and the only two double-hack rules are longhands in a nested context — `margin-bottom` under `:last-child`, and `margin-bottom` inside the media query. `0×23 + 1×12 + 2×2 = 16`, the measured total.

What the rule restores is the cascade relationship atomisation destroys. Split into one class per declaration, a longhand no longer outranks the shorthand it belongs to — `padding-top` and `padding` become two unrelated classes of equal weight — so the longhand is given exactly one level to win that back, and one more to clear the same property declared outside a query. Nothing is spent anywhere else.

StyleX instead gives almost every atom a uniform specificity floor of one or two hacks and pushes the override-heavy rules to three, so any atom can win over any earlier one in any insertion order — the guarantee `styleq` leans on when it merges arbitrary style objects at render. That is a sound choice for a runtime merger, but on paper **the 35 extra hacks cost 315 bytes — more than the entire 302-byte gap between the two stylesheets.** Names, atom count, and formatting roughly cancel around it.

Part of Plumeria's economy is positional rather than selectorial. Its `optimizer()` runs `postcss-combine-media-query`, which does not merely deduplicate `@media` blocks — it `remove()`s every one from its original position and `root.append()`s the merged blocks to the **end** of the stylesheet. That guarantee is what lets the two-level scale stay this short: a shorthand inside a query and a longhand outside one both land on level 1, and the tie is broken not by adding a third level but by the query block being, without exception, further down the file. StyleX buys no such guarantee: the same media rule is emitted as `.x….x…:not(#\#):not(#\#):not(#\#)` — the class doubled _and_ three hacks — precedence encoded entirely in the selector, holding wherever the rule lands and in whatever order code-split chunks insert their stylesheets.

That is the real trade. Plumeria spends bytes only where a build-time merge cannot already decide the winner, and leans on a pipeline that controls placement; StyleX spends them everywhere so that placement never matters. So the CSS column is not measuring compression or name length; it is measuring two cascade strategies, and the ~4% gap is the price of StyleX's position-independence — still, at two components, well inside the noise the next note describes.

> [!WARNING]
> **This benchmark does not measure what atomic CSS is actually for.** StyleX was built at Meta to stop the stylesheet growing linearly with the codebase — facebook.com went from tens of megabytes of lazy-loaded CSS to a couple of hundred kilobytes, roughly an 80% cut, because atomic declarations deduplicate and the bundle _plateaus_ as components are added.
>
> This app has two styled components. At that scale the plateau has nothing to plateau from, which is why all three stylesheets land within 6% of each other (7.79 / 8.08 / 8.26KB) and the control is barely behind. Judging either library's stylesheet strategy from these numbers would be a mistake; the CSS column here is close to noise. What this benchmark does measure honestly is build cost and what each library ships as code.

---

## Build Cost

`baseline-next` is the control: the same DOM and the same 1,000 components, styled with plain CSS Modules and no CSS-in-JS library. Subtracting its build time isolates what each library costs.

```
Library Cost = (project build time) − (baseline-next build time)
```

| Library      | Avg Build (s) |    Min |    Max | SD (ms) | Library Cost |
| :----------- | ------------: | -----: | -----: | ------: | -----------: |
| _baseline_   |        3.483s | 3.421s | 3.567s |    54.4 |            — |
| **Plumeria** |        3.982s | 3.908s | 4.054s |    49.2 |  **498.4ms** |
| **StyleX**   |        4.179s | 4.130s | 4.255s |    34.3 |      696.3ms |

This measures everything adopting the library entails, not just time inside its compiler: loading the plugin packages, running a PostCSS pipeline the control never runs, and — for StyleX — a `babel.config.js` that moves the application source off Next.js's native SWC pipeline onto Babel. Most of that is fixed cost rather than work proportional to the styles compiled; neither library is spending 500ms on two component files, and the bulk is toolchain each one brings with it.

> [!NOTE]
> Library Cost varies by roughly ±100ms between full runs, being a difference of two wall-clock averages. The ordering and the ~198ms gap have been stable across runs.

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
| Libraries | StyleX 0.19.0 · Plumeria 16.5.0      |
| Runtime   | Node v25.8.2 · pnpm 11.3.0           |
| Machine   | macOS Tahoe, Apple M1 (8-core), 16GB |
