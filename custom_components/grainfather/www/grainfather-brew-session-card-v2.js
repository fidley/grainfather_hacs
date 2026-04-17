import { LitElement, css, html, nothing } from 'https://unpkg.com/lit@3.3.0/index.js?module';

class GrainfatherBrewSessionCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
    _refreshTick: { state: true },
  };

  static styles = css`
    :host { display: block; }
    ha-card {
      overflow: hidden;
      border-radius: 14px;
      background: #3a3f4a;
      box-shadow: 0 2px 10px rgba(0,0,0,.45);
      color: #e8ebef;
    }

    .banner {
      position: relative;
      width: 100%;
      height: 150px;
      background: rgba(0,0,0,.18);
      overflow: hidden;
    }

    .banner img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .banner-placeholder {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 56px;
      color: #c6ccd6;
      background: rgba(255,255,255,.05);
    }

    .status-badge {
      position: absolute;
      top: 10px;
      right: 10px;
      padding: 3px 10px;
      border-radius: 12px;
      color: #e8ebef;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: capitalize;
      letter-spacing: 0.3px;
    }

    .body { padding: 12px 16px 16px; }

    .title {
      font-size: 1.1rem;
      font-weight: 600;
      color: #e8ebef;
      line-height: 1.3;
      margin: 0 0 2px;
    }

    .subtitle {
      font-size: 0.78rem;
      color: #8fa0b4;
      margin: 0 0 12px;
    }

    .stats {
      display: flex;
      gap: 6px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }

    .stat {
      flex: 1;
      min-width: 52px;
      background: rgba(0,0,0,.22);
      border-radius: 8px;
      padding: 7px 6px;
      text-align: center;
    }

    .stat-label {
      font-size: 0.6rem;
      color: #8fa0b4;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin-bottom: 3px;
    }

    .stat-value {
      font-size: 0.9rem;
      font-weight: 600;
      color: #e8ebef;
      word-break: break-word;
    }

    .stat-value.small { font-size: 0.72rem; }

    .meta-row {
      display: flex;
      justify-content: space-between;
      font-size: 0.8rem;
      padding: 3px 0;
      gap: 12px;
    }

    .meta-label { color: #8fa0b4; }
    .meta-value { color: #e8ebef; font-weight: 500; text-align: right; }

    .divider {
      border: none;
      border-top: 1px solid rgba(255,255,255,.08);
      margin: 10px 0;
    }

    .section-title {
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: #8fa0b4;
      margin-bottom: 6px;
    }

    .step-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.8rem;
      padding: 4px 0;
      border-bottom: 1px solid rgba(255,255,255,.08);
      gap: 12px;
    }

    .step-row.current {
      background: rgba(217, 196, 74, 0.12);
      border-radius: 6px;
      padding: 6px 8px;
      margin: 2px -8px;
      border-bottom-color: transparent;
    }

    .step-row:last-child { border-bottom: none; }
    .step-name { color: #e8ebef; font-weight: 500; }
    .step-meta { color: #8fa0b4; font-size: 0.75rem; text-align: right; }

    .error {
      padding: 16px;
      color: var(--error-color, red);
    }
  `;

  constructor() {
    super();
    this.hass = undefined;
    this._config = {};
    this._refreshTick = 0;
    this._refreshIntervalId = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this._ensureRefreshLoop();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._refreshIntervalId !== null) {
      clearInterval(this._refreshIntervalId);
      this._refreshIntervalId = null;
    }
  }

  setConfig(config) {
    this._config = {
      density_unit: 'default',
      show_image: true,
      show_status_dates: true,
      show_fermentation_steps: true,
      show_batch_variant_name: true,
      ...(config || {}),
    };
  }

  set config(config) {
    this.setConfig(config);
  }

  getCardSize() {
    return 5;
  }

  getGridOptions() {
    return {
      columns: 'full',
    };
  }

  static getStubConfig(hass) {
    const fallbackEntity = hass
      ? Object.keys(hass.states).find((entityId) => entityId.endsWith('_batch_number')) || ''
      : '';

    return {
      entity: fallbackEntity,
      density_unit: 'default',
      show_image: true,
      show_status_dates: true,
      show_fermentation_steps: true,
      show_batch_variant_name: true,
    };
  }

  static getConfigForm() {
    return {
      schema: [
        {
          name: 'entity',
          required: true,
          selector: {
            entity: {},
          },
        },
        {
          name: 'show_image',
          default: true,
          selector: {
            boolean: {},
          },
        },
        {
          name: 'density_unit',
          default: 'default',
          selector: {
            select: {
              mode: 'dropdown',
              options: [
                { value: 'default', label: 'Integration default' },
                { value: 'sg', label: 'SG' },
                { value: 'plato', label: 'Plato' },
                { value: 'brix', label: 'Brix' },
              ],
            },
          },
        },
        {
          name: 'show_status_dates',
          default: true,
          selector: {
            boolean: {},
          },
        },
        {
          name: 'show_fermentation_steps',
          default: true,
          selector: {
            boolean: {},
          },
        },
        {
          name: 'show_batch_variant_name',
          default: true,
          selector: {
            boolean: {},
          },
        },
      ],
      assertConfig: (config) => {
        if (config.entity !== undefined && typeof config.entity !== 'string') {
          throw new Error('Entity must be a string.');
        }
      },
      computeLabel: (schema) => {
        if (schema.name === 'entity') {
          return 'Brew session entity';
        }
        if (schema.name === 'show_image') {
          return 'Show image';
        }
        if (schema.name === 'density_unit') {
          return 'Density unit';
        }
        if (schema.name === 'show_status_dates') {
          return 'Show status dates';
        }
        if (schema.name === 'show_fermentation_steps') {
          return 'Show fermentation steps';
        }
        if (schema.name === 'show_batch_variant_name') {
          return 'Show batch variant name';
        }
        return undefined;
      },
      computeHelper: (schema) => {
        if (schema.name === 'entity') {
          return 'Select the Grainfather sensor ending with _batch_number.';
        }
        if (schema.name === 'show_image') {
          return 'Display the recipe image banner.';
        }
        if (schema.name === 'density_unit') {
          return 'Display gravity values as Integration default, SG, Plato, or Brix.';
        }
        if (schema.name === 'show_status_dates') {
          return 'Display condition and fermentation start dates.';
        }
        if (schema.name === 'show_fermentation_steps') {
          return 'Display the fermentation steps section.';
        }
        if (schema.name === 'show_batch_variant_name') {
          return 'Display the Batch Variant stat tile.';
        }
        return undefined;
      },
    };
  }

  _ensureRefreshLoop() {
    if (this._refreshIntervalId !== null) return;
    this._refreshIntervalId = setInterval(() => {
      const hass = _resolveHass();
      if (hass) {
        this.hass = hass;
        this._requestFermentationRefresh();
        this._refreshTick += 1;
      }
    }, 10000);
  }

  _requestFermentationRefresh() {
    const entityId = this._config?.entity;
    if (!entityId || !this.hass) return;

    const ids = [entityId];
    if (entityId.endsWith('_batch_number')) {
      const base = entityId.slice(0, -'_batch_number'.length);
      for (const suffix of ['abv', 'original_gravity', 'final_gravity', 'style', 'batch_variant_name']) {
        const relatedId = `${base}_${suffix}`;
        if (this.hass.states[relatedId]) {
          ids.push(relatedId);
        }
      }
    }

    this.hass.callService('homeassistant', 'update_entity', {
      entity_id: ids,
    }).catch((e) => console.warn('Fermentation refresh error:', e));
  }

  _related(suffix) {
    const entityId = this._config?.entity;
    if (!entityId || !entityId.endsWith('_batch_number') || !this.hass) {
      return undefined;
    }

    const base = entityId.slice(0, -'_batch_number'.length);
    return this.hass.states[`${base}_${suffix}`];
  }

  _stateValue(suffix, fallback = '—') {
    const entity = this._related(suffix);
    if (!entity || entity.state === 'unavailable' || entity.state === 'unknown') {
      return fallback;
    }
    return entity.state;
  }

  render() {
    if (!this.hass) {
      return nothing;
    }

    const entityId = this._config?.entity;
    if (!entityId) {
      return html`
        <ha-card>
          <div class="error">Choose a Grainfather batch_number sensor in the card editor.</div>
        </ha-card>
      `;
    }

    const entity = this.hass.states[entityId];
    if (!entity) {
      return html`
        <ha-card>
          <div class="error">Entity <code>${entityId}</code> not found.</div>
        </ha-card>
      `;
    }

    const attrs = entity.attributes;
    const sessionName = attrs.session_name || attrs.recipe_name || '—';
    const batchNumber = attrs.batch_number ?? entity.state;
    const brewSessionId = attrs.brew_session_id ?? '—';
    const status = attrs.status || 'unknown';
    const imageUrl = attrs.recipe_image_url;
    const equipment = attrs.equipment_name || '';
    const batchVariantName = attrs.batch_variant_name || this._stateValue('batch_variant_name', '—');
    const conditionDate = attrs.condition_date ? _formatDate(attrs.condition_date) : null;
    const fermStart = attrs.fermentation_start_date ? _formatDate(attrs.fermentation_start_date) : null;
    const steps = Array.isArray(attrs.fermentation_steps) ? attrs.fermentation_steps : [];
    const currentStepIndex = _computeCurrentFermentationStepIndex(steps, attrs.fermentation_start_date);
    const isFermenting = String(status).toLowerCase() === 'fermenting';

    const showImage = this._config?.show_image !== false;
    const showStatusDates = this._config?.show_status_dates !== false;
    const showFermentationSteps = this._config?.show_fermentation_steps !== false;
    const showBatchVariantName = this._config?.show_batch_variant_name !== false;
    const densityUnit = _resolveDensityUnit(this._config?.density_unit, attrs);

    const abvRaw = this._stateValue('abv');
    const abv = abvRaw !== '—' ? `${abvRaw} %vol` : '—';
    const og = _formatGravityFromSg(this._stateValue('original_gravity'), densityUnit, true);
    const fg = _formatGravityFromSg(this._stateValue('final_gravity'), densityUnit, true);
    const style = this._stateValue('style');
    const statusColor = STATUS_COLORS[status] || '#9e9e9e';

    return html`
      <ha-card>
        ${showImage
          ? html`
              <div class="banner">
                ${imageUrl
                  ? html`<img src=${imageUrl} alt="Recipe image" />`
                  : html`<div class="banner-placeholder">🍺</div>`}
                <div class="status-badge" style=${`background: ${statusColor};`}>${status}</div>
              </div>
            `
          : nothing}

        <div class="body">
          <div class="title">${sessionName}</div>
          <div class="subtitle">
            #${String(batchNumber)}
            &nbsp;·&nbsp; ID&nbsp;${String(brewSessionId)}
            ${equipment ? html`&nbsp;·&nbsp; ${equipment}` : nothing}
          </div>

          <div class="stats">
            <div class="stat">
              <div class="stat-label">ABV</div>
              <div class="stat-value">${abv}</div>
            </div>
            <div class="stat">
              <div class="stat-label">OG</div>
              <div class="stat-value">${og}</div>
            </div>
            <div class="stat">
              <div class="stat-label">FG</div>
              <div class="stat-value">${fg}</div>
            </div>
            ${style !== '—'
              ? html`
                  <div class="stat">
                    <div class="stat-label">Style</div>
                    <div class="stat-value small">${style}</div>
                  </div>
                `
              : nothing}
            ${showBatchVariantName
              ? html`
                  <div class="stat">
                    <div class="stat-label">Variant</div>
                    <div class="stat-value small">${batchVariantName}</div>
                  </div>
                `
              : nothing}
          </div>

          ${showStatusDates && (conditionDate || fermStart)
            ? html`
                <div>
                  ${conditionDate
                    ? html`
                        <div class="meta-row">
                          <span class="meta-label">Condition date</span>
                          <span class="meta-value">${conditionDate}</span>
                        </div>
                      `
                    : nothing}
                  ${fermStart
                    ? html`
                        <div class="meta-row">
                          <span class="meta-label">Fermentation start</span>
                          <span class="meta-value">${fermStart}</span>
                        </div>
                      `
                    : nothing}
                </div>
              `
            : nothing}

          ${showFermentationSteps && steps.length > 0
            ? html`
                <hr class="divider" />
                <div class="section-title">Fermentation steps</div>
                ${steps.map((step, index) => html`
                  <div class=${`step-row ${isFermenting && index === currentStepIndex ? 'current' : ''}`}>
                    <span class="step-name">${step.name || `Step ${index + 1}`}</span>
                    <span class="step-meta">
                      ${_stepMeta(step)}
                    </span>
                  </div>
                `)}
              `
            : nothing}
        </div>
      </ha-card>
    `;
  }
}

const STATUS_COLORS = {
  planning:     '#9e9e9e',
  brewing:      '#ff9800',
  fermenting:   '#4caf50',
  conditioning: '#2196f3',
  serving:      '#00bcd4',
  completed:    '#607d8b',
};

function _formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function _formatGravityFromSg(value, unit = 'sg', includeUnit = false) {
  if (value == null || value === '—' || value === 'unknown' || value === 'unavailable') {
    return '—';
  }

  const sg = Number.parseFloat(value);
  if (!Number.isFinite(sg)) {
    return String(value);
  }

  const normalizedUnit = _normalizeDensityUnit(unit);
  if (normalizedUnit === 'plato') {
    const formatted = _convertSgToPlato(sg).toFixed(1);
    return includeUnit ? `${formatted} °P` : formatted;
  }

  if (normalizedUnit === 'brix') {
    const formatted = _convertSgToBrix(sg).toFixed(1);
    return includeUnit ? `${formatted} °Bx` : formatted;
  }

  const formatted = sg.toFixed(3);
  return includeUnit ? `${formatted} SG` : formatted;
}

function _normalizeDensityUnit(unit) {
  const normalized = String(unit || 'sg').toLowerCase();
  if (normalized === 'plato' || normalized === 'brix') {
    return normalized;
  }
  return 'sg';
}

function _resolveDensityUnit(configuredUnit, attrs) {
  const explicit = String(configuredUnit || '').toLowerCase();
  if (explicit === 'sg' || explicit === 'plato' || explicit === 'brix') {
    return explicit;
  }

  const fromIntegration = String(attrs?.default_density_unit || 'sg').toLowerCase();
  return _normalizeDensityUnit(fromIntegration);
}

function _convertSgToPlato(sg) {
  return -616.868 + (1111.14 * sg) - (630.272 * sg * sg) + (135.997 * sg * sg * sg);
}

function _convertSgToBrix(sg) {
  return (((182.4601 * sg) - 775.6821) * sg + 1262.7794) * sg - 669.5622;
}

function _stepMeta(step) {
  const parts = [];
  if (step.temperature != null) {
    parts.push(`${step.temperature} °C`);
  }
  if (step.duration_minutes != null) {
    parts.push(_formatDurationMinutes(step.duration_minutes));
  }
  if (step.is_ramp_step) {
    parts.push('ramp');
  }
  return parts.join(' · ');
}

function _formatDurationMinutes(minutes) {
  const totalMinutes = Number(minutes);
  if (!Number.isFinite(totalMinutes)) return '—';
  const rounded = Math.max(0, Math.round(totalMinutes));
  const days = Math.floor(rounded / 1440);
  const hours = Math.floor((rounded % 1440) / 60);
  return `${days}d ${hours}h`;
}

function _computeCurrentFermentationStepIndex(steps, fermentationStartDate) {
  if (!Array.isArray(steps) || steps.length === 0 || !fermentationStartDate) return -1;

  const start = new Date(fermentationStartDate);
  if (Number.isNaN(start.getTime())) return -1;

  const elapsedMinutes = (Date.now() - start.getTime()) / 60000;
  let cursor = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i] || {};
    const duration = Number(step.duration_minutes ?? step.time ?? 0);
    cursor += Number.isFinite(duration) ? duration : 0;
    if (elapsedMinutes < cursor || i === steps.length - 1) {
      return i;
    }
  }

  return -1;
}

function _resolveHass() {
  const root = document.querySelector('home-assistant');
  if (!root) return null;
  if (root.hass) return root.hass;

  const rootShadow = root.shadowRoot;
  if (rootShadow) {
    const main = rootShadow.querySelector('home-assistant-main');
    if (main && main.hass) {
      return main.hass;
    }
  }

  return null;
}

if (!customElements.get('grainfather-brew-session-card-detailed')) {
  customElements.define('grainfather-brew-session-card-detailed', GrainfatherBrewSessionCard);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'grainfather-brew-session-card-detailed',
  name: 'Grainfather Brew Session Detailed',
  description: 'Detailed dark layout for a Grainfather brew session.',
  preview: false,
  configurable: true,
});