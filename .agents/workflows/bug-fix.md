# Bug Fix Workflow

## Process
When a bug is detected or reported, do not fix it blindly.

1. **Reproduce**: Confirm the bug exists.
2. **Collect evidence**: Gather logs and error messages.
3. **Identify root cause**: Find out why it happens, not just where it crashes.
4. **Determine affected components**: Find all dependencies.
5. **Implement minimal fix**: Avoid side-effects.
6. **Build**: Ensure the fix compiles.
7. **Test**: Verify the bug is fixed.
8. **Regression test**: Ensure other features are not broken.
9. **Document**: Record the fix in documentation and work session summary.

Never fix just the symptom if the root cause can be identified.
