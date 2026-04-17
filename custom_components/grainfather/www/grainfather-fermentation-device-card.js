import { LitElement, css, html, nothing } from 'https://unpkg.com/lit@3.3.0/index.js?module';

// ---------------------------------------------------------------------------
// Grainfather Fermentation Device Card
//
// Mimics the Grainfather controller display:
//   Active session  → Current Temp | Stage X/Y | Target Temp | Gravity
//   No session      → Current Temp | Gravity
//
// Config:
//   device   – required Grainfather fermentation device
//   temperature_entity – optional override sensor for current temperature
//   gravity_entity     – optional override sensor for gravity
//   density_unit – 'sg' | 'plato' | 'brix'  (default: 'sg')
// ---------------------------------------------------------------------------

const CARD_I18N = {
  en: {
    current_temp: 'CURRENT TEMP',
    target_temp: 'TARGET TEMP',
    gravity: 'GRAVITY',
    stage: 'STAGE',
    time_left: 'TIME LEFT',
    abv: '% Alc',
    total_time_left: 'Total time left',
    no_session: 'No active session',
    not_found: 'not found.',
    editor_pick_entity: 'Choose a Grainfather fermentation device.',
    unknown: '—',
  },
  pl: {
    current_temp: 'TEMP AKTUALNA',
    target_temp: 'TEMP DOCELOWA',
    gravity: 'GĘŚTOŚĆ',
    stage: 'ETAP',
    time_left: 'POZOSTAŁO',
    abv: '% Alk',
    total_time_left: 'Do końca',
    no_session: 'Brak aktywnej sesji',
    not_found: 'nie znaleziono.',
    editor_pick_entity: 'Wybierz urządzenie fermentacyjne Grainfather.',
    unknown: '—',
  },
};

function _t(lang, key) {
  const map = CARD_I18N[lang] || CARD_I18N.en;
  return map[key] ?? CARD_I18N.en[key] ?? key;
}

// ---------------------------------------------------------------------------
// Gravity conversion helpers
// ---------------------------------------------------------------------------
function _sgToPlato(sg) {
  return -616.868 + 1111.14 * sg - 630.272 * sg * sg + 135.997 * sg * sg * sg;
}
function _sgToBrix(sg) {
  return ((182.4601 * sg - 775.6821) * sg + 1262.7794) * sg - 669.5622;
}
function _brixToSg(brix) {
  // Standard approximation used in brewing calculators.
  return 1 + (brix / (258.6 - ((brix / 258.2) * 227.1)));
}
function _toSg(raw) {
  if (!_isValidNumber(raw)) return null;
  const v = Number(raw);
  // Values >2 are almost certainly Plato/Brix, not SG.
  if (v > 2) return _brixToSg(v);
  return v;
}
function _normUnit(u) {
  const n = String(u || 'sg').toLowerCase();
  return n === 'plato' || n === 'brix' ? n : 'sg';
}
function _fmtGravity(raw, unit) {
  if (raw == null || raw === '' || raw === 'unavailable' || raw === 'unknown') return '—';
  const sg = parseFloat(raw);
  if (!isFinite(sg)) return '—';
  const u = _normUnit(unit);
  if (u === 'plato') return `${_sgToPlato(sg).toFixed(1)} °P`;
  if (u === 'brix')  return `${_sgToBrix(sg).toFixed(1)} °Bx`;
  return sg.toFixed(4);
}
function _fmtTemp(raw) {
  if (raw == null || raw === 'unavailable' || raw === 'unknown') return '—';
  const v = parseFloat(raw);
  return isFinite(v) ? `${v.toFixed(1)} °C` : '—';
}

function _isValidNumber(raw) {
  if (raw == null || raw === '' || raw === 'unavailable' || raw === 'unknown') return false;
  return isFinite(Number(raw));
}

function _latestFromHistory(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return { temperature: null, specific_gravity: null };
  }

  let latestTemperature = null;
  let latestGravity = null;

  for (let i = points.length - 1; i >= 0; i--) {
    const point = points[i] || {};

    if (latestTemperature == null && _isValidNumber(point.temperature)) {
      latestTemperature = Number(point.temperature);
    }

    if (
      latestGravity == null
      && _isValidNumber(point.specific_gravity)
      && Number(point.specific_gravity) > 0.5
    ) {
      latestGravity = Number(point.specific_gravity);
    }

    if (latestTemperature != null && latestGravity != null) {
      break;
    }
  }

  return {
    temperature: latestTemperature,
    specific_gravity: latestGravity,
  };
}

// Get original gravity (first valid reading) and current gravity (latest valid reading)
function _getOriginalAndCurrentGravity(points, options = {}) {
  if (!Array.isArray(points) || points.length === 0) {
    return { og: null, fg: null };
  }

  const { sessionId = null, deviceId = null } = options;
  const filteredPoints = points.filter((point) => {
    const p = point || {};

    if (sessionId != null && p.brew_session_id != null && String(p.brew_session_id) !== String(sessionId)) {
      return false;
    }

    if (deviceId != null && p.device_id != null && String(p.device_id) !== String(deviceId)) {
      return false;
    }

    return true;
  });

  const sourcePoints = filteredPoints.length > 0 ? filteredPoints : points;

  let og = null;
  let fg = null;

  // OG: first valid gravity reading
  for (let i = 0; i < sourcePoints.length; i++) {
    const point = sourcePoints[i] || {};
    const sg = _toSg(point.specific_gravity);
    if (sg != null && sg > 0.5) {
      og = sg;
      break;
    }
  }

  // FG: latest valid gravity reading
  for (let i = sourcePoints.length - 1; i >= 0; i--) {
    const point = sourcePoints[i] || {};
    const sg = _toSg(point.specific_gravity);
    if (sg != null && sg > 0.5) {
      fg = sg;
      break;
    }
  }

  return { og, fg };
}

function _calcABV(og, fg) {
  if (og == null || fg == null || !isFinite(og) || !isFinite(fg)) return null;
  const abv = (og - fg) * 131.25;
  return Math.max(0, abv);
}

function _fmtABV(abv) {
  if (abv == null || !isFinite(abv)) return '—';
  return `${abv.toFixed(1)}%`;
}

// ---------------------------------------------------------------------------
// Current fermentation step derivation
// Mirrors the logic we will later add server-side; for now computed client-side
// so the card is self-contained.
// ---------------------------------------------------------------------------
function _computeCurrentStep(steps, fermentationStartDate) {
  if (!steps || steps.length === 0 || !fermentationStartDate) return null;

  const start = new Date(fermentationStartDate);
  if (isNaN(start.getTime())) return null;

  const elapsedMinutes = (Date.now() - start.getTime()) / 60000;
  let cursor = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const duration = step.duration_minutes ?? step.time ?? 0;
    cursor += duration;
    if (elapsedMinutes < cursor || i === steps.length - 1) {
      const stepStart = cursor - duration;
      const minutesElapsed = Math.max(0, elapsedMinutes - stepStart);
      const minutesRemaining = Math.max(0, cursor - elapsedMinutes);
      return {
        index: i,
        total: steps.length,
        name: step.name || `Step ${i + 1}`,
        temperature: step.temperature,
        duration_minutes: duration,
        minutes_elapsed: minutesElapsed,
        minutes_remaining: minutesRemaining,
        days_remaining: minutesRemaining / 1440,
      };
    }
  }
  return null;
}

function _fmtTimeLeft(minutes) {
  if (minutes == null || !isFinite(minutes)) return '—';
  const totalMinutes = Math.max(0, Math.round(minutes));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  return `${days}d ${hours}h`;
}

// ---------------------------------------------------------------------------
// SVG icons
// ---------------------------------------------------------------------------
const _iconThermometer = () => html`
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0z"/>
  </svg>`;

const _iconTarget = () => html`
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
  </svg>`;

const _iconDrop = () => html`
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
    <path d="M12 2.7c-.2.24-5.82 6.95-5.82 10.86A5.82 5.82 0 0 0 12 19.38
             a5.82 5.82 0 0 0 5.82-5.82C17.82 9.65 12.2 2.94 12 2.7z"/>
  </svg>`;

const _iconStages = () => html`
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
  </svg>`;

const _iconClock = () => html`
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
       stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>`;

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------
class GrainfatherFermentationDeviceCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
    _tick: { state: true },
  };

  static styles = css`
    :host { display: block; }

    ha-card {
      overflow: hidden;
      border-radius: 14px;
      background: #3a3f4a;
      box-shadow: 0 2px 10px rgba(0,0,0,.45);
      color: #e8ebef;
      font-family: inherit;
    }

    /* ---- header ---- */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 14px 6px;
      border-bottom: 1px solid rgba(255,255,255,.08);
    }
    .device-name {
      font-size: 0.95rem;
      font-weight: 700;
      color: #c6ccd6;
      letter-spacing: .04em;
      text-transform: uppercase;
    }
    .session-badge {
      font-size: 0.78rem;
      font-weight: 600;
      color: #c6ccd6;
      background: rgba(255,255,255,.08);
      padding: 2px 8px;
      border-radius: 8px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 55%;
      text-align: right;
    }

    /* ---- grid of metrics ---- */
    .metrics {
      display: grid;
      padding: 6px 8px 10px;
      gap: 4px;
    }

    /* active: 4 columns row 1, 3 columns row 2 */
    .metrics.active {
      grid-template-columns: 1fr 1fr 1fr 1fr;
    }
    /* passive: 1×2 */
    .metrics.passive {
      grid-template-columns: 1fr 1fr;
    }

    .metric {
      background: rgba(0,0,0,.22);
      border-radius: 10px;
      padding: 8px 10px 6px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .metric.accent {
      background: rgba(0,0,0,.30);
    }
    .metric.span-2 {
      grid-column: span 2;
    }
    .metric.span-4 {
      grid-column: span 4;
    }

    .metric-label {
      font-size: 0.68rem;
      font-weight: 600;
      color: #8fa0b4;
      letter-spacing: .06em;
      display: flex;
      align-items: center;
      gap: 5px;
      line-height: 1.15;
      min-height: 2.35em;
      text-transform: uppercase;
    }
    .metric-label svg { color: #8fa0b4; flex-shrink: 0; }

    .metric-value {
      font-size: clamp(1.1rem, 2.2vw, 1.5rem);
      font-weight: 800;
      line-height: 1;
      color: #d9c44a;
      letter-spacing: -.01em;
    }
    .metric-value.white {
      color: #e8ebef;
    }

    .metric.stage-main {
      grid-column: span 2;
    }

    .stage-fraction {
      font-size: clamp(1.1rem, 2.2vw, 1.5rem);
      font-weight: 800;
      line-height: 1;
      letter-spacing: -.01em;
    }
    .stage-current {
      color: #d9c44a;
    }
    .stage-sep,
    .stage-total {
      color: #e8ebef;
    }

    .metric.stage-sub {
      padding-top: 6px;
    }

    .stage-step-inline {
      color: #c6ccd6;
      text-transform: none;
      letter-spacing: .01em;
      margin-left: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1 1 auto;
      min-width: 0;
    }

    /* Stage metric sub-info */
    .metric-sub {
      font-size: 0.72rem;
      color: #8fa0b4;
      font-weight: 600;
      margin-top: 2px;
      line-height: 1.2;
    }
    .metric-sub.name {
      color: #c6ccd6;
    }

    /* Time left sub-section */
    .metric-sub-time {
      margin-top: 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .metric-sub-time-label {
      font-size: 0.65rem;
      font-weight: 600;
      color: #8fa0b4;
      letter-spacing: .05em;
      text-transform: uppercase;
    }
    .metric-sub-time-value {
      font-size: 0.95rem;
      font-weight: 800;
      color: #d9c44a;
      line-height: 1;
    }

    /* no-session message */
    .no-session-strip {
      text-align: center;
      padding: 4px 0 8px;
      font-size: 0.8rem;
      color: #586070;
      letter-spacing: .03em;
    }

    .error {
      padding: 14px;
      color: var(--error-color, #ff6b6b);
      font-size: 0.9rem;
    }
  `;

  constructor() {
    super();
    this.hass = undefined;
    this._config = {};
    this._tick = 0;
    this._timerId = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this._startTimer();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    clearInterval(this._timerId);
    this._timerId = null;
  }

  _startTimer() {
    if (this._timerId !== null) return;
    // Refresh every 60 s so "time left" counts down without waiting for HA polling
    this._timerId = setInterval(() => {
      this._tick += 1;
    }, 60000);
  }

  setConfig(config) {
    this._config = {
      density_unit: 'sg',
      ...(config || {}),
    };

    // Backward compatibility: legacy "entity" acts as temperature override.
    if (!this._config.temperature_entity && this._config.entity) {
      this._config.temperature_entity = this._config.entity;
    }
  }

  set config(c) { this.setConfig(c); }

  getCardSize() { return 2; }

  static getStubConfig(hass) {
    return { density_unit: 'sg' };
  }

  static getConfigForm() {
    return {
      schema: [
        {
          name: 'device',
          required: true,
          selector: {
            device: {
              filter: [
                {
                  integration: 'grainfather',
                  model: 'Fermentation Device',
                },
              ],
            },
          },
        },
        {
          name: 'temperature_entity',
          required: false,
          selector: {
            entity: {
              domain: 'sensor',
              device_class: 'temperature',
            },
          },
        },
        {
          name: 'gravity_entity',
          required: false,
          selector: {
            entity: {
              domain: 'sensor',
            },
          },
        },
        {
          name: 'density_unit',
          default: 'sg',
          selector: {
            select: {
              mode: 'dropdown',
              options: [
                { value: 'sg',    label: 'SG' },
                { value: 'plato', label: 'Plato (°P)' },
                { value: 'brix',  label: 'Brix (°Bx)' },
              ],
            },
          },
        },
      ],
      computeLabel: (s) => {
        if (s.name === 'device')       return 'Fermentation device';
        if (s.name === 'temperature_entity') return 'Optional: temperature sensor override';
        if (s.name === 'gravity_entity') return 'Optional: gravity sensor override';
        if (s.name === 'density_unit') return 'Density unit';
        return undefined;
      },
      computeHelper: (s) => {
        if (s.name === 'device') return 'Required. Card resolves session/stage from this Grainfather device.';
        if (s.name === 'temperature_entity') return 'If set, current temperature is read from this entity.';
        if (s.name === 'gravity_entity') return 'If set, gravity is read from this entity (generic sensor; no dedicated gravity device class in HA).';
        return undefined;
      },
      assertConfig: (config) => {
        if (config?.device !== undefined && typeof config.device !== 'string') {
          throw new Error('Device must be a string.');
        }
      },
    };
  }

  _getConfiguredTemperatureOverrideState() {
    const entityId = this._config?.temperature_entity;
    if (!entityId || !this.hass) {
      return null;
    }
    const stateObj = this.hass.states[entityId];
    if (!stateObj) {
      return null;
    }
    return stateObj.state;
  }

  _getConfiguredGravityOverrideState() {
    const entityId = this._config?.gravity_entity;
    if (!entityId || !this.hass) {
      return null;
    }
    const stateObj = this.hass.states[entityId];
    if (!stateObj) {
      return null;
    }
    return stateObj.state;
  }

  _lang() {
    const raw = String(this.hass?.language || 'en').toLowerCase();
    const s = raw.split('-')[0];
    return CARD_I18N[s] ? s : 'en';
  }

  _resolveTemperatureEntityId() {
    const temperatureOverride = this._config?.temperature_entity;
    if (temperatureOverride) {
      return temperatureOverride;
    }

    const legacyEntity = this._config?.entity;
    if (legacyEntity) {
      return legacyEntity;
    }

    const configuredDevice = this._config?.device;
    if (!configuredDevice || !this.hass) {
      return null;
    }

    // Try direct match with Grainfather numeric device_id exposed in attributes.
    const byNumericDeviceId = Object.keys(this.hass.states).find((id) => {
      if (!id.endsWith('_temperature')) return false;
      const attrs = this.hass.states[id]?.attributes || {};
      return String(attrs.device_id) === String(configuredDevice);
    });
    if (byNumericDeviceId) {
      return byNumericDeviceId;
    }

    // Try HA entity registry metadata when device selector returns HA device registry ID.
    const entities = this.hass.entities;
    if (entities && typeof entities === 'object') {
      const byRegistryDevice = Object.entries(entities).find(([entityId, entry]) => {
        if (!entityId.endsWith('_temperature')) return false;
        return entry?.device_id === configuredDevice;
      });
      if (byRegistryDevice) {
        return byRegistryDevice[0];
      }
    }

    return null;
  }

  // Resolve the best available gravity reading for this device.
  // Priority:
  //   1. last_specific_gravity attribute (live sensor value)
  //   2. Most recent valid specific_gravity in history_points (sorted by timestamp)
  //   3. Sibling gravity entity state
  _getGravityRaw(tempAttrs) {
    // 1. Direct live attribute
    const live = tempAttrs.last_specific_gravity;
    if (live != null && live !== '' && live !== 'unavailable' && live !== 'unknown') {
      return String(live);
    }

    // 2. Latest history point with a gravity reading
    const historyLatest = _latestFromHistory(tempAttrs.history_points);
    if (historyLatest.specific_gravity != null) {
      return String(historyLatest.specific_gravity);
    }

    // 3. Sibling gravity entity fallback
    const deviceId = tempAttrs.device_id;
    if (deviceId != null && this.hass) {
      const gravEntity = Object.values(this.hass.states).find((s) => {
        return (
          s.entity_id.endsWith('_gravity') &&
          s.attributes?.device_id === deviceId
        );
      });
      if (gravEntity && gravEntity.state !== 'unavailable' && gravEntity.state !== 'unknown') {
        return gravEntity.state;
      }
    }

    return null;
  }

  render() {
    if (!this.hass) return nothing;

    const entityId = this._resolveTemperatureEntityId();
    if (!entityId) {
      return html`<ha-card><div class="error">${_t(this._lang(), 'editor_pick_entity')}</div></ha-card>`;
    }

    const tempEntity = this.hass.states[entityId];
    if (!tempEntity) {
      return html`<ha-card><div class="error">Entity <code>${entityId}</code> ${_t(this._lang(), 'not_found')}</div></ha-card>`;
    }

    const attrs       = tempEntity.attributes;
    const lang        = this._lang();
    const unit        = _normUnit(this._config?.density_unit);

    // Device meta (prefer explicit override, then live state, then history)
    const deviceHistoryLatest = _latestFromHistory(attrs.history_points);
    const configuredTempState = this._getConfiguredTemperatureOverrideState();
    let currentTempRaw = _isValidNumber(configuredTempState)
      ? configuredTempState
      : (_isValidNumber(tempEntity.state) ? tempEntity.state : deviceHistoryLatest.temperature);

    // Gravity – prefer explicit sources, fallback to history
    const configuredGravityState = this._getConfiguredGravityOverrideState();
    let gravRaw = _isValidNumber(configuredGravityState)
      ? configuredGravityState
      : this._getGravityRaw(attrs);
    if (gravRaw == null && deviceHistoryLatest.specific_gravity != null) {
      gravRaw = String(deviceHistoryLatest.specific_gravity);
    }

    // Active session?
    const linkedSessionId = attrs.linked_brew_session_id;
    const hasSession = linkedSessionId != null;

    // Session data embedded in attributes
    const steps              = attrs.fermentation_steps || [];   // from batch_number sensor (not always present here)
    const fermentationStart  = attrs.fermentation_start_date;
    const sessionName        = attrs.linked_brew_session_name || null;
    let batchVariantName     = attrs.batch_variant_name || null;

    // Try to derive steps from the linked brew-session batch_number sensor's attributes.
    // Strategy: walk all states to find a batch_number sensor whose brew_session_id matches.
    let derivedSteps = steps;
    let derivedStart = fermentationStart;
    let targetTemperature = null;
    let stepCount = 0;

    let matchedBatchAttrs = null;
    let matchedBatchSensorId = null;
    if (hasSession && this.hass) {
      const batchSensorId = Object.keys(this.hass.states).find((id) => {
        if (!id.endsWith('_batch_number')) return false;
        const s = this.hass.states[id];
        return String(s?.attributes?.brew_session_id) === String(linkedSessionId);
      });
      if (batchSensorId) {
        matchedBatchSensorId = batchSensorId;
        const batchAttrs = this.hass.states[batchSensorId].attributes;
        matchedBatchAttrs = batchAttrs;
        derivedSteps = batchAttrs.fermentation_steps || derivedSteps;
        derivedStart = batchAttrs.fermentation_start_date || derivedStart;
        batchVariantName = batchAttrs.batch_variant_name || batchVariantName;

        // Hard fallback for split/controller setups:
        // if live device values are empty, use latest value directly from session history.
        const sessionHistoryLatest = _latestFromHistory(batchAttrs.history_points);
        if (!_isValidNumber(currentTempRaw) && sessionHistoryLatest.temperature != null) {
          currentTempRaw = sessionHistoryLatest.temperature;
        }
        if ((gravRaw == null || !_isValidNumber(gravRaw)) && sessionHistoryLatest.specific_gravity != null) {
          gravRaw = String(sessionHistoryLatest.specific_gravity);
        }
      }
      stepCount = derivedSteps.length;
    }

    const currentTemp = _fmtTemp(currentTempRaw);
    const gravity = _fmtGravity(gravRaw, unit);

    const currentStep = hasSession
      ? _computeCurrentStep(derivedSteps, derivedStart)
      : null;

    if (currentStep) {
      targetTemperature = currentStep.temperature;
    }

    // Calculate ABV from the best available source for this session/device.
    let abv = null;
    if (hasSession) {
      // 1) Prefer dedicated ABV session sensor if present.
      if (matchedBatchSensorId && this.hass) {
        const abvEntityId = matchedBatchSensorId.replace(/_batch_number$/, '_abv');
        const abvState = this.hass.states[abvEntityId]?.state;
        if (_isValidNumber(abvState)) {
          abv = Number(abvState);
        }
      }

      // 2) Fallback: OG from session sensor + current SG for this device.
      if (abv == null && matchedBatchSensorId && this.hass) {
        const ogEntityId = matchedBatchSensorId.replace(/_batch_number$/, '_original_gravity');
        const ogState = this.hass.states[ogEntityId]?.state;
        const og = _toSg(ogState);
        const currentSg = _toSg(gravRaw);
        if (og != null && currentSg != null) {
          abv = _calcABV(og, currentSg);
        }
      }

      // 3) Fallback: derive OG/FG from history.
      if (abv == null) {
        const batchHistoryPoints = Array.isArray(matchedBatchAttrs?.history_points)
        ? matchedBatchAttrs.history_points
        : [];
        const deviceHistoryPoints = Array.isArray(attrs.history_points) ? attrs.history_points : [];

        // Prefer session history only when it actually contains points; otherwise fallback to device history.
        const gravityHistoryPoints = batchHistoryPoints.length > 0 ? batchHistoryPoints : deviceHistoryPoints;

        const { og, fg } = _getOriginalAndCurrentGravity(gravityHistoryPoints, {
          sessionId: linkedSessionId,
          deviceId: attrs.device_id,
        });
        abv = _calcABV(og, fg);
      }
    }

    // Calculate total time remaining from fermentation start
    let totalMinutesRemaining = null;
    if (hasSession && derivedSteps.length > 0 && derivedStart) {
      let totalMinutes = 0;
      for (let i = 0; i < derivedSteps.length; i++) {
        totalMinutes += derivedSteps[i].duration_minutes ?? derivedSteps[i].time ?? 0;
      }
      const start = new Date(derivedStart);
      if (!isNaN(start.getTime())) {
        const elapsedMinutes = (Date.now() - start.getTime()) / 60000;
        totalMinutesRemaining = Math.max(0, totalMinutes - elapsedMinutes);
      }
    }

    // Pretty device name: strip entry_id prefix if friendly_name not useful
    const displayName = _resolveDisplayName(attrs);

    return html`
      <ha-card>
        <div class="header">
          <div class="device-name">${displayName}</div>
          ${hasSession
            ? html`<div class="session-badge">${[sessionName, batchVariantName].filter(Boolean).join(' · ') || '#' + linkedSessionId}</div>`
            : nothing}
        </div>

        ${hasSession
          ? this._renderActive(lang, currentTemp, targetTemperature, gravity, currentStep, stepCount, unit, abv, totalMinutesRemaining)
          : this._renderPassive(lang, currentTemp, gravity)}
      </ha-card>
    `;
  }

  _renderActive(lang, currentTemp, targetTemperature, gravity, currentStep, stepCount, unit, abv, totalMinutesRemaining) {
    const stageLabel = currentStep
      ? `${currentStep.index + 1}/${currentStep.total}`
      : `—/${stepCount || '?'}`;

    const stepName = currentStep?.name || '';
    const timeLeft = currentStep ? _fmtTimeLeft(currentStep.minutes_remaining) : '—';
    const targetDisplay = targetTemperature != null ? `${parseFloat(targetTemperature).toFixed(1)} °C` : '—';
    const totalTimeDisplay = totalMinutesRemaining != null ? _fmtTimeLeft(totalMinutesRemaining) : '—';
    const abvDisplay = _fmtABV(abv);

    return html`
      <div class="metrics active">
        <!-- Row 1: 4 columns -->
        <!-- Current Temp -->
        <div class="metric">
          <div class="metric-label">${_iconThermometer()} ${_t(lang, 'current_temp')}</div>
          <div class="metric-value">${currentTemp}</div>
        </div>

        <!-- Gravity -->
        <div class="metric">
          <div class="metric-label">${_iconDrop()} ${_t(lang, 'gravity')}</div>
          <div class="metric-value white">${gravity}</div>
        </div>

        <!-- Stage (spans 2 columns) -->
        <div class="metric stage-main">
          <div class="metric-label">
            ${_iconStages()} ${_t(lang, 'stage')}
            ${stepName ? html`<span class="stage-step-inline">- ${stepName}</span>` : nothing}
          </div>
          <div class="stage-fraction">
            <span class="stage-current">${currentStep ? currentStep.index + 1 : '—'}</span><span class="stage-sep">/</span><span class="stage-total">${currentStep ? currentStep.total : (stepCount || '?')}</span>
          </div>
        </div>

        <!-- Row 2: target / ABV / time left / total time left -->
        <!-- Target Temp -->
        <div class="metric">
          <div class="metric-label">${_iconTarget()} ${_t(lang, 'target_temp')}</div>
          <div class="metric-value white">${targetDisplay}</div>
        </div>

        <!-- ABV -->
        <div class="metric">
          <div class="metric-label">🍺 ${_t(lang, 'abv')}</div>
          <div class="metric-value">${abvDisplay}</div>
        </div>

        <!-- Time Left -->
        <div class="metric stage-sub">
          <div class="metric-label">${_iconClock()} ${_t(lang, 'time_left')}</div>
          <div class="metric-value">${timeLeft}</div>
        </div>

        <!-- Total Time Left -->
        <div class="metric stage-sub">
          <div class="metric-label">${_t(lang, 'total_time_left')}</div>
          <div class="metric-value white">${totalTimeDisplay}</div>
        </div>
      </div>
    `;
  }

  _renderPassive(lang, currentTemp, gravity) {
    return html`
      <div class="metrics passive">
        <div class="metric">
          <div class="metric-label">${_iconThermometer()} ${_t(lang, 'current_temp')}</div>
          <div class="metric-value">${currentTemp}</div>
        </div>
        <div class="metric">
          <div class="metric-label">${_iconDrop()} ${_t(lang, 'gravity')}</div>
          <div class="metric-value white">${gravity}</div>
        </div>
      </div>
      <div class="no-session-strip">${_t(lang, 'no_session')}</div>
    `;
  }
}

// ---------------------------------------------------------------------------
// Helper: extract a concise display name for the device from entity attributes
// ---------------------------------------------------------------------------
function _resolveDisplayName(attrs) {
  // friendly_name on device sensors is set by HA as "<Device Name> Temperature"
  const fn = attrs.friendly_name || '';
  // Strip trailing sensor-type suffix to show just the device name
  return fn
    .replace(/\s+(Temperature|Gravity|Temperatura|Grawitacja)$/i, '')
    .trim() || 'Fermentation Device';
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
if (!customElements.get('grainfather-fermentation-device-card')) {
  customElements.define('grainfather-fermentation-device-card', GrainfatherFermentationDeviceCard);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'grainfather-fermentation-device-card',
  name: 'Grainfather Fermentation Device Card',
  description: 'Shows current temp, stage, target temp and gravity for a fermentation device. Compact view when no session is active.',
  preview: false,
  configurable: true,
});
