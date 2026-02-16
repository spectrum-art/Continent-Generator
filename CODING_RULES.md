Project Rules for Codex:

1. Update docs/spec.md before implementing new features.
2. Write a short plan in docs/plan.md before coding.
3. Keep generator logic in src/gen as pure functions.
4. Renderer must not contain generation logic.
5. Every milestone must:
   - pass `npm test`
   - pass `npm run build`
   - end with a git commit
6. Avoid new dependencies unless clearly justified.
7. Do not add platform-specific packages to package.json. If a build tool fails to install, fix by reinstalling node_modules / lockfile, not by pinning platform binaries.
8. Do not refactor unrelated code; limit changes strictly to the goal(s) at hand unless instructed otherwise.