# Release Packaging Guide

This project currently distributes as an unpacked Chrome extension for development.

## 1. Prepare Build
Run from repository root:

```bash
npm install
npm run typecheck
npm run test
npm run build
```

## 2. Load Unpacked (Local QA)
1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select `dist/`

## 3. Create ZIP Artifact (for sharing)
Create a zip from built `dist` contents (not parent folder):

```bash
cd dist
zip -r ../streeteasy-ai-assistant-mvp.zip .
cd ..
```

Generated artifact:
- `streeteasy-ai-assistant-mvp.zip`

## 4. Pre-Release Verification
- Execute checklist in `docs/e2e-checklist.md`
- Confirm no secrets are present in committed files
- Confirm `.env` files are ignored and not in artifact

## 5. Git Tag (optional)
For internal milestone marking:

```bash
git tag -a v0.1.0-mvp -m "MVP milestone"
git push origin v0.1.0-mvp
```
