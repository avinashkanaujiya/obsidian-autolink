# VENT

Feedback log. Repeated/systemic workflow friction that should become future automation, docs, or workflow fixes.

## 26-05-16 10:09 — missing yarn

Project docs and package scripts assume yarn for build/test (`README.md` says `yarn`, initial verification failed because `yarn` is not installed in the environment). I had to retry with npm equivalents (`npm test`, `npm run build`). Prevent this by either documenting npm as a supported fallback, pinning/enabling the package manager via corepack, or adding a repo note/dev bootstrap step that installs or validates the expected package manager up front.
