# CSS-in-JS Benchmark: StyleX vs Plumeria

This repository benchmarks two next-generation CSS-in-JS libraries:
Meta's **StyleX** and **Plumeria**.

## Comparison Items

- **Build Speed**: Time to complete the execution of `next build` (Turbopack).

- **Bundled CSS Size**: Total size of all `.css` files generated after the build.

- **Rendering Speed**: Lighthouse results.

## Benchmark Conditions

For a fair comparison, both projects replicate the exact same component structure and rendering load.

### Component Breakdown

1. **Dynamic Variants Test (`Test.tsx`)**:

- Render 1,000 components in a loop.

- Dynamically applies styles by combining the following five variant categories:
- `color` (5 types)
- `size` (4 types)
- `padding` (5 types)
- `borderRadius` (5 types)
- `background` (5 types)
- While StyleX uses object references with bracket notation, Plumeria uses the `css.variants` API.

2. **Complex Styles Test (`StyleXComponent.tsx/PlumeriaComponent.tsx`)**:

- Nested media queries (`@media`).
- Pseudo-classes (`:last-child`).
- Conditional style application (bound by the `isRed` flag).

### Execution Environment

- **Framework**: Next.js 16.2.6 (Turbopack mode)
- **React**: 19.2.4
- **Libraries**: StyleX 0.18.3 / Plumeria 13.1.0
- **Node.js**: v25.8.2
- **pnpm**: v11.3.0
- **OS**: macOS Tahoe
- **CPU**: Apple M1 Chip (8-core CPU, 8-core GPU)
- **RAM**: 16GB

## Measurement Results (Average of 9 measurements, excluding 1st iteration)

| Library      | Avg Build (s) | Min (s) | Max (s) | CSS Size (KB) | Lighthouse (Perf) |
| :----------- | :-----------: | :-----: | :-----: | :-----------: | :---------------: |
| **StyleX**   |    4.164s     |  4.11s  |  4.23s  |    8.08KB     |      100/100      |
| **Plumeria** |    3.956s     |  3.90s  |  4.04s  |    7.64KB     |      100/100      |

> [!NOTE]
>
> - Build Value: Average of 9 Cold Builds (the first iteration is excluded to omit V8/compiler cold start overhead).
> - Lighthouse: Measurements taken in a `next start` (Production) environment with 1,000 components displayed.

## Conclusion

This benchmark confirms that Plumeria can achieve **reduced build time (approximately 5.0% reduction) and reduced bundle size (approximately 5.4% reduction)** while maintaining the same high level of execution performance as StyleX.

## How to Run

Execute the following commands in the root directory of the repository:

```bash
npm install
npm run benchmark
```

To run individually in each project directory:

```bash
cd stylex-next && npm run build
cd plumeria-next && npm run build
```
