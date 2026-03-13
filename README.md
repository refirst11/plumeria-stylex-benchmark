# CSS-in-JS Benchmark: Plumeria vs StyleX

This repository benchmarks two next-generation CSS-in-JS libraries:
**Plumeria** and Meta's **StyleX**.

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
- Plumeria uses the `css.variants` API, while StyleX uses object references with bracket notation.

2. **Complex Styles Test (`PlumeriaComponent.tsx/StyleXComponent.tsx`)**:

- Nested media queries (`@media`).
- Pseudo-classes (`:last-child`).
- Conditional style application (bound by the `isRed` flag).

### Execution Environment

- **Framework**: Next.js 16.1.6 (Turbopack mode)
- **React**: 19.2.4
- **Libraries**: Plumeria 9.0.0 / StyleX 0.17.5
- **Node.js**: v25.3.0
- **pnpm**: v10.15.0
- **OS**: macOS Tahoe
- **CPU**: Apple M1 Chip (8-core CPU, 8-core GPU)
- **RAM**: 16GB

## Measurement Results (Average of 10 measurements)

| Library      | Avg Build (s) | Min (s) | Max (s) | CSS Size (KB) | Lighthouse (Perf) |
| :----------- | :-----------: | :-----: | :-----: | :-----------: | :---------------: |
| **Plumeria** |    4.244s     | 4.137s  | 4.888s  |    6.36KB     |      100/100      |
| **StyleX**   |    4.621s     | 4.473s  | 5.209s  |    6.78KB     |      100/100      |

> [!NOTE]
>
> - Build Value: Average of 10 Cold Builds (builds from a state where `.next` has been removed).
> - Lighthouse: Measurements taken in a `next start` (Production) environment with 1,000 components displayed.

## Conclusion

This benchmark confirms that Plumeria can achieve **reduced build time (approximately 8.1% reduction) and reduced bundle size (approximately 6.2% reduction)** while maintaining the same high level of execution performance as StyleX.

## How to Run

Execute the following commands in the root directory of the repository:

```bash
npm install
npm run benchmark
```

To run individually in each project directory:

```bash
cd plumeria-next && npm run build
cd stylex-next && npm run build
```
