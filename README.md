# Home Assistant Grainfather Integration

Custom Home Assistant integration for Grainfather cloud data, including brew sessions, fermentation devices, recipe images, and session controls.

## Features

- Config flow with Grainfather email and password
- Brew session entities with batch, gravity, style, recipe image, and batch variant data
- Brew session attributes including `condition_date`, `fermentation_start_date`, and `created_at`
- Fermentation device temperature and gravity sensors
- History data exposed on brew session attributes
- Service actions for changing brew session status and fermentation steps
- Button and select helpers for common brew session actions
- Local integration branding assets for Home Assistant `2026.3+`

## Installation

### HACS

1. Open HACS.
2. Add this repository as a custom repository of type `Integration` if it is not already listed.
3. Install `Grainfather`.
4. Restart Home Assistant.
5. Go to Settings > Devices & Services > Add Integration.
6. Search for `Grainfather` and enter your Grainfather credentials.

### Manual

1. Copy [custom_components/grainfather](custom_components/grainfather) into your Home Assistant `custom_components` directory.
2. Restart Home Assistant.
3. Add the `Grainfather` integration from Settings > Devices & Services.

## Exposed Data

The integration currently polls the Grainfather cloud API and exposes:

- Brew sessions
- Fermentation devices
- Fermentation history linked to devices and sessions
- Recipe images

The implementation is based on the API shape captured in the included Postman collection, including:

- `/api/auth/login`
- `/api/2/brew-sessions`
- `/api/equipment/fermentation-devices`

## Service Actions

The integration registers these service actions:

1. `grainfather.set_brew_session_status`
2. `grainfather.set_fermentation_steps`
3. `grainfather.set_fermentation_step_duration`

`grainfather.set_brew_session_status` accepts a `status` as either a numeric code or one of:

- `planning`
- `brewing`
- `fermenting`
- `conditioning`
- `serving`
- `completed`

## Branding

This repository includes local branding assets in [custom_components/grainfather/brand](custom_components/grainfather/brand).

- `icon.png` is used for compact integration surfaces
- `logo.png` is used where Home Assistant shows a wider brand image

Home Assistant only uses local custom integration branding from `brand/` starting with version `2026.3`.

## Development

- [custom_components/grainfather](custom_components/grainfather) contains the integration source
- [tests](tests) contains API parsing tests
- [pyproject.toml](pyproject.toml) contains local tooling configuration
- [Grainfather.postman_collection.json](Grainfather.postman_collection.json) contains the captured API collection used as a reference

## Lovelace Cards

The repository includes several custom JavaScript cards in [custom_components/grainfather/www](custom_components/grainfather/www).

### Brew Collection Card

`grainfather-brew-collection-card.js` displays multiple brew sessions in a responsive grid with advanced filtering and deduplication.

**Features:**

- Display multiple brew sessions at once (showcase or v2 layout)
- Filter by status (fermenting, conditioning, serving, brewing, planning, completed)
- Optional deduplication: show only one card per unique batch_number + session name pair
- Optional grouping by status in separate sections
- Responsive auto-fill grid (1-3 columns depending on screen size)

**Example configuration:**

```yaml
resources:
  - url: /grainfather/grainfather-brew-collection-card.js
    type: module

cards:
  - type: custom:grainfather-brew-collection-card
    title: Active Brews
    entities:
      - sensor.grainfather_batch_01_batch_number
      - sensor.grainfather_batch_02_batch_number
      - sensor.grainfather_batch_03_batch_number
    card_type: showcase
    statuses: [fermenting, conditioning, serving]
    deduplicate: false
    group_by_status: true
```

**Configuration Options:**

- `title` (string): Display name for the collection
- `entities` (list): Grainfather batch_number sensors to display
- `card_type` (string): Card layout — `showcase` or `brew-session-v2`
- `statuses` (list): Filter by these statuses (default: all available)
- `deduplicate` (boolean): Show only one card per batch_number + name pair
- `group_by_status` (boolean): Group sessions by status in separate sections

### Brew Session Cards (Showcase & V2)

Display individual brew session details. Both support `density_unit: sg|plato|brix` configuration.

### On Tap Blackboard Card

`grainfather-on-tap-card.js` renders a pub-style blackboard list of beers currently in status `serving`.

- Shows only: batch number, style, ABV, original gravity
- Filters sessions to `status = serving`
- If a batch appears in multiple variants, only the first variant is shown
- Supports `density_unit: sg|plato|brix` on all included brew session cards and the On Tap card

Example resource and card configuration:

```yaml
resources:
  - url: /grainfather/grainfather-on-tap-card.js
    type: module

cards:
  - type: custom:grainfather-on-tap-card
    max_items: 12
    density_unit: sg
```

## Current Limitations

- The Grainfather cloud API is not officially documented here, so some payload assumptions are based on observed responses.
- Test coverage is focused on payload parsing and client behavior, not full Home Assistant integration runtime behavior.
- The integration currently uses polling rather than push updates.

## Roadmap

1. Add fixture-based tests from captured real API responses.
2. Validate the integration against a live Home Assistant development instance.
3. Expand entity coverage once more Grainfather API fields and workflows are confirmed.
