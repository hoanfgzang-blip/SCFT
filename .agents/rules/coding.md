# Coding Guidelines

## Code Quality
- **Simplicity**: Code should be simple, readable, maintainable, and testable.
- **No Premature Abstraction**: Avoid creating `FactoryFactory`, `ManagerManager`, or `ServiceService` without a practical reason.
- **Incremental Fixes**: If bad code is encountered, categorize it (Cosmetic, Minor, Moderate, Critical). Only fix immediately if it affects correctness, security, reliability, or severe maintainability. Otherwise, document it in `docs/technical-debt.md`.

## Memory & Performance
- Only optimize when there is a measured bottleneck or clearly identified architectural problem.
- When optimizing, document the `Before`, `Problem`, `Change`, and `After` states.
