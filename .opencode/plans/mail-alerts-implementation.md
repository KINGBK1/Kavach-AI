# Mail Alerts for Citizen Reports

## Goal
Send email alerts when a user submits a citizen report **and** the AI/Gemini analysis verifies it. Don't send emails when lat/lng is missing (already works).

## Files to modify

### 1. `backend/src/state.rs`
Add `mail_service_url` field to `AppState` and constructor.

### 2. `backend/src/main.rs`
Read `MAIL_SERVICE_URL` env var (default `http://localhost:8001`), pass to `AppState::new()`.

### 3. `backend/src/routes/incidents.rs`
After `client.analyze_single()` succeeds:
- Generate UUID for `incident_id`
- Build AlertTrigger payload from report + AI analysis (severity, incident_type, summary, recommended_actions)
- `tokio::spawn` a POST to `{mail_service_url}/alerts` via `state.http_client` (10s timeout)
- Return analysis result to frontend immediately (email is best-effort)

### 4. `backend/.env`
Add line: `MAIL_SERVICE_URL=https://kavach-ai-six.vercel.app`

## No changes needed
- `mailservice/` — geolocation already returns `[]` when lat/lng is None; template already hides maps link
- `ml-services/` — scraping flow untouched
- `frontend/` — response format unchanged

## Breakage check
| Scenario | Result |
|----------|--------|
| Scraping flow | Unaffected — no ML/mail service changes |
| Manual report, AI succeeds | Emails sent to nearby users ✅ |
| Manual report, AI fails | Handler returns 500, no email attempted ✅ |
| Mail service down | Spawned POST fails silently (logged), frontend gets analysis ✅ |
| Missing lat/lng (scraped) | Already returns `[]`, no emails ✅ |
| CitizenReport.category = None | Fallback to `"citizen-report"` ✅ |
| MAIL_SERVICE_URL not set | Defaults to `http://localhost:8001` ✅ |
