import { LitElement, css, html, nothing } from 'https://unpkg.com/lit@3.3.0/index.js?module';

const CARD_I18N = {
  en: {
    abv: 'ABV',
    initial_sg: 'Initial gravity',
    final_sg: 'Final gravity',
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
      border-radius: 12px;
      border: 1px solid #cfd5de;
      background: #f6f7fa;
      box-shadow: 0 1px 5px rgba(22, 28, 38, 0.12);
      color: #2a3a50;
    }

    .shell {
      display: grid;
      grid-template-columns: minmax(120px, 30%) 1fr;
      min-height: 160px;
    }

    .image-wrap {
      border-right: 1px solid #d2d9e3;
      background: #eef2f7;
      min-height: 160px;
      padding: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .image-wrap img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 6px;
      display: block;
    }

    .image-fallback {
      width: 100%;
      height: 100%;
      min-height: 140px;
      border-radius: 6px;
      background: #dfe6f0;
      color: #3a4a60;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
    }

    .content {
      padding: 10px 12px;
    }

    .shell:not(:has(.image-wrap)) .content {
      padding: 10px 16px;
    }

    .title {
      margin: 0 0 8px;
      font-size: clamp(1rem, 1.22vw, 1.32rem);
      line-height: 1.2;
      font-weight: 760;
      color: #2d3d53;
      border-bottom: 1px solid #ccd4de;
      padding-bottom: 6px;
    }

    .row {
      min-height: 38px;
      display: flex;
      gap: 6px;
      align-items: center;
      border-top: 1px solid #d5dbe3;
      color: #31445f;
      padding: 6px 8px;
    }

    .row:first-of-type {
      border-top: none;
    }

    .icon {
      width: 18px;
      height: 18px;
      color: #3a4c65;
      display: grid;
      place-items: center;
      flex: 0 0 18px;
    }

    .label {
      font-size: clamp(0.86rem, 0.99vw, 1.04rem);
      font-weight: 580;
      line-height: 1.15;
      flex: 0 0 auto;
      white-space: nowrap;
    }

    .value {
      font-size: clamp(0.96rem, 1.14vw, 1.18rem);
      font-weight: 760;
      color: #2b3d55;
      white-space: nowrap;
      flex: 0 0 auto;
      margin-left: 2px;
    }

    .error {
      padding: 16px;
      color: var(--error-color, #ff6b6b);
    }

    @media (max-width: 760px) {
      .shell {
        grid-template-columns: 1fr;
      }

      .image-wrap {
        border-right: none;
        border-bottom: 1px solid #d2d9e3;
        min-height: 130px;
      }

      .content {
        padding: 10px;
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
      density_unit: 'sg',
      show_image: true,
      ...(config || {}),
    };
    this._config.density_unit = _normalizeDensityUnit(this._config.density_unit);
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
      density_unit: 'sg',
      show_image: true,
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
          default: 'sg',
          selector: {
            select: {
              mode: 'dropdown',
              options: [
                { value: 'sg', label: 'SG' },
                { value: 'plato', label: 'Plato' },
                { value: 'brix', label: 'Brix' },
              ],
            },
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
          return 'Display gravity values as SG, Plato, or Brix.';
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
    const imageUrl = attrs.recipe_image_url;
    const showImage = this._config?.show_image !== false;
    const densityUnit = _normalizeDensityUnit(this._config?.density_unit);

    const abvRaw = this._stateValue('abv');
    const abv = abvRaw !== '—' ? `${abvRaw} %` : '—';
    const og = _formatGravityFromSg(this._stateValue('original_gravity'), densityUnit, true);
    const fg = _formatGravityFromSg(this._stateValue('final_gravity'), densityUnit, true);

    return html`
      <ha-card>
        <div class="shell">
          ${showImage
            ? html`
                <div class="image-wrap">
                  ${imageUrl
                    ? html`<img src=${imageUrl} alt="Recipe image" />`
                    : html`<div class="image-fallback">🍺</div>`}
                </div>
              `
            : nothing}

          <div class="content">
            <h2 class="title">${sessionName}</h2>

            <div class="row">
              <div class="icon">${_iconPercent()}</div>
              <div class="label">${this._t('abv')}:</div>
              <div class="value">${abv}</div>
            </div>

            <div class="row">
              <div class="icon">${_iconThermometer()}</div>
              <div class="label">${this._t('initial_sg')}:</div>
              <div class="value">${og}</div>
            </div>

            <div class="row">
              <div class="icon">${_iconDrop()}</div>
              <div class="label">${this._t('final_sg')}:</div>
              <div class="value">${fg}</div>
            </div>

            <div class="row">
              <div class="icon">${_iconFlask()}</div>
              <div class="label">${this._t('status')}:</div>
              <div class="value">${status}</div>
            </div>
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

if (!customElements.get('grainfather-brew-session-card-v3')) {
  customElements.define('grainfather-brew-session-card-v3', GrainfatherBrewSessionCardV3);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'grainfather-brew-session-card-v3',
  name: 'Grainfather Brew Session Card v3',
  description: 'Small light layout with key brew session metrics.',
  preview: false,
  configurable: true,
});
