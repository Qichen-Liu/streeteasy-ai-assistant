# E2E Checklist (MVP)

Use this checklist before merging `codex/dev` into `main` for a release cut.

## Environment
- Chrome latest stable installed
- Extension built from latest branch:
  - `npm install`
  - `npm run build`
- Extension loaded from `dist/` in `chrome://extensions`
- OpenAI API key set in extension options (BYOK)

## 1. Baseline Extension Load
- Load unpacked extension from `dist/` with no install errors.
- Open popup and confirm no runtime crash.
- Open options page and confirm settings form renders.

Expected:
- No red errors in extension card.
- Popup shows graceful empty state if no data exists.

## 2. Listing Detection and View Tracking
- Visit at least 3 StreetEasy listing pages (mix of routes if possible).
- Confirm injected card appears on listing page.
- Navigate between listings without full reload (SPA navigation if supported by site).

Expected:
- Listing card updates to the new listing.
- Same listing is not repeatedly re-added as unique entries.
- Popup shows new listings ordered by recent view.

## 3. Contacted State
- For one listing, click `Mark Contacted`.
- Refresh page and verify chip/button state persists.
- Click `Unmark Contacted` and verify update in popup.

Expected:
- Contact state persists across refresh/reopen.
- Popup filters correctly show/hide contacted item.

## 4. AI Evaluation (Success Path)
- On a listing, click `AI Evaluate`.
- Wait for response and inspect rendered details.

Expected:
- Button shows busy/disabled state while running.
- Card displays score summary, confidence, summary text, and timestamp.
- Popup shows AI evaluation badge and scores.

## 5. AI Evaluation (Failure Paths)
- Clear API key and run evaluate.
- Use an invalid key and run evaluate.
- Trigger repeated runs quickly (to hit 429 if possible).

Expected:
- Missing/invalid key errors are user-readable.
- Rate-limit errors are user-readable.
- Extension remains responsive after error.

## 6. Settings and Persistence
- Save model/mode/priorities in options.
- Close and reopen Chrome.
- Reopen options and popup.

Expected:
- Settings persist in `chrome.storage.local`.
- API key is masked in UI behavior (not displayed as plaintext).

## 7. Popup Dashboard
- Validate filters: `All`, `Contacted`, `Viewed only`, `Evaluated`.
- Validate sorts: `Last viewed`, `Price low-high`, `Price high-low`, `Best AI score`.

Expected:
- Filter results are correct.
- Sorting order is correct and stable.

## 8. Regression/Performance Smoke
- Rapidly open/close several listing tabs.
- Ensure page remains interactive and extension card does not duplicate.

Expected:
- No duplicate injected cards.
- No obvious lag spikes from extension actions.

## 9. Final Release Gate
- `npm run typecheck`
- `npm run test`
- `npm run build`

Release only if all pass.
