import { LitElement, css, html, nothing } from 'https://unpkg.com/lit@3.3.0/index.js?module';

class GrainfatherBrewSessionCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
    _refreshTick: { state: true },
  };

  static styles = css`
    :host { display: block; }
    ha-card { overflow: hidden; }

    .banner {
      position: relative;
      width: 100%;
      height: 150px;
      background: var(--secondary-background-color);
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
    }

    .status-badge {
      position: absolute;
      top: 10px;
      right: 10px;
      padding: 3px 10px;
      border-radius: 12px;
      color: #fff;
      font-size: 0.72rem;
      font-weight: 700;
      text-transform: capitalize;
      letter-spacing: 0.3px;
    }

    .body { padding: 12px 16px 16px; }

    .title {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--primary-text-color);
      line-height: 1.3;
      margin: 0 0 2px;
    }

    .subtitle {
      font-size: 0.78rem;
      color: var(--secondary-text-color);
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
      background: var(--secondary-background-color);
      border-radius: 8px;
      padding: 7px 6px;
      text-align: center;
    }

    .stat-label {
      font-size: 0.6rem;
      color: var(--secondary-text-color);
      text-transform: uppercase;
      letter-spacing: 0.6px;
      margin-bottom: 3px;
    }

    .stat-value {
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--primary-text-color);
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

    .meta-label { color: var(--secondary-text-color); }
    .meta-value { color: var(--primary-text-color); font-weight: 500; text-align: right; }

    .divider {
      border: none;
      border-top: 1px solid var(--divider-color);
      margin: 10px 0;
    }

    .section-title {
      font-size: 0.68rem;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--secondary-text-color);
      margin-bottom: 6px;
    }

    .step-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.8rem;
      padding: 4px 0;
      border-bottom: 1px solid var(--divider-color);
      gap: 12px;
    }

    .step-row:last-child { border-bottom: none; }
    .step-name { color: var(--primary-text-color); font-weight: 500; }
    .step-meta { color: var(--secondary-text-color); font-size: 0.75rem; text-align: right; }

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
        this._refreshTick += 1;
      }
    }, 10000);
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

    const showImage = this._config?.show_image !== false;
    const showStatusDates = this._config?.show_status_dates !== false;
    const showFermentationSteps = this._config?.show_fermentation_steps !== false;
    const showBatchVariantName = this._config?.show_batch_variant_name !== false;

    const abvRaw = this._stateValue('abv');
    const abv = abvRaw !== '—' ? `${abvRaw} %vol` : '—';
    const og = _formatDecimal(this._stateValue('original_gravity'));
    const fg = _formatDecimal(this._stateValue('final_gravity'));
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
                ${steps.map((step) => html`
                  <div class="step-row">
                    <span class="step-name">${step.name || `Step ${(step.index ?? 0) + 1}`}</span>
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

function _formatDecimal(value, digits = 3) {
  if (value == null || value === '—' || value === 'unknown' || value === 'unavailable') {
    return '—';
  }

  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return String(value);
  }

  return parsed.toFixed(digits);
}

function _stepMeta(step) {
  const parts = [];
  if (step.temperature != null) {
    parts.push(`${step.temperature} °C`);
  }
  if (step.duration_minutes != null) {
    parts.push(`${Math.round(step.duration_minutes / 60)} h`);
  }
  if (step.is_ramp_step) {
    parts.push('ramp');
  }
  return parts.join(' · ');
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

if (!customElements.get('grainfather-brew-session-card')) {
  customElements.define('grainfather-brew-session-card', GrainfatherBrewSessionCard);
}

if (!window.__grainfatherShowcaseCardLoading) {
  window.__grainfatherShowcaseCardLoading = true;
  const showcaseModuleUrl = new URL('./grainfather-brew-session-card-showcase.js', import.meta.url).toString();
  import(showcaseModuleUrl).catch(() => {
    // Keep the showcase type available even if module loading fails.
    if (!customElements.get('grainfather-brew-session-card-showcase')) {
      class GrainfatherBrewSessionCardShowcaseFallback extends GrainfatherBrewSessionCard {}
      customElements.define(
        'grainfather-brew-session-card-showcase',
        GrainfatherBrewSessionCardShowcaseFallback,
      );
    }

    window.customCards = window.customCards || [];
    const hasShowcaseCard = window.customCards.some(
      (card) => card && card.type === 'grainfather-brew-session-card-showcase',
    );
    if (!hasShowcaseCard) {
      window.customCards.push({
        type: 'grainfather-brew-session-card-showcase',
        name: 'Grainfather Brew Session Showcase',
        description: 'Showcase fallback layout for a Grainfather brew session.',
        preview: false,
        configurable: true,
      });
    }
  });
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'grainfather-brew-session-card',
  name: 'Grainfather Brew Session',
  description: 'Shows basic information for a Grainfather brew session.',
  preview: false,
  configurable: true,
});
