# Home Assistant Grainfather Integration

This repository contains a starter Home Assistant custom integration for Grainfather based on the Grainfather web API.

## Current scope

- Home Assistant custom component scaffold
- Config flow using email and password credentials
- Async API client wrapper for the `community.grainfather.com` API
- Coordinator-driven sensor entities for account, active brew session, fermentation devices, and equipment profiles
- Fermentation device temperature and gravity readings exposed as dedicated device sensors
- Home Assistant services for changing brew session status and fermentation steps
- Button entities for one-click status transitions (brewing, fermenting, conditioning, completed)
- Basic tests for payload parsing

## Project layout

- `custom_components/grainfather/` contains the integration source
- `tests/` contains starter tests
- `pyproject.toml` contains local development tooling configuration

## Notes

The integration is currently aligned to the API shape captured in the included Postman collection: login via `/api/auth/login`, brew-session polling via `/api/2/brew-sessions`, fermentation device inventory via `/api/equipment/fermentation-devices`, and equipment catalog data via `/api/system-equipment-profiles`.

Services exposed by the integration:

1. `grainfather.set_brew_session_status` with mapped `status` (name or code) and optional `entry_id`, `brew_session_id`, `recipe_id`
2. `grainfather.set_fermentation_steps` with `fermentation_steps` and optional `entry_id`, `brew_session_id`, `recipe_id`

## Next development steps

1. Confirm the current Grainfather authentication and data endpoints.
2. Add fixture-based tests from captured API responses.
3. Package and validate against a local Home Assistant development instance.
4. Add richer Home Assistant controls once Grainfather status codes are fully documented.
