const I18N = {
  en: {
    title: 'On Tap',
    coming_soon_title: 'Comming Soon',
    empty: 'No beers are currently serving.',
    empty_coming_soon: 'No beers are currently brewing or fermenting.',
    no_coming_soon_statuses_enabled: 'No statuses selected for Comming Soon.',
    no_sections_enabled: 'Enable at least one section in card configuration.',
    batch_name_unknown: 'Unnamed batch',
    style_unknown: 'Unknown style',
  },
  pl: {
    title: 'On Tap',
    coming_soon_title: 'Comming Soon',
    empty: 'Aktualnie nic nie jest serwowane.',
    empty_coming_soon: 'Aktualnie nic nie jest w warzeniu ani fermentacji.',
    no_coming_soon_statuses_enabled: 'Nie wybrano statusow dla sekcji Comming Soon.',
    no_sections_enabled: 'Wlacz przynajmniej jedna sekcje w konfiguracji karty.',
    batch_name_unknown: 'Nienazwana warka',
    style_unknown: 'Nieznany styl',
  },
};

class GrainfatherOnTapCard extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._config = {
      density_unit: 'sg',
      max_items: 12,
      show_on_tap: true,
      show_coming_soon: true,
      show_notes: false,
      coming_soon_show_brewing: true,
      coming_soon_show_fermenting: true,
      coming_soon_show_conditioning: true,
    };
    this.attachShadow({ mode: 'open' });
  }

  set hass(value) {
    this._hass = value;
    try {
      this._render();
    } catch (error) {
      console.error('Grainfather On Tap Card render error:', error);
      this._renderError(error);
    }
  }

  setConfig(config) {
    try {
      const merged = Object.assign({
        density_unit: 'sg',
        max_items: 12,
        show_on_tap: true,
        show_coming_soon: true,
        show_notes: false,
        coming_soon_show_brewing: true,
        coming_soon_show_fermenting: true,
        coming_soon_show_conditioning: true,
      }, config || {});

      merged.show_on_tap = merged.show_on_tap !== false;
      merged.show_coming_soon = merged.show_coming_soon !== false;
      merged.show_notes = merged.show_notes === true;
      merged.coming_soon_show_brewing = merged.coming_soon_show_brewing !== false;
      merged.coming_soon_show_fermenting = merged.coming_soon_show_fermenting !== false;
      merged.coming_soon_show_conditioning = merged.coming_soon_show_conditioning !== false;
      merged.density_unit = _normalizeDensityUnit(merged.density_unit);

      if (merged.max_items !== undefined) {
        const n = Number(merged.max_items);
        if (!Number.isFinite(n) || n < 1) {
          throw new Error('max_items must be a positive number.');
        }
        merged.max_items = Math.floor(n);
      }
      this._config = merged;
      this._render();
    } catch (error) {
      console.error('Grainfather On Tap Card config error:', error);
      this._renderError(error);
    }
  }

  static getStubConfig() {
    return {
      density_unit: 'sg',
      max_items: 12,
      show_on_tap: true,
      show_coming_soon: true,
      show_notes: false,
      coming_soon_show_brewing: true,
      coming_soon_show_fermenting: true,
      coming_soon_show_conditioning: true,
    };
  }

  static getConfigForm() {
    return {
      schema: [
        {
          name: 'density_unit',
          required: false,
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
        {
          name: 'show_on_tap',
          required: false,
          default: true,
          selector: {
            boolean: {},
          },
        },
        {
          name: 'show_coming_soon',
          required: false,
          default: true,
          selector: {
            boolean: {},
          },
        },
        {
          name: 'show_notes',
          required: false,
          default: false,
          selector: {
            boolean: {},
          },
        },
        {
          name: 'coming_soon_show_brewing',
          required: false,
          default: true,
          selector: {
            boolean: {},
          },
        },
        {
          name: 'coming_soon_show_fermenting',
          required: false,
          default: true,
          selector: {
            boolean: {},
          },
        },
        {
          name: 'coming_soon_show_conditioning',
          required: false,
          default: true,
          selector: {
            boolean: {},
          },
        },
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
        if (schema.name === 'density_unit') return 'Density unit';
        if (schema.name === 'show_on_tap') return 'Show On Tap';
        if (schema.name === 'show_coming_soon') return 'Show Comming Soon';
        if (schema.name === 'show_notes') return 'Show notes';
        if (schema.name === 'coming_soon_show_brewing') return 'Comming Soon: show brewing';
        if (schema.name === 'coming_soon_show_fermenting') return 'Comming Soon: show fermenting';
        if (schema.name === 'coming_soon_show_conditioning') return 'Comming Soon: show conditioning';
        if (schema.name === 'max_items') return 'Max beers shown';
        return undefined;
      },
      computeHelper: (schema) => {
        if (schema.name === 'density_unit') return 'Display gravity values as SG, Plato, or Brix.';
        if (schema.name === 'show_on_tap') return 'Display beers with serving status.';
        if (schema.name === 'show_coming_soon') return 'Display beers with brewing and fermenting statuses.';
        if (schema.name === 'show_notes') return 'Display notes from brew session payload when available.';
        if (schema.name === 'coming_soon_show_brewing') return 'Include brewing status in Comming Soon section.';
        if (schema.name === 'coming_soon_show_fermenting') return 'Include fermenting status in Comming Soon section.';
        if (schema.name === 'coming_soon_show_conditioning') return 'Include conditioning status in Comming Soon section.';
        if (schema.name === 'max_items') return 'Limit the number of serving beers listed on the board.';
        return undefined;
      },
    };
  }

  getCardSize() {
    return 4;
  }

  getGridOptions() {
    return { columns: 'full' };
  }

  _lang() {
    const hassLang = this._hass && this._hass.language ? String(this._hass.language) : 'en';
    const short = hassLang.toLowerCase().split('-')[0];
    return I18N[short] ? short : 'en';
  }

  _renderError(error) {
    if (!this.shadowRoot) return;
    const errorMsg = error && error.message ? error.message : 'Unknown error occurred';
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        ha-card {
          border-radius: 14px;
          border: 1px solid #ff6b6b;
          background: linear-gradient(160deg, #2a1f1f 0%, #1a0f0f 100%);
          box-shadow: 0 12px 24px rgba(0, 0, 0, 0.34);
          padding: 16px;
          color: #f4efe3;
        }
        .error-content {
          text-align: center;
        }
        .error-title {
          font-size: 1.2rem;
          font-weight: bold;
          color: #ff9999;
          margin-bottom: 8px;
        }
        .error-message {
          font-size: 0.9rem;
          color: #ddd;
          margin-bottom: 12px;
          font-family: monospace;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .refresh-hint {
          font-size: 0.85rem;
          color: #b0b0b0;
        }
      </style>
      <ha-card>
        <div class="error-content">
          <div class="error-title">Configuration Error</div>
          <div class="error-message">${_escapeHtml(errorMsg)}</div>
          <div class="refresh-hint">Try refreshing the page or reloading the dashboard.</div>
        </div>
      </ha-card>
    `;
  }

  _t(key) {
    const pack = I18N[this._lang()] || I18N.en;
    return pack[key] || I18N.en[key] || key;
  }

  _formatAbv(raw) {
    if (raw == null || raw === 'unknown' || raw === 'unavailable') {
      return '-';
    }
    const parsed = Number.parseFloat(raw);
    if (!Number.isFinite(parsed)) {
      return String(raw);
    }
    return `${parsed.toFixed(1)}%`;
  }

  _normalizeBatchNumber(raw) {
    if (raw == null || raw === '' || raw === 'unknown' || raw === 'unavailable') {
      return '-';
    }
    const parsed = Number.parseInt(String(raw), 10);
    if (Number.isFinite(parsed)) {
      return String(parsed);
    }
    return String(raw);
  }

  _collectRowsByStatuses(statuses) {
    try {
      if (!this._hass || !this._hass.states || typeof this._hass.states !== 'object') {
        return [];
      }

      const densityUnit = _normalizeDensityUnit(this._config && this._config.density_unit);
      const allowedStatuses = new Set((statuses || []).map((value) => String(value).toLowerCase()));
      const rows = [];
      const states = this._hass.states;

      for (const entityId of Object.keys(states || {})) {
        if (!entityId.endsWith('_batch_number')) continue;

        const stateObj = states[entityId];
        if (!stateObj) continue;
        
        const attrs = stateObj && stateObj.attributes ? stateObj.attributes : {};
        if (attrs.grainfather_entity_type !== 'brew_session') continue;

        const status = String(attrs.status || '').toLowerCase();
        if (!allowedStatuses.has(status)) continue;

        const base = entityId.slice(0, -'_batch_number'.length);
        const styleEntity = states[`${base}_style`];
        const abvEntity = states[`${base}_abv`];
        const originalGravityEntity = states[`${base}_original_gravity`];
        const batchNumber = this._normalizeBatchNumber(attrs.batch_number != null ? attrs.batch_number : stateObj.state);
        const batchName = attrs.session_name || attrs.recipe_name || this._t('batch_name_unknown');
        const style = _safeState(styleEntity) || this._t('style_unknown');
        const abv = this._formatAbv(_safeState(abvEntity));
        const originalGravity = _formatGravityFromSg(_safeState(originalGravityEntity), densityUnit, true);
        const notes = attrs.notes != null ? String(attrs.notes).trim() : '';

        rows.push({ entityId, batchNumber, batchName, style, abv, originalGravity, notes });
      }

      rows.sort((a, b) => {
        const aNum = Number.parseInt(a.batchNumber, 10);
        const bNum = Number.parseInt(b.batchNumber, 10);
        if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) {
          return aNum - bNum;
        }
        return a.entityId.localeCompare(b.entityId);
      });

      const uniqueByBatch = [];
      const seen = new Set();
      for (const row of rows) {
        const key = `batch:${row.batchNumber}|name:${String(row.batchName).trim().toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        uniqueByBatch.push(row);
      }

      const maxItems = Number(this._config && this._config.max_items) || 12;
      return uniqueByBatch.slice(0, maxItems);
    } catch (error) {
      console.error('Error collecting rows:', error);
      return [];
    }
  }

  _chalkClass(index) {
    const palette = ['chalk-white', 'chalk-yellow', 'chalk-blue', 'chalk-mint', 'chalk-pink', 'chalk-orange'];
    return palette[index % palette.length];
  }

  _render() {
    try {
      if (!this.shadowRoot) return;

      const showOnTap = this._config && this._config.show_on_tap !== false;
      const showCommingSoon = this._config && this._config.show_coming_soon !== false;
      const showNotes = this._config && this._config.show_notes === true;

      const comingSoonStatuses = [];
      if (this._config && this._config.coming_soon_show_brewing !== false) {
        comingSoonStatuses.push('brewing');
      }
      if (this._config && this._config.coming_soon_show_fermenting !== false) {
        comingSoonStatuses.push('fermenting');
      }
      if (this._config && this._config.coming_soon_show_conditioning !== false) {
        comingSoonStatuses.push('conditioning');
      }

      const onTapRows = showOnTap ? this._collectRowsByStatuses(['serving']) : [];
      const commingSoonRows = showCommingSoon
        ? this._collectRowsByStatuses(comingSoonStatuses)
        : [];

      const renderRows = (rows) => rows.length
        ? rows
            .map((row, index) => {
              const no = `${index + 1}.`;
              const styleLine = `${_escapeHtml(row.batchName)} (${_escapeHtml(row.style)})`;
              const metricParts = [];
              if (row.abv && row.abv !== '-') {
                metricParts.push(row.abv);
              }
              if (row.originalGravity && row.originalGravity !== '-') {
                metricParts.push(row.originalGravity);
              }
              const metrics = metricParts.length ? metricParts.join(' / ') : row.abv;
              const abv = `- ${_escapeHtml(metrics)}`;
              return `
                <div class="entry">
                  <div class="line">
                    <span class="no chalk-white">${no}</span>
                    <span class="style ${this._chalkClass(index)}">${styleLine}</span>
                    <span class="abv">${abv}</span>
                  </div>
                  ${showNotes && row.notes ? `<div class="notes ${this._chalkClass(index)}">"${_escapeHtml(row.notes)}"</div>` : ''}
                </div>
              `;
            })
            .join('')
        : '';

      let sectionsHtml = '';

      if (showOnTap) {
        const onTapList = onTapRows.length
          ? renderRows(onTapRows)
          : `<div class="empty">${_escapeHtml(this._t('empty'))}</div>`;
        sectionsHtml += `
          <section class="group">
            <h2 class="title">${_escapeHtml(this._t('title'))}</h2>
            <div class="list">${onTapList}</div>
          </section>
        `;
      }

      if (showCommingSoon) {
        const commingSoonList = comingSoonStatuses.length === 0
          ? `<div class="empty">${_escapeHtml(this._t('no_coming_soon_statuses_enabled'))}</div>`
          : commingSoonRows.length
            ? renderRows(commingSoonRows)
            : `<div class="empty">${_escapeHtml(this._t('empty_coming_soon'))}</div>`;
        sectionsHtml += `
          <section class="group">
            <h2 class="title">${_escapeHtml(this._t('coming_soon_title'))}</h2>
            <div class="list">${commingSoonList}</div>
          </section>
        `;
      }

      if (!sectionsHtml) {
        sectionsHtml = `<div class="empty">${_escapeHtml(this._t('no_sections_enabled'))}</div>`;
      }

      this.shadowRoot.innerHTML = `
        <style>
          :host { display: block; }
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
          .group + .group {
            margin-top: 18px;
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
          .entry {
            border-bottom: 1px dashed rgba(255, 255, 255, 0.11);
            padding-bottom: 4px;
          }
          .entry:last-child {
            border-bottom: none;
            padding-bottom: 0;
          }
          .line {
            display: grid;
            grid-template-columns: auto 1fr auto;
            align-items: baseline;
            gap: 8px;
            min-height: 30px;
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
          .notes {
            margin-left: calc(2.2ch + 8px + 1.4em);
            margin-top: 2px;
            font-family: 'Chalkduster', 'Segoe Print', 'Bradley Hand', cursive;
            font-size: clamp(0.74rem, 1.1vw, 0.88rem);
            line-height: 1.25;
            text-shadow: 0 0 2px rgba(255, 255, 255, 0.1);
            white-space: normal;
            word-break: break-word;
          }
          .empty {
            padding: 8px 0 4px;
            font-family: 'Chalkduster', 'Segoe Print', 'Bradley Hand', cursive;
            color: #ded8c4;
            text-shadow: 0 0 2px rgba(255, 255, 255, 0.16);
            opacity: 0.9;
          }
          .chalk-white { color: #f6f2e8; }
          .chalk-yellow { color: #f8dc7f; }
          .chalk-blue { color: #9fd2ff; }
          .chalk-mint { color: #9ce7cc; }
          .chalk-pink { color: #f7b9cd; }
          .chalk-orange { color: #ffbf8a; }
          @media (max-width: 520px) {
            .board { padding: 12px 12px 13px; }
            .line { gap: 6px; }
          }
        </style>
        <ha-card>
          <div class="board">
            ${sectionsHtml}
          </div>
        </ha-card>
      `;
    } catch (error) {
      console.error('Grainfather On Tap Card render error:', error);
      this._renderError(error);
    }
  }
}

function _safeState(entity) {
  if (!entity) return undefined;
  if (entity.state === 'unknown' || entity.state === 'unavailable') return undefined;
  return entity.state;
}

function _formatGravityFromSg(value, unit = 'sg', includeUnit = false) {
  if (value == null || value === '-' || value === '—' || value === 'unknown' || value === 'unavailable') {
    return '-';
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

function _escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
