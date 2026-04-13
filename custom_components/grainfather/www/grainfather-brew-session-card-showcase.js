import { LitElement, css, html, nothing } from 'https://unpkg.com/lit@3.3.0/index.js?module';

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
      border-radius: 22px;
      border: 1px solid rgba(195, 210, 228, 0.28);
      background:
        radial-gradient(140% 120% at 10% 0%, rgba(68, 93, 122, 0.35), rgba(14, 23, 37, 0.85) 55%),
        linear-gradient(170deg, #1d2c41 0%, #132033 65%, #0c1728 100%);
      box-shadow:
        0 20px 48px rgba(2, 7, 14, 0.5),
        inset 0 1px 0 rgba(255, 255, 255, 0.08);
      color: #ecf2fb;
    }

    .shell {
      display: grid;
      grid-template-columns: minmax(150px, 33%) 1fr;
      gap: 0;
      min-height: 270px;
    }

    .image-wrap {
      position: relative;
      overflow: hidden;
      border-right: 1px solid rgba(189, 208, 230, 0.2);
      background: rgba(13, 22, 34, 0.8);
    }

    .image-wrap img {
      width: 100%;
      height: 100%;
      min-height: 270px;
      object-fit: cover;
      display: block;
      filter: saturate(1.07) contrast(1.04);
    }

    .image-fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 270px;
      font-size: 54px;
      background:
        radial-gradient(120% 100% at 30% 20%, rgba(255, 190, 117, 0.3), rgba(16, 25, 39, 0.9)),
        linear-gradient(145deg, rgba(56, 77, 102, 0.75), rgba(16, 28, 43, 0.95));
    }

    .content {
      padding: 12px 14px 0;
      display: grid;
      grid-template-rows: auto auto auto;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      border-bottom: 1px solid rgba(197, 213, 233, 0.45);
      padding-bottom: 10px;
      margin-bottom: 6px;
    }

    .title {
      margin: 0;
      font-size: clamp(1.05rem, 1.7vw, 1.8rem);
      line-height: 1.1;
      font-weight: 650;
      letter-spacing: 0.2px;
      color: #f0f5fd;
      text-wrap: balance;
    }

    .subtitle {
      margin: 2px 0 6px;
      color: rgba(225, 238, 255, 0.8);
      font-size: clamp(0.75rem, 0.95vw, 0.92rem);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .status-line {
      display: flex;
      justify-content: flex-start;
      align-items: center;
      margin-bottom: 6px;
    }

    .dot-cluster {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      opacity: 0.75;
    }

    .dot-cluster span {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: rgba(227, 237, 249, 0.85);
    }

    .dot-cluster span:nth-child(2) {
      width: 14px;
      height: 14px;
      opacity: 0.95;
    }

    .stats {
      display: grid;
      gap: 6px;
      margin-top: 6px;
    }

    .stat-row {
      display: grid;
      grid-template-columns: 34px minmax(0, 1fr) auto;
      gap: 8px;
      align-items: center;
      min-height: 52px;
      border: 1px solid rgba(183, 205, 233, 0.2);
      border-radius: 12px;
      background:
        linear-gradient(180deg, rgba(33, 51, 75, 0.6), rgba(18, 33, 52, 0.62));
      padding: 0 10px;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
    }

    .stat-icon {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      background: rgba(193, 212, 236, 0.16);
      color: #f0f5fd;
    }

    .stat-label {
      font-size: clamp(0.86rem, 1.1vw, 1.2rem);
      font-weight: 500;
      color: rgba(238, 245, 255, 0.96);
      white-space: normal;
      line-height: 1.15;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .stat-value {
      font-size: clamp(1rem, 1.55vw, 1.8rem);
      font-weight: 720;
      letter-spacing: 0.25px;
      color: #ffffff;
      white-space: nowrap;
      padding-left: 6px;
      text-align: right;
    }

    .stat-value-text {
      font-size: clamp(0.84rem, 1.05vw, 1.15rem);
      font-weight: 650;
      max-width: 160px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .status-chip {
      display: inline-flex;
      align-items: center;
      padding: 1px 7px;
      border-radius: 999px;
      border: 1px solid rgba(215, 230, 247, 0.24);
      background: rgba(34, 51, 73, 0.55);
      color: #e8f2ff;
      font-size: 0.74rem;
      text-transform: capitalize;
      white-space: nowrap;
    }

    .details-area {
      margin-top: 10px;
      display: grid;
      gap: 6px;
    }

    .date-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      border: 1px solid rgba(183, 205, 233, 0.16);
      border-radius: 10px;
      padding: 6px 10px;
      background: rgba(16, 30, 48, 0.45);
    }

    .date-label {
      font-size: 0.82rem;
      color: rgba(228, 238, 251, 0.88);
    }

    .date-value {
      font-size: 0.82rem;
      color: #ffffff;
      font-weight: 650;
      text-align: right;
    }

    .steps-box {
      margin-top: 2px;
      border: 1px solid rgba(183, 205, 233, 0.16);
      border-radius: 10px;
      background: rgba(12, 24, 40, 0.44);
      overflow: hidden;
    }

    .steps-title {
      font-size: 0.7rem;
      letter-spacing: 0.6px;
      text-transform: uppercase;
      color: rgba(216, 230, 246, 0.84);
      padding: 7px 10px;
      border-bottom: 1px solid rgba(183, 205, 233, 0.16);
    }

    .step-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      font-size: 0.78rem;
      padding: 6px 10px;
      border-bottom: 1px solid rgba(183, 205, 233, 0.12);
    }

    .step-row:last-child {
      border-bottom: none;
    }

    .step-name {
      color: rgba(236, 243, 253, 0.95);
      font-weight: 500;
    }

    .step-meta {
      color: rgba(211, 225, 243, 0.88);
      text-align: right;
      font-size: 0.75rem;
    }

    .error {
      padding: 16px;
      color: var(--error-color, #ff6b6b);
    }

    @media (max-width: 980px) {
      .shell {
        grid-template-columns: minmax(120px, 30%) 1fr;
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
        min-height: 180px;
      }

      .content {
        padding: 10px 10px 0;
      }

      .title {
        font-size: 1.02rem;
      }

      .subtitle {
        font-size: 0.73rem;
      }

      .stat-row {
        min-height: 48px;
        grid-template-columns: 30px minmax(0, 1fr) auto;
        padding: 0 8px;
      }

      .stat-icon {
        width: 26px;
        height: 26px;
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
              #${String(batchNumber)}
              &nbsp;·&nbsp; ID&nbsp;${String(brewSessionId)}
              ${equipment ? html`&nbsp;·&nbsp; ${equipment}` : nothing}
            </div>

            <div class="status-line">
              <span class="status-chip">${status}</span>
            </div>

            <div class="stats">
              <div class="stat-row">
                <div class="stat-icon">${_iconPercent()}</div>
                <div class="stat-label">ABV:</div>
                <div class="stat-value">${abv}</div>
              </div>

              <div class="stat-row">
                <div class="stat-icon">${_iconThermometer()}</div>
                <div class="stat-label">OG:</div>
                <div class="stat-value">${og}</div>
              </div>

              <div class="stat-row">
                <div class="stat-icon">${_iconDrop()}</div>
                <div class="stat-label">FG:</div>
                <div class="stat-value">${fg}</div>
              </div>

              ${style !== '—'
                ? html`
                    <div class="stat-row">
                      <div class="stat-icon">${_iconPercent()}</div>
                      <div class="stat-label">Style:</div>
                      <div class="stat-value stat-value-text">${style}</div>
                    </div>
                  `
                : nothing}

              ${showBatchVariantName
                ? html`
                    <div class="stat-row">
                      <div class="stat-icon">${_iconDrop()}</div>
                      <div class="stat-label">Variant:</div>
                      <div class="stat-value stat-value-text">${batchVariantName}</div>
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
                            <span class="date-label">Condition date</span>
                            <span class="date-value">${conditionDate}</span>
                          </div>
                        `
                      : nothing}

                    ${showStatusDates && fermStart
                      ? html`
                          <div class="date-row">
                            <span class="date-label">Fermentation start</span>
                            <span class="date-value">${fermStart}</span>
                          </div>
                        `
                      : nothing}

                    ${showFermentationSteps && steps.length > 0
                      ? html`
                          <div class="steps-box">
                            <div class="steps-title">Fermentation steps</div>
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
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <line x1="19" y1="5" x2="5" y2="19"></line>
      <circle cx="6.5" cy="6.5" r="2.5"></circle>
      <circle cx="17.5" cy="17.5" r="2.5"></circle>
    </svg>
  `;
}

function _iconThermometer() {
  return html`
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M14 14.76V5a2 2 0 0 0-4 0v9.76a4 4 0 1 0 4 0z"></path>
    </svg>
  `;
}

function _iconDrop() {
  return html`
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <path d="M12 2.7c-.2.24-5.82 6.95-5.82 10.86A5.82 5.82 0 0 0 12 19.38a5.82 5.82 0 0 0 5.82-5.82C17.82 9.65 12.2 2.94 12 2.7z"></path>
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
