# Performance Investigation Workflow

## Process
Do not arbitrarily optimize code.

1. **Measure**: Gather baseline metrics (FPS, memory, CPU, latency).
2. **Profile**: Identify the actual bottleneck.
3. **Identify architectural problem**: Understand why the bottleneck exists.
4. **Optimize**: Make the targeted change.
5. **Measure again**: Verify the optimization works.

## Documentation
Record the `Before`, `Problem`, `Change`, and `After` states.
