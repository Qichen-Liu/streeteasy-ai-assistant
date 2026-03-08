# StreetEasy Chrome Extension Plan

## Objective
Build a Chrome extension (Manifest V3) that helps track apartment-hunting activity on StreetEasy and provides an AI evaluation button per listing.

Core outcomes:
- Track which listings were viewed.
- Track which listings were contacted.
- On each listing page, provide an `AI Evaluate` action that scores price, quality, and move-in risks.

## MVP Product Scope
### Tracking states
- Viewed (auto-mark when listing page opens)
- Contacted (manual toggle in injected UI)
- Optional in MVP if low effort: notes

### AI evaluation output (MVP)
- `priceScore` (0-100): how reasonable the listing price appears
- `qualityScore` (0-100): inferred condition/livability score from listing signals
- `riskFlags[]`: concrete risks to investigate before moving in
- `summary`: concise recommendation
- `confidence`: model confidence level

### AI provider model
- **BYOK (Bring Your Own Key)** for MVP
- User enters OpenAI API key in extension settings
- Extension sends evaluation requests directly to OpenAI
- We do **not** manage user billing/tokens in MVP

## Architecture (MVP)
### Components
- `manifest.json` (MV3)
- `content script`
  - Detect listing pages
  - Extract listing metadata
  - Inject status UI + `AI Evaluate` button
- `service worker` (background)
  - Message routing
  - Storage updates
  - AI request orchestration
- `popup`
  - Recently viewed/contacted summary
- `options page`
  - OpenAI key, model selection, evaluation preferences

### Storage
Use `chrome.storage.local` with versioned schema.

Entities:
- `listingsById`
  - `listingId`, `url`, `address`, `price`, `beds`, `baths`, `sqft`, `building`, `lastSeenAt`
- `activityById`
  - `viewedAt[]`, `contactedAt[]`, `status`, `notes`
- `evaluationsBySnapshotKey`
  - `snapshotHash`, `priceScore`, `qualityScore`, `riskFlags[]`, `summary`, `confidence`, `evaluatedAt`
- `settings`
  - `openaiApiKey`, `model`, `riskPriorities`, `reportMode`

## AI Evaluation Flow
1. User clicks `AI Evaluate` on listing page.
2. Content script gathers visible listing fields + user notes.
3. Service worker builds strict prompt and requests JSON-only response.
4. Validate response against schema.
5. Persist result and render in listing panel.
6. Cache by listing snapshot hash to avoid duplicate calls.

## Prompt/Output Contract (MVP)
Require strict JSON object:
- `priceScore` number 0-100
- `qualityScore` number 0-100
- `riskFlags` array of short actionable strings
- `summary` string (<= 120 words)
- `confidence` one of `low | medium | high`
- `evidence` object with short rationale per score

## UX
### Listing page injected card
- Viewed/Contacted chips
- Contacted toggle
- `AI Evaluate` button
- Last evaluation timestamp + key scores + top 3 risk flags

### Popup
- Recent viewed list
- Contacted list
- Quick jump back to listing URLs

### Options
- API key field (masked)
- Model dropdown
- Priority toggles (commute/noise/light/fees/safety/etc.)
- Clear key button

## Security/Privacy Baseline
- Never log or display full API key
- Provide key remove/reset action
- Warn users that local extension storage is not equivalent to hardware-backed secure storage
- Keep all listing/user data local in MVP

## Reliability
- DOM selector fallback strategy (StreetEasy layout changes)
- Graceful handling for missing fields
- AI error handling for `401`, `429`, timeout, invalid JSON
- Retry with backoff and clear user messages

## Milestones
1. Foundation
   - MV3 scaffold, message passing, storage layer
2. Tracking
   - Auto-view detection + contacted toggle + persistence
3. Listing UI
   - Injected card and basic styling
4. AI integration (BYOK)
   - Options key setup + evaluation request + schema validation + cache
5. Dashboard
   - Popup lists + filters/sorting (basic)
6. Hardening
   - Error states, selector fallback, basic tests, packaging

## MVP Acceptance Criteria
- Opening a StreetEasy listing marks it viewed (deduped within session + persisted).
- User can mark/unmark contacted from listing page.
- AI evaluation returns structured result in typical conditions within ~10 seconds.
- Results persist across browser restarts.
- Extension does not break normal StreetEasy page interactions.

## Post-MVP (Planned)
- Backend proxy mode (no BYOK required)
- Account sync across browsers
- Better comparable-rent enrichment
- Batch evaluate shortlist
- Export report (CSV/Markdown)
