---
name: create-version
description: Validate and package the Yet Another Site Blocker Chrome extension in this repository. Use when the user wants to prepare a new extension version for this repo, run bug/error checks before packaging, bump the local `manifest.json` version, delete the existing `websiteBlocker.zip`, and rebuild a fresh zip from the release files. Trigger this skill for explicit requests like `/create-version`, "create a new version", "prepare the release zip", or "bump manifest and package the extension" in this workspace.
---

# Create Version

Validate the extension before mutating anything. Only bump the version and rebuild the zip after syntax checks and tests pass.

## Workflow

1. Confirm the workspace root contains `manifest.json`.
2. Run the bundled script in dry-run mode first:

```powershell
powershell -ExecutionPolicy Bypass -File .agents\skills\create-version\scripts\create-version.ps1 -Workspace <workspace> -DryRun
```

3. If the dry run passes, run the real release step:

```powershell
powershell -ExecutionPolicy Bypass -File .agents\skills\create-version\scripts\create-version.ps1 -Workspace <workspace>
```

4. Report:
   - the previous and new manifest version
   - whether syntax checks and tests passed
   - the path of the rebuilt zip

## What The Script Does

- Run `node --check` for every file in `js/`
- Run every `tests/*.test.js` file with `node`
- Increment the last numeric part in `manifest.json`
- Delete any existing `websiteBlocker.zip`
- Rebuild `websiteBlocker.zip` from `css`, `html`, `icons`, `js`, and `manifest.json`

## Constraints

- Treat failed checks as a hard stop. Do not bump the version or create a new zip if validation fails.
- Accept Chrome extension versions with 1 to 4 numeric parts such as `2`, `2.1`, `2.1.4`, or `2.1.4.9`. Increment the last numeric part.
- Keep packaging limited to `css`, `html`, `icons`, `js`, and `manifest.json` unless the user explicitly requests a different release set.
- Do not invoke this skill implicitly. Use it only when the user explicitly asks for version/release packaging.

## Resource

### scripts/create-version.ps1

Use the PowerShell script for deterministic release creation instead of rewriting the workflow manually.
