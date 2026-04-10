'use strict';

/**
 * Grainfather Brew Session Card
 *
 * Config:
 *   type: custom:grainfather-brew-session-card
 *   entity: sensor.<device>_batch_number
 *
 * The card reads all brew session data from the batch_number sensor attributes
 * and derives related entity IDs (abv, og, fg, style) by replacing the suffix.
 */
class GrainfatherBrewSessionCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = null;
    this._hass = null;
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error('Please define an entity (the batch_number sensor of a brew session)');
    }
    if (!config.entity.endsWith('_batch_number')) {
      throw new Error('Entity must be a batch_number sensor (entity id must end with _batch_number)');
    }
    this._config = config;
    if (this._hass) this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 5;
  }

  /** Returns the entity from hass by replacing the sensor suffix. */
  _related(suffix) {
    const base = this._config.entity.slice(0, -'_batch_number'.length);
    return this._hass.states[`${base}_${suffix}`];
  }

  _stateValue(suffix, fallback = '—') {
    const e = this._related(suffix);
    if (!e || e.state === 'unavailable' || e.state === 'unknown') return fallback;
    return e.state;
  }

  _render() {
    if (!this._hass || !this._config) return;

    const entityId = this._config.entity;
    const entity = this._hass.states[entityId];

    if (!entity) {
      this.shadowRoot.innerHTML = `
        <ha-card>
          <div class="error">Entity <code>${entityId}</code> not found.</div>
        </ha-card>`;
      return;
    }

    const a = entity.attributes;
    const sessionName = a.session_name || a.recipe_name || '—';
    const batchNumber = a.batch_number ?? entity.state;
    const brewSessionId = a.brew_session_id ?? '—';
    const status = a.status || 'unknown';
    const imageUrl = a.recipe_image_url;
    const equipment = a.equipment_name || '';
    const conditionDate = a.condition_date ? _formatDate(a.condition_date) : null;
    const fermStart = a.fermentation_start_date ? _formatDate(a.fermentation_start_date) : null;
    const steps = Array.isArray(a.fermentation_steps) ? a.fermentation_steps : [];

    const abvRaw = this._stateValue('abv');
    const abv = abvRaw !== '—' ? `${abvRaw} %vol` : '—';
    const og = this._stateValue('original_gravity');
    const fg = this._stateValue('final_gravity');
    const style = this._stateValue('style');
    const variant = this._stateValue('batch_variant_name');

    const statusColor = STATUS_COLORS[status] || '#9e9e9e';

    this.shadowRoot.innerHTML = `
      <style>
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
          background: ${statusColor};
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
        }
        .step-row:last-child { border-bottom: none; }
        .step-name { color: var(--primary-text-color); font-weight: 500; }
        .step-meta { color: var(--secondary-text-color); font-size: 0.75rem; }

        .error {
          padding: 16px;
          color: var(--error-color, red);
        }
      </style>

      <ha-card>
        <div class="banner">
          ${imageUrl
            ? `<img src="${_escapeHtml(imageUrl)}" alt="Recipe image" />`
            : `<div class="banner-placeholder">🍺</div>`}
          <div class="status-badge">${_escapeHtml(status)}</div>
        </div>

        <div class="body">
          <div class="title">${_escapeHtml(sessionName)}</div>
          <div class="subtitle">
            #${_escapeHtml(String(batchNumber))}
            &nbsp;·&nbsp; ID&nbsp;${_escapeHtml(String(brewSessionId))}
            ${equipment ? `&nbsp;·&nbsp; ${_escapeHtml(equipment)}` : ''}
          </div>

          <div class="stats">
            <div class="stat">
              <div class="stat-label">ABV</div>
              <div class="stat-value">${_escapeHtml(abv)}</div>
            </div>
            <div class="stat">
              <div class="stat-label">OG</div>
              <div class="stat-value">${_escapeHtml(og)}</div>
            </div>
            <div class="stat">
              <div class="stat-label">FG</div>
              <div class="stat-value">${_escapeHtml(fg)}</div>
            </div>
            ${style !== '—' ? `
            <div class="stat">
              <div class="stat-label">Style</div>
              <div class="stat-value small">${_escapeHtml(style)}</div>
            </div>` : ''}
            ${variant !== '—' ? `
            <div class="stat">
              <div class="stat-label">Variant</div>
              <div class="stat-value small">${_escapeHtml(variant)}</div>
            </div>` : ''}
          </div>

          ${conditionDate || fermStart ? `
          <div>
            ${conditionDate ? `
            <div class="meta-row">
              <span class="meta-label">Condition date</span>
              <span class="meta-value">${conditionDate}</span>
            </div>` : ''}
            ${fermStart ? `
            <div class="meta-row">
              <span class="meta-label">Fermentation start</span>
              <span class="meta-value">${fermStart}</span>
            </div>` : ''}
          </div>` : ''}

          ${steps.length > 0 ? `
          <hr class="divider" />
          <div class="section-title">Fermentation steps</div>
          ${steps.map(s => `
            <div class="step-row">
              <span class="step-name">${_escapeHtml(s.name || `Step ${s.index + 1}`)}</span>
              <span class="step-meta">
                ${s.temperature != null ? _escapeHtml(String(s.temperature)) + ' °C' : ''}
                ${s.duration_minutes != null ? '· ' + Math.round(s.duration_minutes / 60) + ' h' : ''}
                ${s.is_ramp_step ? '· ramp' : ''}
              </span>
            </div>`).join('')}
          ` : ''}
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

function _escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

customElements.define('grainfather-brew-session-card', GrainfatherBrewSessionCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'grainfather-brew-session-card',
  name: 'Grainfather Brew Session',
  description: 'Shows basic information for a Grainfather brew session.',
  preview: false,
});
