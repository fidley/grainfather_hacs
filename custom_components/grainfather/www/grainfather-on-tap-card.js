import { LitElement, css, html } from 'https://unpkg.com/lit@3.3.0/index.js?module';

const I18N = {
  en: {
    title: 'On Tap',
    empty: 'No beers are currently serving.',
    batch_name_unknown: 'Unnamed batch',
    style_unknown: 'Unknown style',
  },
  pl: {
    title: 'On Tap',
    empty: 'Aktualnie nic nie jest serwowane.',
    batch_name_unknown: 'Nienazwana warka',
    style_unknown: 'Nieznany styl',
  },
};

class GrainfatherOnTapCard extends LitElement {
  static properties = {
    hass: { attribute: false },
    _config: { state: true },
  };

  static styles = css`
    :host {
      display: block;
    }

    ha-card {
      overflow: hidden;
      border-radius: 14px;
      border: 1px solid #6f6a57;
      background:
        radial-gradient(circle at 12% 15%, rgba(255, 255, 255, 0.05) 0 8%, transparent 9%),
        radial-gradient(circle at 88% 80%, rgba(255, 255, 255, 0.04) 0 10%, transparent 11%),
        linear-gradient(160deg, #212121 0%, #131313 45%, #1b1b1b 100%);
      box-shadow: 0 12px 24px rgba(0, 0, 0, 0.34), inset 0 0 0 2px rgba(255, 255, 255, 0.03);
      color: #f4efe3;
      position: relative;
    }

    .board {
      padding: 14px 16px 16px;
      position: relative;
      isolation: isolate;
    }

    .board::after {
      content: '';
      position: absolute;
      inset: 0;
      pointer-events: none;
      background: repeating-linear-gradient(
        -10deg,
        transparent 0,
        transparent 22px,
        rgba(255, 255, 255, 0.012) 22px,
        rgba(255, 255, 255, 0.012) 23px
      );
      z-index: -1;
    }

    .title {
      margin: 0 0 10px;
      font-size: clamp(1.22rem, 2.6vw, 1.9rem);
      line-height: 1.1;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      font-family: 'Chalkduster', 'Segoe Print', 'Bradley Hand', cursive;
      color: #f2f0df;
      text-shadow: 0 1px 0 rgba(255, 255, 255, 0.11), 0 0 6px rgba(255, 255, 255, 0.2);
    }

    .list {
      display: grid;
      gap: 5px;
    }

    .line {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: baseline;
      gap: 8px;
      min-height: 30px;
      border-bottom: 1px dashed rgba(255, 255, 255, 0.11);
      padding-bottom: 4px;
    }

    .line:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .no {
      min-width: 2.2ch;
      font-family: 'Chalkduster', 'Segoe Print', 'Bradley Hand', cursive;
      font-size: clamp(1.08rem, 2vw, 1.42rem);
      color: #f6f2e8;
      font-weight: 700;
      text-shadow: 0 0 4px rgba(255, 255, 255, 0.28);
    }

    .style {
      font-family: 'Chalkduster', 'Segoe Print', 'Bradley Hand', cursive;
      font-size: clamp(1rem, 1.8vw, 1.35rem);
      line-height: 1.2;
      letter-spacing: 0.01em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      text-shadow: 0 0 3px rgba(255, 255, 255, 0.18);
    }

    .abv {
      font-family: 'Chalkduster', 'Segoe Print', 'Bradley Hand', cursive;
      font-size: clamp(0.94rem, 1.7vw, 1.2rem);
      white-space: nowrap;
      text-shadow: 0 0 3px rgba(255, 255, 255, 0.16);
      color: #f8e8a2;
    }

    .empty {
      padding: 8px 0 4px;
      font-family: 'Chalkduster', 'Segoe Print', 'Bradley Hand', cursive;
      color: #ded8c4;
      text-shadow: 0 0 2px rgba(255, 255, 255, 0.16);
      opacity: 0.9;
    }

    .chalk-white {
      color: #f6f2e8;
    }

    .chalk-yellow {
      color: #f8dc7f;
    }

    .chalk-blue {
      color: #9fd2ff;
    }

    .chalk-mint {
      color: #9ce7cc;
    }

    .chalk-pink {
      color: #f7b9cd;
    }

    .chalk-orange {
      color: #ffbf8a;
    }

    @media (max-width: 520px) {
      .board {
        padding: 12px 12px 13px;
      }

      .line {
        gap: 6px;
      }
    }
  `;

  constructor() {
    super();
    this.hass = undefined;
    this._config = {};
  }

  setConfig(config) {
    this._config = {
      max_items: 12,
      ...(config || {}),
    };

    if (this._config.max_items !== undefined) {
      const n = Number(this._config.max_items);
      if (!Number.isFinite(n) || n < 1) {
        throw new Error('max_items must be a positive number.');
      }
      this._config.max_items = Math.floor(n);
    }
  }

  set config(config) {
    this.setConfig(config);
  }

  static getStubConfig() {
    return {
      max_items: 12,
    };
  }

  static getConfigForm() {
    return {
      schema: [
        {
          name: 'max_items',
          required: false,
          selector: {
            number: {
              min: 1,
              max: 50,
              step: 1,
              mode: 'box',
            },
          },
        },
      ],
      computeLabel: (schema) => {
        if (schema.name === 'max_items') return 'Max beers shown';
        return undefined;
      },
      computeHelper: (schema) => {
        if (schema.name === 'max_items') return 'Limit the number of serving beers listed on the board.';
        return undefined;
      },
    };
  }

  getCardSize() {
    return 4;
  }

  getGridOptions() {
    return {
      columns: 'full',
    };
  }

  _lang() {
    const raw = String(this.hass?.language || 'en').toLowerCase();
    const short = raw.split('-')[0];
    return I18N[short] ? short : 'en';
  }

  _t(key) {
    return (I18N[this._lang()] || I18N.en)[key] || I18N.en[key] || key;
  }

  _formatAbv(raw) {
    if (raw == null || raw === 'unknown' || raw === 'unavailable') {
      return '—';
    }

    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) {
      return String(raw);
    }

    return `${parsed.toFixed(1)}%`;
  }

  _normalizeBatchNumber(raw) {
    if (raw == null || raw === '' || raw === 'unknown' || raw === 'unavailable') {
      return '—';
    }

    const parsed = Number.parseInt(String(raw), 10);
    if (Number.isFinite(parsed)) {
      return String(parsed);
    }

    return String(raw);
  }

  _collectServingRows() {
    if (!this.hass?.states) {
      return [];
    }

    const rows = [];
    for (const [entityId, stateObj] of Object.entries(this.hass.states)) {
      if (!entityId.endsWith('_batch_number')) continue;

      const attrs = stateObj.attributes || {};
      if (attrs.grainfather_entity_type !== 'brew_session') continue;

      const status = String(attrs.status || '').toLowerCase();
      if (status !== 'serving') continue;

      const base = entityId.slice(0, -'_batch_number'.length);
      const styleEntity = this.hass.states[`${base}_style`];
      const abvEntity = this.hass.states[`${base}_abv`];
      const batchNumber = this._normalizeBatchNumber(attrs.batch_number ?? stateObj.state);
      const batchName = attrs.session_name || attrs.recipe_name || this._t('batch_name_unknown');
      const style = _safeState(styleEntity) || this._t('style_unknown');
      const abv = this._formatAbv(_safeState(abvEntity));

      rows.push({
        entityId,
        batchNumber,
        batchName,
        style,
        abv,
      });
    }

    rows.sort((a, b) => {
      const aNum = Number.parseInt(a.batchNumber, 10);
      const bNum = Number.parseInt(b.batchNumber, 10);
      if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) {
        return aNum - bNum;
      }
      return a.entityId.localeCompare(b.entityId);
    });

    // If a batch has multiple variants, keep only the first row encountered for that batch number.
    const uniqueByBatch = [];
    const seen = new Set();
    for (const row of rows) {
      const key = `batch:${row.batchNumber}`;
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueByBatch.push(row);
    }

    const maxItems = Number(this._config?.max_items) || 12;
    return uniqueByBatch.slice(0, maxItems);
  }

  _chalkClass(index) {
    const palette = ['chalk-white', 'chalk-yellow', 'chalk-blue', 'chalk-mint', 'chalk-pink', 'chalk-orange'];
    return palette[index % palette.length];
  }

  render() {
    const rows = this._collectServingRows();

    return html`
      <ha-card>
        <div class="board">
          <h2 class="title">${this._t('title')}</h2>

          ${rows.length === 0
            ? html`<div class="empty">${this._t('empty')}</div>`
            : html`
                <div class="list">
                  ${rows.map(
                    (row, index) => html`
                      <div class="line">
                        <span class="no chalk-white">${index + 1}.</span>
                        <span class="style ${this._chalkClass(index)}">${row.batchName} (${row.style})</span>
                        <span class="abv">- ${row.abv}</span>
                      </div>
                    `,
                  )}
                </div>
              `}
        </div>
      </ha-card>
    `;
  }
}

function _safeState(entity) {
  if (!entity) return undefined;
  if (entity.state === 'unknown' || entity.state === 'unavailable') return undefined;
  return entity.state;
}

if (!customElements.get('grainfather-on-tap-card')) {
  customElements.define('grainfather-on-tap-card', GrainfatherOnTapCard);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'grainfather-on-tap-card',
  name: 'Grainfather On Tap Card',
  description: 'Pub-style blackboard card listing only serving beers.',
  preview: false,
  configurable: true,
});
