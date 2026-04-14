import { LitElement, css, html, nothing } from 'https://unpkg.com/lit@3.3.0/index.js?module';

const CARD_I18N = {
  en: {
    abv: 'ABV',
    initial_sg: 'Initial SG',
    final_sg: 'Final SG',
    status: 'Status',
    style: 'Style',
    variant: 'Variant',
    condition_date: 'Condition date',
    fermentation_start: 'Fermentation start',
    fermentation_steps: 'Fermentation steps',
    batch_prefix: '#',
    id_label: 'ID',
    not_found: 'not found.',
    editor_pick_entity: 'Choose a Grainfather batch_number sensor in the card editor.',
    unknown: 'Unknown',
  },
  pl: {
    abv: 'ABV',
    initial_sg: 'Poczatkowe SG',
    final_sg: 'Koncowe SG',
    status: 'Status',
    style: 'Styl',
    variant: 'Wariant',
    condition_date: 'Data lezakowania',
    fermentation_start: 'Start fermentacji',
    fermentation_steps: 'Etapy fermentacji',
    batch_prefix: '#',
    id_label: 'ID',
    not_found: 'nie znaleziono.',
    editor_pick_entity: 'Wybierz sensor Grainfather batch_number w edytorze karty.',
    unknown: 'Nieznany',
  },
};

function _translate(lang, key) {
  const selected = CARD_I18N[lang] || CARD_I18N.en;
  return selected[key] || CARD_I18N.en[key] || key;
}

class GrainfatherBrewSessionCardShowcase extends LitElement {
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
      grid-template-columns: minmax(170px, 31%) 1fr;
      gap: 0;
      min-height: 220px;
    }

    .image-wrap {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-right: 1px solid #d2d9e3;
      background: #eef2f7;
      min-height: 220px;
      padding: 10px;
    }

    .image-wrap img {
      width: 100%;
      height: 100%;
      max-width: none;
      max-height: none;
      min-height: 0;
      object-fit: cover;
      display: block;
      border-radius: 6px;
      filter: saturate(1.02) contrast(1.02);
    }

    .image-fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 220px;
      font-size: 28px;
      background: #dfe6f0;
      color: #3a4a60;
      border-radius: 6px;
      width: 100%;
    }

    .content {
      padding: 12px 14px;
      display: grid;
      grid-template-rows: auto auto auto;
      gap: 6px;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
      border-bottom: 1px solid #ccd4de;
      padding-bottom: 8px;
      margin-bottom: 2px;
    }

    .title {
      margin: 0;
      font-size: clamp(1.08rem, 1.45vw, 1.8rem);
      line-height: 1.18;
      font-weight: 760;
      letter-spacing: 0;
      color: #2d3d53;
      text-wrap: balance;
    }

    .subtitle {
      margin: 0;
      color: #30445f;
      font-size: clamp(0.82rem, 0.95vw, 1rem);
      font-weight: 650;
      line-height: 1.2;
      white-space: normal;
      overflow-wrap: anywhere;
    }

    .status-line {
      display: none;
      justify-content: flex-start;
      align-items: center;
      margin-bottom: 4px;
    }

    .dot-cluster {
      display: none;
      align-items: center;
      gap: 3px;
      opacity: 0.62;
    }

    .dot-cluster span {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: rgba(227, 237, 249, 0.85);
    }

    .dot-cluster span:nth-child(2) {
      width: 7px;
      height: 7px;
      opacity: 0.95;
    }

    .stats {
      display: grid;
      gap: 2px;
      margin-top: 0;
    }

    .stats-main,
    .stats-secondary {
      display: grid;
      gap: 0;
    }

    .stats-main {
      gap: 0;
    }

    .stats-secondary {
      margin-top: 6px;
      padding-top: 2px;
      border-top: 1px solid #ccd4de;
    }

    .stat-row {
      display: grid;
      grid-template-columns: 24px minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
      min-height: 48px;
      border: none;
      border-top: 1px solid #ccd4de;
      border-radius: 0;
      background: transparent;
      padding: 0 6px;
      box-shadow: none;
    }

    .stat-row-secondary {
      min-height: 42px;
      border-top-color: #d5dbe3;
    }

    .stat-row-status .stat-value {
      font-size: clamp(0.8rem, 0.95vw, 1rem);
    }

    .stat-icon {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: transparent;
      color: #374a63;
    }

    .stat-label {
      font-size: clamp(0.86rem, 1.05vw, 1.32rem);
      font-weight: 520;
      color: #31445f;
      white-space: normal;
      line-height: 1.1;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .stat-value {
      font-size: clamp(0.96rem, 1.2vw, 1.45rem);
      font-weight: 760;
      letter-spacing: 0;
      color: #2b3d55;
      white-space: nowrap;
      padding-left: 6px;
      text-align: right;
    }

    .stat-value-text {
      font-size: clamp(0.9rem, 1.02vw, 1.22rem);
      font-weight: 700;
      max-width: 220px;
      white-space: normal;
      line-height: 1.2;
      overflow-wrap: anywhere;
    }

    .status-chip {
      display: inline-flex;
      align-items: center;
      padding: 2px 8px;
      border-radius: 999px;
      border: 1px solid #ccd4de;
      background: #eef2f7;
      color: #31445f;
      font-size: 0.72rem;
      line-height: 1.5;
      font-weight: 700;
      text-transform: capitalize;
      white-space: nowrap;
    }

    .details-area {
      margin-top: 4px;
      display: grid;
      gap: 0;
    }

    .date-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
      border: none;
      border-top: 1px solid #d5dbe3;
      border-radius: 0;
      padding: 8px 6px;
      background: transparent;
    }

    .date-label {
      font-size: 0.92rem;
      color: #31445f;
      font-weight: 560;
    }

    .date-value {
      font-size: 0.96rem;
      color: #2b3d55;
      font-weight: 700;
      text-align: right;
    }

    .steps-box {
      margin-top: 6px;
      border: 1px solid #ccd4de;
      border-radius: 8px;
      background: #f9fafc;
      overflow: hidden;
      max-height: 150px;
      overflow-y: auto;
    }

    .steps-title {
      font-size: 0.84rem;
      letter-spacing: 0.45px;
      text-transform: uppercase;
      color: #2f425d;
      padding: 8px 10px;
      border-bottom: 1px solid #d5dbe3;
    }

    .step-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
      font-size: 0.88rem;
      padding: 8px 10px;
      border-bottom: 1px solid #e0e5ec;
    }

    .step-row:last-child {
      border-bottom: none;
    }

    .step-name {
      color: #30435f;
      font-weight: 600;
    }

    .step-meta {
      color: #344964;
      text-align: right;
      font-size: 0.84rem;
      font-weight: 620;
    }

    .error {
      padding: 16px;
      color: var(--error-color, #ff6b6b);
    }

    @media (max-width: 980px) {
      .shell {
        grid-template-columns: minmax(130px, 28%) 1fr;
      }
    }

    @media (max-width: 760px) {
      .shell {
        grid-template-columns: 1fr;
      }

      .image-wrap {
        border-right: none;
        border-bottom: 1px solid rgba(189, 208, 230, 0.2);
      }

      .image-wrap img,
      .image-fallback {
        min-height: 150px;
      }

      .image-wrap {
        min-height: 150px;
      }

      .content {
        padding: 10px;
      }

      .title {
        font-size: 1rem;
      }

      .subtitle {
        font-size: 0.84rem;
      }

      .stat-row {
        min-height: 42px;
        grid-template-columns: 22px minmax(0, 1fr) auto;
        padding: 0 6px;
      }

      .stat-icon {
        width: 20px;
        height: 20px;
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
          return 'Display the recipe image panel.';
        }
        if (schema.name === 'show_status_dates') {
          return 'Display condition and fermentation start dates.';
        }
        if (schema.name === 'show_fermentation_steps') {
          return 'Display the fermentation steps section.';
        }
        if (schema.name === 'show_batch_variant_name') {
          return 'Display the Batch Variant row.';
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
    const batchNumber = attrs.batch_number ?? entity.state;
    const brewSessionId = attrs.brew_session_id ?? '—';
    const status = attrs.status || this._t('unknown');
    const imageUrl = attrs.recipe_image_url;
    const equipment = attrs.equipment_name || '';
    const batchVariantName = attrs.batch_variant_name || this._stateValue('batch_variant_name', '—');
    const conditionDate = attrs.condition_date ? _showcaseFormatDate(attrs.condition_date) : null;
    const fermStart = attrs.fermentation_start_date ? _showcaseFormatDate(attrs.fermentation_start_date) : null;
    const steps = Array.isArray(attrs.fermentation_steps) ? attrs.fermentation_steps : [];
    const showImage = this._config?.show_image !== false;
    const showStatusDates = this._config?.show_status_dates !== false;
    const showFermentationSteps = this._config?.show_fermentation_steps !== false;
    const showBatchVariantName = this._config?.show_batch_variant_name !== false;

    const abvRaw = this._stateValue('abv');
    const abv = abvRaw !== '—' ? `${abvRaw} %` : '—';
    const og = _formatDecimal(this._stateValue('original_gravity'));
    const fg = _formatDecimal(this._stateValue('final_gravity'));
    const style = this._stateValue('style');
    const hasBatchInTitle = /#\s*\d+/.test(String(sessionName));
    const cardTitle = hasBatchInTitle ? String(sessionName) : String(sessionName);

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
            <div class="header">
              <h2 class="title">${cardTitle}</h2>
              <div class="dot-cluster" aria-hidden="true">
                <span></span><span></span><span></span>
              </div>
            </div>

            <div class="subtitle">
              ${this._t('batch_prefix')}${String(batchNumber)}
              &nbsp;·&nbsp; ${this._t('id_label')}&nbsp;${String(brewSessionId)}
              ${equipment ? html`&nbsp;·&nbsp; ${equipment}` : nothing}
            </div>

            <div class="status-line">
              <span class="status-chip">${status}</span>
            </div>

            <div class="stats">
              <div class="stats-main">
                <div class="stat-row">
                  <div class="stat-icon">${_iconPercent()}</div>
                  <div class="stat-label">${this._t('abv')}:</div>
                  <div class="stat-value">${abv}</div>
                </div>

                <div class="stat-row">
                  <div class="stat-icon">${_iconThermometer()}</div>
                  <div class="stat-label">${this._t('initial_sg')}:</div>
                  <div class="stat-value">${og}</div>
                </div>

                <div class="stat-row">
                  <div class="stat-icon">${_iconDrop()}</div>
                  <div class="stat-label">${this._t('final_sg')}:</div>
                  <div class="stat-value">${fg}</div>
                </div>

                <div class="stat-row stat-row-status">
                  <div class="stat-icon">${_iconFlask()}</div>
                  <div class="stat-label">${this._t('status')}:</div>
                  <div class="stat-value stat-value-text">${status}</div>
                </div>
              </div>

              ${style !== '—' || showBatchVariantName
                ? html`
                    <div class="stats-secondary">
                      ${style !== '—'
                        ? html`
                            <div class="stat-row stat-row-secondary">
                              <div class="stat-icon">${_iconPercent()}</div>
                              <div class="stat-label">${this._t('style')}:</div>
                              <div class="stat-value stat-value-text">${style}</div>
                            </div>
                          `
                        : nothing}

                      ${showBatchVariantName
                        ? html`
                            <div class="stat-row stat-row-secondary">
                              <div class="stat-icon">${_iconDrop()}</div>
                              <div class="stat-label">${this._t('variant')}:</div>
                              <div class="stat-value stat-value-text">${batchVariantName}</div>
                            </div>
                          `
                        : nothing}
                    </div>
                  `
                : nothing}
            </div>

            ${(showStatusDates && (conditionDate || fermStart)) || (showFermentationSteps && steps.length > 0)
              ? html`
                  <div class="details-area">
                    ${showStatusDates && conditionDate
                      ? html`
                          <div class="date-row">
                            <span class="date-label">${this._t('condition_date')}</span>
                            <span class="date-value">${conditionDate}</span>
                          </div>
                        `
                      : nothing}

                    ${showStatusDates && fermStart
                      ? html`
                          <div class="date-row">
                            <span class="date-label">${this._t('fermentation_start')}</span>
                            <span class="date-value">${fermStart}</span>
                          </div>
                        `
                      : nothing}

                    ${showFermentationSteps && steps.length > 0
                      ? html`
                          <div class="steps-box">
                            <div class="steps-title">${this._t('fermentation_steps')}</div>
                            ${steps.map((step) => html`
                              <div class="step-row">
                                <span class="step-name">${step.name || `Step ${(step.index ?? 0) + 1}`}</span>
                                <span class="step-meta">${_showcaseStepMeta(step)}</span>
                              </div>
                            `)}
                          </div>
                        `
                      : nothing}
                  </div>
                `
              : nothing}
          </div>
        </div>
      </ha-card>
    `;
  }
}

function _showcaseFormatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return iso;
  }
}

function _showcaseStepMeta(step) {
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

if (!customElements.get('grainfather-brew-session-card-showcase')) {
  customElements.define('grainfather-brew-session-card-showcase', GrainfatherBrewSessionCardShowcase);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'grainfather-brew-session-card-showcase',
  name: 'Grainfather Brew Session Showcase',
  description: 'Dark showcase layout for a Grainfather brew session.',
  preview: false,
  configurable: true,
});
