# Releasing

CI is `.github/workflows/build.yml`.

| Event | What runs |
| --- | --- |
| Pull request / push to `main` | `test` (npm test), then `package` on Windows, Linux, macOS: build installers, smoke-test the packaged app, upload artifacts |
| Push of a tag `vX.Y.Z` | the same, then `release`: publishes a GitHub Release with all installers and `SHA256SUMS.txt` |
| Manual (`workflow_dispatch`) | `test` + `package` (no release) |

## Cut a release

```sh
npm version 1.2.3 --no-git-tag-version   # bumps package.json (+ lockfile); installer names use this version
git commit -am "Release v1.2.3"
git tag v1.2.3
git push origin main v1.2.3
```

The tag must match `v*`; the version in the installer file names comes from `package.json`, so bump it first.
Watch the **Actions** tab. The Release (notes auto-generated from merged PRs/commits) appears when all three
platform jobs pass. To rebuild without a release, run the workflow manually from the Actions tab.

Every platform job runs `<packaged app> --smoke-test`, which boots the server from the *packaged* build and checks
`/api/auth/me`, `/overlay`, `/admin`, `/admin/js/main.js` and a PIN login. A failing smoke test blocks the release.

## Local builds

```sh
npm run dist:mac     # or dist:win / dist:linux; output in dist/
npm run icon         # regenerate build/icon.png and tray icons (scripts/make-icon.js)
```

Cross-building is limited: build each OS on its own runner (that is what CI does).

## Signing and notarization (optional, not set up)

Releases are currently unsigned; users follow the "unsigned app" steps in `INSTALL.md`. When you have certificates,
add repository secrets and the env vars below to the `Build installers` step in `build.yml`.

**macOS (Developer ID + notarization)**

1. In `package.json` `build.mac`, remove `"identity": null`; add `"hardenedRuntime": true` and `"notarize": true`
   (and an entitlements plist if you need one).
2. Secrets: `CSC_LINK` (base64 .p12 of the Developer ID Application cert), `CSC_KEY_PASSWORD`,
   `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.
3. In `build.yml`, delete the job-level `CSC_IDENTITY_AUTO_DISCOVERY: 'false'` (or set it per-OS) so macOS signs.

**Windows (Authenticode)**

1. Secrets: `WIN_CSC_LINK` (base64 .pfx) and `WIN_CSC_KEY_PASSWORD`, exposed to the build step as
   `CSC_LINK` / `CSC_KEY_PASSWORD` on the Windows job only.
   (For Azure Trusted Signing or an HSM-held key, use electron-builder's `win.azureSignOptions` / custom signtool instead.)
2. Same `CSC_IDENTITY_AUTO_DISCOVERY` note as above.

Linux packages are not signed.

## Placeholders to replace

`package.json` uses `Chat Overlay <noreply@example.com>` as author/maintainer and `https://example.com/chat-overlay`
as homepage. Replace them with real values (the `.deb` maintainer field shows up in package managers).
