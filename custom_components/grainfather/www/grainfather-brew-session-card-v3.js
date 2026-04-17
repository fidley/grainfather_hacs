import { LitElement, css, html, nothing } from 'https://unpkg.com/lit@3.3.0/index.js?module';

const CARD_I18N = {
  en: {
    abv: 'ABV',
    initial_sg: 'Initial gravity',
    final_sg: 'Final gravity',
    style: 'Style',
    status: 'Status',
    batch_prefix: '#',
    id_label: 'ID',
    editor_pick_entity: 'Choose a Grainfather batch_number sensor in the card editor.',
    not_found: 'not found.',
    unknown: 'Unknown',
  },
  pl: {
    abv: 'ABV',
    initial_sg: 'Gestosc poczatkowa',
    final_sg: 'Gestosc koncowa',
    style: 'Styl',
    status: 'Status',
    batch_prefix: '#',
    id_label: 'ID',
    editor_pick_entity: 'Wybierz sensor Grainfather batch_number w edytorze karty.',
    not_found: 'nie znaleziono.',
    unknown: 'Nieznany',
  },
};

function _translate(lang, key) {
  const selected = CARD_I18N[lang] || CARD_I18N.en;
  return selected[key] || CARD_I18N.en[key] || key;
}

class GrainfatherBrewSessionCardV3 extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
    _refreshTick: { state: true },
  };

  static styles = css`
    :host {
      display: block;
    }

    ha-card {
      overflow: hidden;
      border-radius: 14px;
      background: #3a3f4a;
      box-shadow: 0 2px 10px rgba(0,0,0,.45);
      color: #e8ebef;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding: 10px 14px 6px;
      border-bottom: 1px solid rgba(255,255,255,.08);
    }

    .batch-id {
      font-size: 1.8rem;
      font-weight: 800;
      color: #e8ebef;
      line-height: 1;
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
      max-width: 70%;
      text-align: right;
    }

    .metrics {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
      padding: 6px 8px 10px;
    }

    .metric {
      background: rgba(0,0,0,.22);
      border-radius: 10px;
      padding: 8px 10px 6px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .metric.full-width {
      grid-column: span 2;
    }

    .metric.image-metric {
      grid-column: span 2;
      padding: 6px;
      background: rgba(0,0,0,.18);
    }

    .image-wrap {
      width: 100%;
      height: 140px;
      border-radius: 8px;
      overflow: hidden;
      background: rgba(255,255,255,.06);
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .image-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .image-fallback {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 30px;
      color: #c6ccd6;
      background: rgba(255,255,255,.05);
    }

    .metric-label {
      font-size: 0.68rem;
      font-weight: 600;
      color: #8fa0b4;
      letter-spacing: .06em;
      display: flex;
      align-items: center;
      gap: 5px;
      text-transform: uppercase;
      line-height: 1.15;
    }
    .metric-label svg {
      color: #8fa0b4;
      flex-shrink: 0;
    }

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

    .error {
      padding: 16px;
      color: var(--error-color, #ff6b6b);
    }

    @media (max-width: 760px) {
      .batch-id {
        font-size: 1.55rem;
      }
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
      show_batch_variant: true,
      ...(config || {}),
    };
  }

  set config(config) {
    this.setConfig(config);
  }

  getCardSize() {
    return 3;
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
      show_batch_variant: true,
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
          name: 'show_batch_variant',
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
        if (schema.name === 'show_batch_variant') {
          return 'Show batch variant in header';
        }
        return undefined;
      },
      computeHelper: (schema) => {
        if (schema.name === 'entity') {
          return 'Select the Grainfather sensor ending with _batch_number.';
        }
        if (schema.name === 'show_image') {
          return 'Display the recipe image panel.';
        }
        if (schema.name === 'density_unit') {
          return 'Display gravity values as Integration default, SG, Plato, or Brix.';
        }
        if (schema.name === 'show_batch_variant') {
          return 'When enabled, header badge shows session and batch variant (session · variant).';
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

  _lang() {
    const raw = String(this.hass?.language || 'en').toLowerCase();
    const short = raw.split('-')[0];
    return CARD_I18N[short] ? short : 'en';
  }

  _t(key) {
    return _translate(this._lang(), key);
  }

  render() {
    if (!this.hass) {
      return nothing;
    }

    const entityId = this._config?.entity;
    if (!entityId) {
      return html`
        <ha-card>
          <div class="error">${this._t('editor_pick_entity')}</div>
        </ha-card>
      `;
    }

    const entity = this.hass.states[entityId];
    if (!entity) {
      return html`
        <ha-card>
          <div class="error">Entity <code>${entityId}</code> ${this._t('not_found')}</div>
        </ha-card>
      `;
    }

    const attrs = entity.attributes;
    const sessionName = attrs.session_name || attrs.recipe_name || '—';
    const status = attrs.status || this._t('unknown');
    const style = attrs.style_name || attrs.style || this._stateValue('style', this._t('unknown'));
    const imageUrl = attrs.recipe_image_url;
    const batchVariantName = attrs.batch_variant_name || null;
    const densityUnit = _resolveDensityUnit(this._config?.density_unit, attrs);
    const showImage = this._config?.show_image !== false;
    const showBatchVariant = this._config?.show_batch_variant !== false;
    const batchNumber = entity.state !== 'unknown' && entity.state !== 'unavailable'
      ? entity.state
      : (attrs.batch_number ?? '—');
    const sessionBadge = showBatchVariant
      ? [sessionName, batchVariantName].filter(Boolean).join(' · ') || sessionName
      : sessionName;

    const abvRaw = this._stateValue('abv');
    const abv = abvRaw !== '—' ? `${abvRaw} %` : '—';
    const og = _formatGravityFromSg(this._stateValue('original_gravity'), densityUnit, true);
    const fg = _formatGravityFromSg(this._stateValue('final_gravity'), densityUnit, true);

    return html`
      <ha-card>
        <div class="header">
          <div class="batch-id">${this._t('batch_prefix')}${batchNumber}</div>
          <div class="session-badge">${sessionBadge}</div>
        </div>

        <div class="metrics">
          ${showImage
            ? html`
                <div class="metric image-metric">
                  <div class="image-wrap">
                    ${imageUrl
                      ? html`<img src=${imageUrl} alt="Recipe image" />`
                      : html`<div class="image-fallback">🍺</div>`}
                  </div>
                </div>
              `
            : nothing}

          <div class="metric">
            <div class="metric-label">${_iconPercent()} ${this._t('abv')}</div>
            <div class="metric-value">${abv}</div>
          </div>

          <div class="metric">
            <div class="metric-label">${_iconThermometer()} ${this._t('initial_sg')}</div>
            <div class="metric-value white">${og}</div>
          </div>

          <div class="metric">
            <div class="metric-label">${_iconDrop()} ${this._t('final_sg')}</div>
            <div class="metric-value white">${fg}</div>
          </div>

          <div class="metric">
            <div class="metric-label">${_iconFlask()} ${this._t('status')}</div>
            <div class="metric-value white">${status}</div>
          </div>

          <div class="metric full-width">
            <div class="metric-label">${_iconStyle()} ${this._t('style')}</div>
            <div class="metric-value white">${style || this._t('unknown')}</div>
          </div>
        </div>
      </ha-card>
    `;
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

function _iconPercent() {
  return html`
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <line x1="19" y1="5" x2="5" y2="19"></line>
      <circle cx="6.5" cy="6.5" r="2.5"></circle>
      <circle cx="17.5" cy="17.5" r="2.5"></circle>
    </svg>
  `;
}

function _iconThermometer() {
  return html`
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0z"></path>
    </svg>
  `;
}

function _iconDrop() {
  return html`
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
      <path d="M12 2.7c-.2.24-5.82 6.95-5.82 10.86A5.82 5.82 0 0 0 12 19.38a5.82 5.82 0 0 0 5.82-5.82C17.82 9.65 12.2 2.94 12 2.7z"></path>
    </svg>
  `;
}

function _iconFlask() {
  return html`
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M10 2v5l-5.5 9.5A3 3 0 0 0 7.1 21h9.8a3 3 0 0 0 2.6-4.5L14 7V2"></path>
      <path d="M8.5 13h7"></path>
      <circle cx="9" cy="16" r="0.8" fill="currentColor" stroke="none"></circle>
      <circle cx="12" cy="15" r="0.8" fill="currentColor" stroke="none"></circle>
      <circle cx="14.8" cy="16.4" r="0.8" fill="currentColor" stroke="none"></circle>
    </svg>
  `;
}

function _iconStyle() {
  return html`
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M7 4h10"></path>
      <path d="M9 4v5a4 4 0 0 1-1 2.7l-2.8 3.2A3.2 3.2 0 0 0 7.6 20h8.8a3.2 3.2 0 0 0 2.4-5.1L16 11.7A4 4 0 0 1 15 9V4"></path>
    </svg>
  `;
}

if (!customElements.get('grainfather-brew-session-card-compact')) {
  customElements.define('grainfather-brew-session-card-compact', GrainfatherBrewSessionCardV3);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'grainfather-brew-session-card-compact',
  name: 'Grainfather Brew Session Compact',
  description: 'Compact dark layout with key brew session metrics.',
  preview: false,
  configurable: true,
});
