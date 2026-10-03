# Antigravity Workspace Guidelines: LiteStep VJ

## Commit & Versioning Rules
- **Automatic Version Increment**: Whenever preparing and pushing a new commit to git (`litestep-vj`):
  1. Increment the version number by 1 in `vj-visualizer/index.html`:
     - In `<title>LiteStep VJ vers. XXXX</title>`
     - In `<h1>LiteStep VJ <span class="app-version">vers. XXXX</span></h1>`
  2. Synchronize all modified files to `/Users/joshcohn/Developer/litestep-vj/` (including `index.html` with the incremented version).
  3. Include the updated version number in the commit message (e.g., `git commit -m "vers. 4025: ..."`) and mention the new version in the user summary.

## Workspace Synchronization Rules
- The active development visualizer code resides in `vj-visualizer/`.
- The published standalone GitHub Pages repository is `/Users/joshcohn/Developer/litestep-vj/`.
- Always ensure both directories are synchronized, verified with `node -c`, and pushed to `origin main`.
