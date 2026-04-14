import { LitElement, css, html, nothing } from 'https://unpkg.com/lit@3.3.0/index.js?module';

const DEFAULT_STATUSES = ['fermenting', 'conditioning', 'serving', 'brewing', 'planning', 'completed'];

class GrainfatherBrewCollectionCard extends LitElement {
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
      overflow: visible;
      background: var(--ha-card-background, var(--card-background-color, white));
    }

    .container {
      padding: 0;
    }

    .title-bar {
      padding: 16px;
      border-bottom: 1px solid var(--divider-color);
    }

    .title {
      margin: 0;
      font-size: 1.2rem;
      font-weight: 600;
      color: var(--primary-text-color);
    }

    .subtitle {
      margin: 4px 0 0;
      font-size: 0.85rem;
      color: var(--secondary-text-color);
    }

    .status-group {
      margin-top: 0;
    }

    .status-group-header {
      padding: 12px 16px;
      background: var(--secondary-background-color);
      font-size: 0.9rem;
      font-weight: 600;
      color: var(--primary-text-color);
      text-transform: capitalize;
      border-bottom: 1px solid var(--divider-color);
      border-top: 1px solid var(--divider-color);
      margin-top: 12px;
    }

    .status-group-header:first-of-type {
      margin-top: 0;
    }

    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(500px, 1fr));
      gap: 16px;
      padding: 16px;
    }

    .empty-state {
      padding: 24px 16px;
      text-align: center;
      color: var(--secondary-text-color);
      font-size: 0.95rem;
    }

    .error {
      padding: 16px;
      background: var(--error-color, #ff6b6b);
      color: white;
      border-radius: 4px;
      margin: 12px;
      font-size: 0.9rem;
    }

    @media (max-width: 1200px) {
      .cards-grid {
        grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
      }
    }

    @media (max-width: 768px) {
      .cards-grid {
        grid-template-columns: 1fr;
        gap: 12px;
        padding: 12px;
      }

      .title-bar {
        padding: 12px;
      }

      .title {
        font-size: 1rem;
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
      title: 'Brew Sessions',
      statuses: DEFAULT_STATUSES,
      card_type: 'showcase',
      density_unit: 'sg',
      deduplicate: false,
      group_by_status: false,
      show_status_dates: true,
      show_fermentation_steps: true,
      show_batch_variant_name: true,
      sort_by: 'batch_number',
      sort_direction: 'desc',
      hidden_batch_numbers: '',
      ...(config || {}),
    };

    if (!Array.isArray(this._config.statuses)) {
      this._config.statuses = DEFAULT_STATUSES;
    }

    if (!['showcase', 'brew-session-v2'].includes(this._config.card_type)) {
      this._config.card_type = 'showcase';
    }

    if (!['sg', 'plato', 'brix'].includes(this._config.density_unit)) {
      this._config.density_unit = 'sg';
    }

    if (!['batch_number', 'session_name', 'status'].includes(this._config.sort_by)) {
      this._config.sort_by = 'batch_number';
    }

    if (!['asc', 'desc'].includes(this._config.sort_direction)) {
      this._config.sort_direction = 'desc';
    }

    if (Array.isArray(this._config.hidden_batch_numbers)) {
      this._config.hidden_batch_numbers = this._config.hidden_batch_numbers.join('\n');
    } else if (typeof this._config.hidden_batch_numbers !== 'string') {
      this._config.hidden_batch_numbers = '';
    }
  }

  set config(config) {
    this.setConfig(config);
  }

  getCardSize() {
    return 5;
  }

  static getStubConfig(hass) {
    const statuses = ['fermenting', 'conditioning', 'serving', 'brewing', 'planning', 'completed'];
    return {
      title: 'Brew Sessions',
      card_type: 'showcase',
      statuses: statuses,
      density_unit: 'sg',
      deduplicate: false,
      group_by_status: false,
      show_status_dates: true,
      show_fermentation_steps: true,
      show_batch_variant_name: true,
      sort_by: 'batch_number',
      sort_direction: 'desc',
      hidden_batch_numbers: '',
    };
  }

  static getConfigForm() {
    const statuses = ['fermenting', 'conditioning', 'serving', 'brewing', 'planning', 'completed'];
    return {
      schema: [
        {
          name: 'title',
          default: 'Brew Sessions',
          selector: {
            text: {},
          },
        },
        {
          name: 'card_type',
          default: 'showcase',
          selector: {
            select: {
              mode: 'dropdown',
              options: [
                { value: 'showcase', label: 'Showcase' },
                { value: 'brew-session-v2', label: 'Brew Session V2' },
              ],
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
                { value: 'sg', label: 'SG' },
                { value: 'plato', label: 'Plato' },
                { value: 'brix', label: 'Brix' },
              ],
            },
          },
        },
        {
          name: 'statuses',
          default: statuses,
          selector: {
            select: {
              mode: 'dropdown',
              multiple: true,
              options: statuses.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) })),
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
        {
          name: 'sort_by',
          default: 'batch_number',
          selector: {
            select: {
              mode: 'dropdown',
              options: [
                { value: 'batch_number', label: 'Batch number' },
                { value: 'session_name', label: 'Session name' },
                { value: 'status', label: 'Status' },
              ],
            },
          },
        },
        {
          name: 'sort_direction',
          default: 'desc',
          selector: {
            select: {
              mode: 'dropdown',
              options: [
                { value: 'asc', label: 'Ascending' },
                { value: 'desc', label: 'Descending' },
              ],
            },
          },
        },
        {
          name: 'hidden_batch_numbers',
          default: '',
          selector: {
            text: {
              multiline: true,
            },
          },
        },
        {
          name: 'deduplicate',
          default: false,
          selector: {
            boolean: {},
          },
        },
        {
          name: 'group_by_status',
          default: false,
          selector: {
            boolean: {},
          },
        },
      ],
      computeLabel: (schema) => {
        const labels = {
          title: 'Title',
          card_type: 'Card type to display',
          density_unit: 'Density unit',
          statuses: 'Filter by statuses',
          show_status_dates: 'Show status dates',
          show_fermentation_steps: 'Show fermentation steps',
          show_batch_variant_name: 'Show batch variant',
          sort_by: 'Sort cards by',
          sort_direction: 'Sort direction',
          hidden_batch_numbers: 'Hide batch numbers (one per line)',
          deduplicate: 'Deduplicate by batch_number + name',
          group_by_status: 'Group by status',
        };
        return labels[schema.name] || undefined;
      },
      computeHelper: (schema) => {
        const helpers = {
          title: 'Display name for this collection',
          card_type: 'Choose which card layout to use for each session',
          density_unit: 'Display gravity values on rendered cards as SG, Plato, or Brix.',
          statuses: 'Show only sessions with these statuses',
          show_status_dates: 'Enable or hide condition and fermentation start dates on each rendered card.',
          show_fermentation_steps: 'Enable or hide the fermentation steps section on each rendered card.',
          show_batch_variant_name: 'Enable or hide the batch variant row on each rendered card.',
          sort_by: 'Choose how cards are sorted within the list or inside each status group.',
          sort_direction: 'Choose ascending or descending order for the selected sort field.',
          hidden_batch_numbers: 'Enter batch numbers to hide (e.g., 272, 273) - one per line. Automatically discovers all Grainfather sessions.',
          deduplicate: 'If enabled, show only one card per unique batch_number + session name',
          group_by_status: 'If enabled, sessions will be grouped by status; otherwise all shown together',
        };
        return helpers[schema.name] || undefined;
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

  _collectAllGrainfatherEntities() {
    if (!this.hass) return [];

    return Object.keys(this.hass.states)
      .filter((entityId) => {
        const stateObj = this.hass.states[entityId];
        return entityId.startsWith('sensor.')
          && entityId.endsWith('_batch_number')
          && stateObj?.attributes?.grainfather_entity_type === 'brew_session';
      })
      .map((entityId) => entityId);
  }

  _parseHiddenBatchNumbers() {
    const raw = this._config.hidden_batch_numbers || '';
    return new Set(
      String(raw)
        .split(/\r?\n|,/)
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    );
  }

  _compareSessions(left, right) {
    const direction = this._config.sort_direction === 'asc' ? 1 : -1;
    const sortBy = this._config.sort_by || 'batch_number';

    if (sortBy === 'session_name') {
      return direction * left.sessionName.localeCompare(right.sessionName, undefined, { sensitivity: 'base' });
    }

    if (sortBy === 'status') {
      const statusComparison = left.status.localeCompare(right.status, undefined, { sensitivity: 'base' });
      if (statusComparison !== 0) {
        return direction * statusComparison;
      }
      return direction * (Number(left.batchNumber) - Number(right.batchNumber));
    }

    const leftBatch = Number(left.batchNumber);
    const rightBatch = Number(right.batchNumber);
    const leftIsNumber = Number.isFinite(leftBatch);
    const rightIsNumber = Number.isFinite(rightBatch);

    if (leftIsNumber && rightIsNumber && leftBatch !== rightBatch) {
      return direction * (leftBatch - rightBatch);
    }

    return direction * String(left.batchNumber).localeCompare(String(right.batchNumber), undefined, { numeric: true, sensitivity: 'base' });
  }

  _collectSessions() {
    const sessions = [];
    const entityIds = this._collectAllGrainfatherEntities();
    const allowedStatuses = this._config.statuses || DEFAULT_STATUSES;
    const hiddenBatchNumbers = this._parseHiddenBatchNumbers();

    if (!this.hass) {
      return sessions;
    }

    entityIds.forEach((entityId) => {
      const entity = this.hass.states[entityId];
      if (!entity) return;

      const status = entity.attributes?.status || 'unknown';

      if (!allowedStatuses.includes(status)) {
        return;
      }

      const batchNumber = String(entity.attributes?.batch_number ?? entity.state);
      
      if (hiddenBatchNumbers.has(batchNumber)) {
        return;
      }

      const sessionName = entity.attributes?.session_name || entity.attributes?.recipe_name || 'Unnamed';

      sessions.push({
        entityId,
        status,
        batchNumber,
        sessionName,
        dedupeKey: `${batchNumber}_${sessionName}`,
      });
    });

    if (this._config.deduplicate) {
      const seen = new Set();
      return sessions.filter((session) => {
        if (seen.has(session.dedupeKey)) {
          return false;
        }
        seen.add(session.dedupeKey);
        return true;
      }).sort((left, right) => this._compareSessions(left, right));
    }

    return sessions.sort((left, right) => this._compareSessions(left, right));
  }

  _groupByStatus(sessions) {
    const grouped = new Map();

    sessions.forEach((session) => {
      if (!grouped.has(session.status)) {
        grouped.set(session.status, []);
      }
      grouped.get(session.status).push(session);
    });

    return grouped;
  }

  _renderCardForSession(session) {
    const { entityId } = session;
    const cardType = this._config.card_type || 'showcase';

    const config = {
      entity: entityId,
      density_unit: this._config.density_unit || 'sg',
      show_image: true,
      show_status_dates: this._config.show_status_dates !== false,
      show_fermentation_steps: this._config.show_fermentation_steps !== false,
      show_batch_variant_name: this._config.show_batch_variant_name !== false,
    };

    if (cardType === 'showcase') {
      return html`
        <grainfather-brew-session-card-showcase
          .hass=${this.hass}
          .config=${config}
        ></grainfather-brew-session-card-showcase>
      `;
    } else if (cardType === 'brew-session-v2') {
      return html`
        <grainfather-brew-session-card
          .hass=${this.hass}
          .config=${config}
        ></grainfather-brew-session-card>
      `;
    }

    return nothing;
  }

  render() {
    if (!this.hass) {
      return nothing;
    }

    const sessions = this._collectSessions();

    if (sessions.length === 0) {
      return html`
        <ha-card>
          <div class="empty-state">No brew sessions found with the selected statuses.</div>
        </ha-card>
      `;
    }

    const shouldGroup = this._config.group_by_status;

    return html`
      <ha-card>
        <div class="container">
          <div class="title-bar">
            <h2 class="title">${this._config.title}</h2>
            <div class="subtitle">${sessions.length} session${sessions.length !== 1 ? 's' : ''}</div>
          </div>

          ${shouldGroup
            ? html`
                ${Array.from(this._groupByStatus(sessions).entries()).map(
                  ([status, statusSessions]) => html`
                    <div class="status-group">
                      <div class="status-group-header">${status}</div>
                      <div class="cards-grid">
                        ${statusSessions.map((session) => this._renderCardForSession(session))}
                      </div>
                    </div>
                  `
                )}
              `
            : html`
                <div class="cards-grid">
                  ${sessions.map((session) => this._renderCardForSession(session))}
                </div>
              `}
        </div>
      </ha-card>
    `;
  }
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

if (!customElements.get('grainfather-brew-collection-card')) {
  customElements.define('grainfather-brew-collection-card', GrainfatherBrewCollectionCard);
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'grainfather-brew-collection-card',
  name: 'Grainfather Brew Collection',
  description: 'Display all Grainfather brew sessions with filtering by status and deduplication.',
  preview: false,
  configurable: true,
});
