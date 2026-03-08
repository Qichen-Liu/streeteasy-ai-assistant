# StreetEasy AI Assistant

Chrome extension (Manifest V3) to track StreetEasy listings you've viewed/contacted and run AI evaluation checks per listing.

## Features (Scaffold)
- Auto-track viewed listings on StreetEasy listing pages
- Mark/unmark listings as contacted
- Inject an `AI Evaluate` button on listing pages
- Save BYOK OpenAI settings in extension options
- Show recently tracked listings in popup

## Project Structure
- `src/manifest.json`: extension config
- `src/content`: listing-page UI and interactions
- `src/background`: storage + message routing + AI calls
- `src/popup`: quick activity dashboard
- `src/options`: BYOK settings page
- `scripts/build.mjs`: build TypeScript bundles into `dist/`

## Local Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Build extension:
   ```bash
   npm run build
   ```
3. Load in Chrome:
   - Open `chrome://extensions`
   - Enable Developer Mode
   - Click `Load unpacked`
   - Select the `dist/` folder

## Development
- Build once: `npm run build`
- Watch mode: `npm run watch`
- Type checks: `npm run typecheck`

## BYOK Notes
- Add your OpenAI API key in extension options.
- The scaffold stores settings in `chrome.storage.local`.
- Never commit real keys to git.
