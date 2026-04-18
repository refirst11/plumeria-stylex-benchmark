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

- **Framework**: Next.js 16.2.2 (Turbopack mode)
- **React**: 19.2.4
- **Libraries**: StyleX 0.17.5 / Plumeria 9.0.4
- **Node.js**: v25.3.0
- **pnpm**: v10.15.0
- **OS**: macOS Tahoe
- **CPU**: Apple M1 Chip (8-core CPU, 8-core GPU)
- **RAM**: 16GB

## Measurement Results (Average of 10 measurements)

| Library      | Avg Build (s) | Min (s) | Max (s) | CSS Size (KB) | Lighthouse (Perf) |
| :----------- | :-----------: | :-----: | :-----: | :-----------: | :---------------: |
| **StyleX**   |    4.317s     | 4.185s  | 4.379s  |    6.82KB     |      100/100      |
| **Plumeria** |    3.921s     | 3.865s  | 3.987s  |    6.40KB     |      100/100      |

> [!NOTE]
>
> - Build Value: Average of 10 Cold Builds (builds from a state where `.next` has been removed).
> - Lighthouse: Measurements taken in a `next start` (Production) environment with 1,000 components displayed.

## Conclusion

This benchmark confirms that Plumeria can achieve **reduced build time (approximately 9.2% reduction) and reduced bundle size (approximately 6.2% reduction)** while maintaining the same high level of execution performance as StyleX.

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
