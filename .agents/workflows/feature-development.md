# Feature Development Workflow

## Process
When requested to add a new feature:

1. **Inspect existing implementation**: Look for similar code or base classes.
2. **Identify affected modules**: Know what will be touched.
3. **Check architecture**: Ensure the feature aligns with the current architecture.
4. **Check existing interfaces**: Reuse existing protocols/APIs.
5. **Determine smallest implementation**: Plan the minimal viable addition.
6. **Implement**: Write the code.
7. **Test**: Verify functionality.
8. **Check regression**: Run existing tests and manual checks.
9. **Update documentation**: Keep docs in sync with code.

## Constraint
Never rewrite the architecture to fit a new feature unless there is a clear, documented technical reason to do so.
