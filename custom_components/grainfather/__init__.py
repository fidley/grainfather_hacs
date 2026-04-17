from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from aiohttp import ClientSession
import voluptuous as vol

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.aiohttp_client import async_get_clientsession
import homeassistant.helpers.config_validation as cv
import homeassistant.helpers.device_registry as dr
import homeassistant.helpers.entity_registry as er

_CARD_URL = "/grainfather/grainfather-brew-session-card-v2.js"
_CARD_PATH = Path(__file__).parent / "www" / "grainfather-brew-session-card-v2.js"
_CARD_V3_URL = "/grainfather/grainfather-brew-session-card-v3.js"
_CARD_V3_PATH = Path(__file__).parent / "www" / "grainfather-brew-session-card-v3.js"
_ON_TAP_CARD_URL = "/grainfather/grainfather-on-tap-card.js"
_ON_TAP_CARD_PATH = Path(__file__).parent / "www" / "grainfather-on-tap-card.js"
_COLLECTION_CARD_URL = "/grainfather/grainfather-brew-collection-card.js"
_COLLECTION_CARD_PATH = (
    Path(__file__).parent / "www" / "grainfather-brew-collection-card.js"
)
_FERM_DEVICE_CARD_URL = "/grainfather/grainfather-fermentation-device-card.js"
_FERM_DEVICE_CARD_PATH = (
    Path(__file__).parent / "www" / "grainfather-fermentation-device-card.js"
)
_CARD_RESOURCES_KEY = f"{__name__}_card_registered"
_CARD_FRONTEND_KEY = f"{__name__}_card_frontend_registered"

from .api import GrainfatherApiClient
from .const import (
    CONF_INCLUDE_COMPLETED_SESSIONS,
    SERVICE_ADJUST_CURRENT_STEP_DURATION,
    SERVICE_ADJUST_CURRENT_STEP_TEMPERATURE,
    SERVICE_ADVANCE_TO_NEXT_FERMENTATION_STEP,
    SERVICE_CLEAR_FERMENTATION_STEP_FINISH_TEMPERATURE,
    CONF_BREW_SESSION_ID,
    CONF_DURATION_MINUTES,
    CONF_EMAIL,
    CONF_ENTRY_ID,
    CONF_FERMENTATION_STEPS,
    CONF_FINISH_TEMPERATURE,
    CONF_IS_RAMP_STEP,
    CONF_PASSWORD,
    CONF_RECIPE_ID,
    CONF_STATUS,
    CONF_STEP_INDEX,
    CONF_TEMPERATURE,
    DOMAIN,
    SERVICE_SET_BREW_SESSION_STATUS,
    SERVICE_SET_FERMENTATION_STEP_DURATION,
    SERVICE_SET_FERMENTATION_STEPS,
    DEFAULT_INCLUDE_COMPLETED_SESSIONS,
    normalize_brew_session_status,
)
from .coordinator import GrainfatherDataUpdateCoordinator
from .api import brew_session_unique_fragment

PLATFORMS: list[Platform] = [
    Platform.SENSOR,
    Platform.NUMBER,
    Platform.SELECT,
]

STEP_SCHEMA = vol.Schema(
    {
        vol.Optional("id"): vol.Coerce(int),
        vol.Required("name"): cv.string,
        vol.Required("temperature"): vol.Coerce(float),
        vol.Required("time"): vol.Coerce(int),
        vol.Optional("order"): vol.Coerce(int),
        vol.Optional("time_unit_id"): vol.Coerce(int),
        vol.Optional("is_ramp_step"): cv.boolean,
        vol.Optional("finish_temperature"): vol.Any(None, vol.Coerce(float)),
    }
)

SET_STATUS_SCHEMA = vol.Schema(
    {
        vol.Optional(CONF_ENTRY_ID): cv.string,
        vol.Optional(CONF_BREW_SESSION_ID): vol.Coerce(int),
        vol.Optional(CONF_RECIPE_ID): vol.Coerce(int),
        vol.Required(CONF_STATUS): vol.Any(vol.Coerce(int), cv.string),
    }
)

SET_FERMENTATION_STEPS_SCHEMA = vol.Schema(
    {
        vol.Optional(CONF_ENTRY_ID): cv.string,
        vol.Optional(CONF_BREW_SESSION_ID): vol.Coerce(int),
        vol.Optional(CONF_RECIPE_ID): vol.Coerce(int),
        vol.Required(CONF_FERMENTATION_STEPS): vol.All(cv.ensure_list, [STEP_SCHEMA]),
    }
)

SET_FERMENTATION_STEP_DURATION_SCHEMA = vol.Schema(
    vol.All(
        {
            vol.Optional(CONF_ENTRY_ID): cv.string,
            vol.Optional(CONF_BREW_SESSION_ID): vol.Coerce(int),
            vol.Optional(CONF_RECIPE_ID): vol.Coerce(int),
            vol.Required(CONF_STEP_INDEX): vol.Coerce(int),
            vol.Optional(CONF_DURATION_MINUTES): vol.Coerce(int),
            vol.Optional(CONF_TEMPERATURE): vol.Coerce(float),
            vol.Optional(CONF_IS_RAMP_STEP): cv.boolean,
            vol.Optional(CONF_FINISH_TEMPERATURE): vol.Any(None, vol.Coerce(float)),
        },
        lambda value: _validate_step_field_update_request(value),
    )
)

CLEAR_FERMENTATION_STEP_FINISH_TEMPERATURE_SCHEMA = vol.Schema(
    {
        vol.Optional(CONF_ENTRY_ID): cv.string,
        vol.Optional(CONF_BREW_SESSION_ID): vol.Coerce(int),
        vol.Optional(CONF_RECIPE_ID): vol.Coerce(int),
        vol.Required(CONF_STEP_INDEX): vol.Coerce(int),
    }
)

ADJUST_CURRENT_STEP_TEMPERATURE_SCHEMA = vol.Schema(
    {
        vol.Optional(CONF_ENTRY_ID): cv.string,
        vol.Optional(CONF_BREW_SESSION_ID): vol.Coerce(int),
        vol.Optional(CONF_RECIPE_ID): vol.Coerce(int),
        vol.Required(CONF_TEMPERATURE): vol.Coerce(float),
    }
)

ADJUST_CURRENT_STEP_DURATION_SCHEMA = vol.Schema(
    {
        vol.Optional(CONF_ENTRY_ID): cv.string,
        vol.Optional(CONF_BREW_SESSION_ID): vol.Coerce(int),
        vol.Optional(CONF_RECIPE_ID): vol.Coerce(int),
        vol.Required(CONF_DURATION_MINUTES): vol.Coerce(int),
    }
)

ADVANCE_TO_NEXT_FERMENTATION_STEP_SCHEMA = vol.Schema(
    {
        vol.Optional(CONF_ENTRY_ID): cv.string,
        vol.Optional(CONF_BREW_SESSION_ID): vol.Coerce(int),
        vol.Optional(CONF_RECIPE_ID): vol.Coerce(int),
    }
)


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    """Set up the Grainfather integration domain.

    Register static resources early so Lovelace can resolve custom cards even
    before/while config entries are being set up.
    """
    hass.data.setdefault(DOMAIN, {})
    await _async_register_card_resources(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data.setdefault(DOMAIN, {})
    await _async_remove_legacy_image_entities(hass, entry)
    await _async_register_card_resources(hass)

    session: ClientSession = async_get_clientsession(hass)
    api = GrainfatherApiClient(
        session,
        entry.data[CONF_EMAIL],
        entry.data[CONF_PASSWORD],
    )
    coordinator = GrainfatherDataUpdateCoordinator(hass, api, entry)
    await coordinator.async_config_entry_first_refresh()

    await _async_prune_stale_registry_entries(hass, entry, coordinator)

    def _async_handle_coordinator_update() -> None:
        hass.async_create_task(_async_prune_stale_registry_entries(hass, entry, coordinator))

    entry.async_on_unload(coordinator.async_add_listener(_async_handle_coordinator_update))

    hass.data[DOMAIN][entry.entry_id] = coordinator
    _async_register_services(hass)
    await _async_create_helpers(hass, entry)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    return True


async def _async_options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def _async_register_card_resources(hass: HomeAssistant) -> None:
    """Register the custom Lovelace card JS file as a static HTTP resource.

    Registration is guarded so it only runs once per HA instance regardless of
    how many Grainfather config entries are loaded.
    """
    if hass.data.get(_CARD_RESOURCES_KEY):
        return
    await hass.http.async_register_static_paths(
        [
            StaticPathConfig(url_path=_CARD_URL, path=str(_CARD_PATH), cache_headers=False),
            StaticPathConfig(
                url_path=_CARD_V3_URL,
                path=str(_CARD_V3_PATH),
                cache_headers=False,
            ),
            StaticPathConfig(
                url_path=_ON_TAP_CARD_URL,
                path=str(_ON_TAP_CARD_PATH),
                cache_headers=False,
            ),
            StaticPathConfig(
                url_path=_COLLECTION_CARD_URL,
                path=str(_COLLECTION_CARD_PATH),
                cache_headers=False,
            ),
            StaticPathConfig(
                url_path=_FERM_DEVICE_CARD_URL,
                path=str(_FERM_DEVICE_CARD_PATH),
                cache_headers=False,
            ),
        ]
    )
    if not hass.data.get(_CARD_FRONTEND_KEY):
        add_extra_js_url(hass, _CARD_URL)
        add_extra_js_url(hass, _CARD_V3_URL)
        add_extra_js_url(hass, _ON_TAP_CARD_URL)
        add_extra_js_url(hass, _COLLECTION_CARD_URL)
        add_extra_js_url(hass, _FERM_DEVICE_CARD_URL)
        hass.data[_CARD_FRONTEND_KEY] = True
    hass.data[_CARD_RESOURCES_KEY] = True


async def _async_remove_legacy_image_entities(
    hass: HomeAssistant,
    entry: ConfigEntry,
) -> None:
    entity_registry = er.async_get(hass)
    for entity_entry in er.async_entries_for_config_entry(entity_registry, entry.entry_id):
        if entity_entry.domain == Platform.IMAGE:
            entity_registry.async_remove(entity_entry.entity_id)


async def _async_remove_stale_session_entities(
    hass: HomeAssistant,
    entry: ConfigEntry,
    coordinator: GrainfatherDataUpdateCoordinator,
) -> None:
    """Remove session entities not present in the current snapshot.

    This is used when completed sessions are excluded, so old completed entities
    are fully removed from the registry instead of remaining unavailable.
    """
    entity_registry = er.async_get(hass)
    active_fragments = {
        brew_session_unique_fragment(session)
        for session in coordinator.data.brew_sessions
    }
    prefix = f"{entry.entry_id}_session_"

    for entity_entry in er.async_entries_for_config_entry(entity_registry, entry.entry_id):
        unique_id = entity_entry.unique_id or ""
        if not unique_id.startswith(prefix):
            continue

        is_active = any(
            unique_id.startswith(f"{prefix}{fragment}_")
            for fragment in active_fragments
        )
        if not is_active:
            entity_registry.async_remove(entity_entry.entity_id)


async def _async_prune_stale_registry_entries(
    hass: HomeAssistant,
    entry: ConfigEntry,
    coordinator: GrainfatherDataUpdateCoordinator,
) -> None:
    await _async_remove_stale_session_entities(hass, entry, coordinator)
    await _async_remove_stale_fermentation_device_entities(hass, entry, coordinator)
    await _async_remove_orphan_grainfather_devices(hass, entry, coordinator)


async def _async_remove_stale_fermentation_device_entities(
    hass: HomeAssistant,
    entry: ConfigEntry,
    coordinator: GrainfatherDataUpdateCoordinator,
) -> None:
    """Remove fermentation-device entities not present in the current snapshot."""
    entity_registry = er.async_get(hass)
    active_device_ids = {
        str(device.device_id)
        for device in coordinator.data.fermentation_devices
        if device.device_id is not None
    }
    prefix = f"{entry.entry_id}_fermdevice_"

    for entity_entry in er.async_entries_for_config_entry(entity_registry, entry.entry_id):
        unique_id = entity_entry.unique_id or ""
        if not unique_id.startswith(prefix):
            continue

        is_active = any(
            unique_id.startswith(f"{prefix}{device_id}_")
            for device_id in active_device_ids
        )
        if not is_active:
            entity_registry.async_remove(entity_entry.entity_id)


async def _async_remove_orphan_grainfather_devices(
    hass: HomeAssistant,
    entry: ConfigEntry,
    coordinator: GrainfatherDataUpdateCoordinator,
) -> None:
    """Remove stale Grainfather devices once all their entities are gone."""
    device_registry = dr.async_get(hass)
    active_device_identifiers = {
        brew_session_unique_fragment(session)
        for session in coordinator.data.brew_sessions
    }
    active_device_identifiers = {
        f"batch_{fragment}" for fragment in active_device_identifiers
    }
    active_device_identifiers.update(
        f"fermdevice_{device.device_id}"
        for device in coordinator.data.fermentation_devices
        if device.device_id is not None
    )

    for device_entry in dr.async_entries_for_config_entry(device_registry, entry.entry_id):
        grainfather_identifiers = {
            identifier
            for domain, identifier in device_entry.identifiers
            if domain == DOMAIN
        }
        if not grainfather_identifiers:
            continue
        if grainfather_identifiers.isdisjoint(active_device_identifiers):
            device_registry.async_remove_device(device_entry.id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
        if not hass.data[DOMAIN]:
            hass.services.async_remove(DOMAIN, SERVICE_ADJUST_CURRENT_STEP_TEMPERATURE)
            hass.services.async_remove(DOMAIN, SERVICE_ADJUST_CURRENT_STEP_DURATION)
            hass.services.async_remove(DOMAIN, SERVICE_ADVANCE_TO_NEXT_FERMENTATION_STEP)
            hass.services.async_remove(DOMAIN, SERVICE_SET_BREW_SESSION_STATUS)
            hass.services.async_remove(DOMAIN, SERVICE_SET_FERMENTATION_STEPS)
            hass.services.async_remove(DOMAIN, SERVICE_SET_FERMENTATION_STEP_DURATION)
            hass.services.async_remove(
                DOMAIN, SERVICE_CLEAR_FERMENTATION_STEP_FINISH_TEMPERATURE
            )
    return unload_ok


def _async_register_services(hass: HomeAssistant) -> None:
    if not hass.services.has_service(DOMAIN, SERVICE_ADJUST_CURRENT_STEP_TEMPERATURE):

        async def async_handle_adjust_current_step_temperature(service_call) -> None:
            coordinator = _get_coordinator(hass, service_call.data.get(CONF_ENTRY_ID))
            _, brew_session_id = _resolve_batch_target(
                coordinator,
                service_call.data.get(CONF_BREW_SESSION_ID),
                service_call.data.get(CONF_RECIPE_ID),
            )
            session = _find_session_by_batch_id(coordinator, brew_session_id)
            if session is None:
                raise HomeAssistantError(f"Brew session {brew_session_id} not found")

            step_index, current_step, _, _ = _resolve_current_fermentation_step(session)
            if current_step.temperature is None:
                raise HomeAssistantError("Current fermentation step has no temperature")
            if session.recipe_id is None or session.batch_id is None:
                raise HomeAssistantError(
                    "Cannot resolve recipe_id or batch_id for this session"
                )

            new_temperature = round(float(service_call.data[CONF_TEMPERATURE]), 2)
            await coordinator.api.async_set_fermentation_step_duration(
                session.recipe_id,
                int(session.batch_id),
                step_index,
                temperature=new_temperature,
            )
            await coordinator.async_request_refresh()

        hass.services.async_register(
            DOMAIN,
            SERVICE_ADJUST_CURRENT_STEP_TEMPERATURE,
            async_handle_adjust_current_step_temperature,
            schema=ADJUST_CURRENT_STEP_TEMPERATURE_SCHEMA,
        )

    if not hass.services.has_service(DOMAIN, SERVICE_ADJUST_CURRENT_STEP_DURATION):

        async def async_handle_adjust_current_step_duration(service_call) -> None:
            coordinator = _get_coordinator(hass, service_call.data.get(CONF_ENTRY_ID))
            _, brew_session_id = _resolve_batch_target(
                coordinator,
                service_call.data.get(CONF_BREW_SESSION_ID),
                service_call.data.get(CONF_RECIPE_ID),
            )
            session = _find_session_by_batch_id(coordinator, brew_session_id)
            if session is None:
                raise HomeAssistantError(f"Brew session {brew_session_id} not found")

            step_index, current_step, _, _ = _resolve_current_fermentation_step(session)
            if current_step.duration is None:
                raise HomeAssistantError("Current fermentation step has no duration")
            if session.recipe_id is None or session.batch_id is None:
                raise HomeAssistantError(
                    "Cannot resolve recipe_id or batch_id for this session"
                )

            new_duration = max(1, int(service_call.data[CONF_DURATION_MINUTES]))

            await coordinator.api.async_set_fermentation_step_duration(
                session.recipe_id,
                int(session.batch_id),
                step_index,
                duration_minutes=new_duration,
            )
            await coordinator.async_request_refresh()

        hass.services.async_register(
            DOMAIN,
            SERVICE_ADJUST_CURRENT_STEP_DURATION,
            async_handle_adjust_current_step_duration,
            schema=ADJUST_CURRENT_STEP_DURATION_SCHEMA,
        )

    if not hass.services.has_service(DOMAIN, SERVICE_ADVANCE_TO_NEXT_FERMENTATION_STEP):

        async def async_handle_advance_to_next_fermentation_step(service_call) -> None:
            coordinator = _get_coordinator(hass, service_call.data.get(CONF_ENTRY_ID))
            _, brew_session_id = _resolve_batch_target(
                coordinator,
                service_call.data.get(CONF_BREW_SESSION_ID),
                service_call.data.get(CONF_RECIPE_ID),
            )
            session = _find_session_by_batch_id(coordinator, brew_session_id)
            if session is None:
                raise HomeAssistantError(f"Brew session {brew_session_id} not found")
            if session.recipe_id is None or session.batch_id is None:
                raise HomeAssistantError(
                    "Cannot resolve recipe_id or batch_id for this session"
                )

            step_index, current_step, minutes_elapsed, _ = _resolve_current_fermentation_step(session)
            if step_index >= len(session.fermentation_steps) - 1:
                raise HomeAssistantError("Current fermentation step is already the last step")

            # Move schedule boundary to now by shortening current step to elapsed minutes.
            # If fermentation just started, minimum duration of 1 minute is used.
            new_duration = max(1, int(minutes_elapsed))
            if current_step.duration is not None:
                new_duration = min(int(current_step.duration), new_duration)

            await coordinator.api.async_set_fermentation_step_duration(
                session.recipe_id,
                int(session.batch_id),
                step_index,
                duration_minutes=new_duration,
            )
            await coordinator.async_request_refresh()

        hass.services.async_register(
            DOMAIN,
            SERVICE_ADVANCE_TO_NEXT_FERMENTATION_STEP,
            async_handle_advance_to_next_fermentation_step,
            schema=ADVANCE_TO_NEXT_FERMENTATION_STEP_SCHEMA,
        )

    if not hass.services.has_service(DOMAIN, SERVICE_SET_BREW_SESSION_STATUS):

        async def async_handle_set_brew_session_status(service_call) -> None:
            coordinator = _get_coordinator(hass, service_call.data.get(CONF_ENTRY_ID))
            recipe_id, brew_session_id = _resolve_batch_target(
                coordinator,
                service_call.data.get(CONF_BREW_SESSION_ID),
                service_call.data.get(CONF_RECIPE_ID),
            )
            try:
                status = normalize_brew_session_status(service_call.data[CONF_STATUS])
            except ValueError as err:
                raise HomeAssistantError(str(err)) from err

            await coordinator.api.async_set_brew_session_status(
                recipe_id,
                brew_session_id,
                status,
            )
            await coordinator.async_request_refresh()

        hass.services.async_register(
            DOMAIN,
            SERVICE_SET_BREW_SESSION_STATUS,
            async_handle_set_brew_session_status,
            schema=SET_STATUS_SCHEMA,
        )

    if not hass.services.has_service(DOMAIN, SERVICE_SET_FERMENTATION_STEPS):

        async def async_handle_set_fermentation_steps(service_call) -> None:
            coordinator = _get_coordinator(hass, service_call.data.get(CONF_ENTRY_ID))
            recipe_id, brew_session_id = _resolve_batch_target(
                coordinator,
                service_call.data.get(CONF_BREW_SESSION_ID),
                service_call.data.get(CONF_RECIPE_ID),
            )
            await coordinator.api.async_set_fermentation_steps(
                recipe_id,
                brew_session_id,
                service_call.data[CONF_FERMENTATION_STEPS],
            )
            await coordinator.async_request_refresh()

        hass.services.async_register(
            DOMAIN,
            SERVICE_SET_FERMENTATION_STEPS,
            async_handle_set_fermentation_steps,
            schema=SET_FERMENTATION_STEPS_SCHEMA,
        )


    if not hass.services.has_service(DOMAIN, SERVICE_SET_FERMENTATION_STEP_DURATION):

        async def async_handle_set_fermentation_step_duration(service_call) -> None:
            coordinator = _get_coordinator(hass, service_call.data.get(CONF_ENTRY_ID))
            recipe_id, brew_session_id = _resolve_batch_target(
                coordinator,
                service_call.data.get(CONF_BREW_SESSION_ID),
                service_call.data.get(CONF_RECIPE_ID),
            )
            await coordinator.api.async_set_fermentation_step_duration(
                recipe_id,
                brew_session_id,
                service_call.data[CONF_STEP_INDEX],
                service_call.data.get(CONF_DURATION_MINUTES),
                temperature=service_call.data.get(CONF_TEMPERATURE),
                is_ramp_step=service_call.data.get(CONF_IS_RAMP_STEP),
                finish_temperature=service_call.data.get(CONF_FINISH_TEMPERATURE),
                set_finish_temperature=CONF_FINISH_TEMPERATURE in service_call.data,
            )
            await coordinator.async_request_refresh()

        hass.services.async_register(
            DOMAIN,
            SERVICE_SET_FERMENTATION_STEP_DURATION,
            async_handle_set_fermentation_step_duration,
            schema=SET_FERMENTATION_STEP_DURATION_SCHEMA,
        )

    if not hass.services.has_service(
        DOMAIN, SERVICE_CLEAR_FERMENTATION_STEP_FINISH_TEMPERATURE
    ):

        async def async_handle_clear_fermentation_step_finish_temperature(service_call) -> None:
            coordinator = _get_coordinator(hass, service_call.data.get(CONF_ENTRY_ID))
            recipe_id, brew_session_id = _resolve_batch_target(
                coordinator,
                service_call.data.get(CONF_BREW_SESSION_ID),
                service_call.data.get(CONF_RECIPE_ID),
            )
            await coordinator.api.async_set_fermentation_step_duration(
                recipe_id,
                brew_session_id,
                service_call.data[CONF_STEP_INDEX],
                finish_temperature=None,
                set_finish_temperature=True,
            )
            await coordinator.async_request_refresh()

        hass.services.async_register(
            DOMAIN,
            SERVICE_CLEAR_FERMENTATION_STEP_FINISH_TEMPERATURE,
            async_handle_clear_fermentation_step_finish_temperature,
            schema=CLEAR_FERMENTATION_STEP_FINISH_TEMPERATURE_SCHEMA,
        )


async def _async_create_helpers(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """Create dashboard filter helpers if they don't exist."""
    # input_number helper: max sessions to display
    max_sessions_entity = "input_number.grainfather_max_sessions"
    if hass.states.get(max_sessions_entity) is None:
        try:
            await hass.services.async_call(
                "input_number",
                "create",
                {
                    "name": "Grainfather: Max sessions",
                    "icon": "mdi:counter",
                    "min": 1,
                    "max": 100,
                    "step": 1,
                    "initial": 20,
                    "mode": "slider",
                    "unit_of_measurement": "",
                    "unique_id": f"{entry.entry_id}_max_sessions",
                },
                blocking=True,
            )
        except Exception:
            # Fallback: set state directly if service doesn't work
            hass.states.async_set(
                max_sessions_entity,
                "20",
                {
                    "friendly_name": "Grainfather: Max sessions",
                    "icon": "mdi:counter",
                    "unit_of_measurement": "",
                    "min": 1,
                    "max": 100,
                    "step": 1,
                    "mode": "slider",
                },
            )

    # input_boolean helpers: filter by status
    statuses = {
        "planning": "Pencil",
        "brewing": "Kettle",
        "fermenting": "Flask",
        "conditioning": "Wine Bottle",
        "serving": "Beer",
        "completed": "Check Circle",
    }

    for status_key, icon_name in statuses.items():
        helper_entity = f"input_boolean.grainfather_show_{status_key}"
        if hass.states.get(helper_entity) is None:
            try:
                await hass.services.async_call(
                    "input_boolean",
                    "create",
                    {
                        "name": f"Sessions: {status_key.capitalize()}",
                        "icon": f"mdi:{icon_name.replace(' ', '-').lower()}",
                        "unique_id": f"{entry.entry_id}_show_{status_key}",
                    },
                    blocking=True,
                )
            except Exception:
                # Fallback: set state directly
                hass.states.async_set(
                    helper_entity,
                    "on",
                    {
                        "friendly_name": f"Sessions: {status_key.capitalize()}",
                        "icon": f"mdi:{icon_name.replace(' ', '-').lower()}",
                    },
                )


def _get_coordinator(
    hass: HomeAssistant,
    entry_id: str | None,
) -> GrainfatherDataUpdateCoordinator:
    coordinators: dict[str, GrainfatherDataUpdateCoordinator] = hass.data.get(DOMAIN, {})
    if not coordinators:
        raise HomeAssistantError("No Grainfather entries are loaded")

    if entry_id:
        coordinator = coordinators.get(entry_id)
        if coordinator is None:
            raise HomeAssistantError(f"Unknown Grainfather entry_id: {entry_id}")
        return coordinator

    return next(iter(coordinators.values()))


def _resolve_batch_target(
    coordinator: GrainfatherDataUpdateCoordinator,
    brew_session_id: int | None,
    recipe_id: int | None,
) -> tuple[int, int]:
    sessions = coordinator.data.brew_sessions
    if not sessions:
        raise HomeAssistantError("No Grainfather brew sessions found")

    if brew_session_id is not None:
        if recipe_id is not None:
            return recipe_id, brew_session_id
        for session in sessions:
            if session.batch_id is not None and int(session.batch_id) == brew_session_id:
                if session.recipe_id is None:
                    raise HomeAssistantError(
                        f"Cannot resolve recipe_id for session {brew_session_id}"
                    )
                return session.recipe_id, brew_session_id
        raise HomeAssistantError(f"Brew session {brew_session_id} not found")

    # Default to first fermenting session, then first session in list
    for session in sessions:
        if session.status == 20 and session.recipe_id is not None and session.batch_id is not None:
            return session.recipe_id, int(session.batch_id)

    first = sessions[0]
    if first.recipe_id is None or first.batch_id is None:
        raise HomeAssistantError(
            "Cannot resolve target brew session: missing recipe_id or batch_id"
        )
    return first.recipe_id, int(first.batch_id)


def _validate_step_field_update_request(value: dict) -> dict:
    if any(
        key in value
        for key in (
            CONF_DURATION_MINUTES,
            CONF_TEMPERATURE,
            CONF_IS_RAMP_STEP,
            CONF_FINISH_TEMPERATURE,
        )
    ):
        return value

    raise vol.Invalid(
        "At least one field must be provided: duration_minutes, temperature, is_ramp_step, or finish_temperature"
    )


def _find_session_by_batch_id(
    coordinator: GrainfatherDataUpdateCoordinator,
    brew_session_id: int,
):
    for session in coordinator.data.brew_sessions:
        if session.batch_id is not None and int(session.batch_id) == int(brew_session_id):
            return session
    return None


def _resolve_current_fermentation_step(session):
    steps = tuple(session.fermentation_steps or tuple())
    if not steps:
        raise HomeAssistantError("Brew session has no fermentation steps")

    fermentation_start = _parse_datetime_utc(session.fermentation_start_date)
    if fermentation_start is None:
        # If no start date is known, default to first step.
        return 0, steps[0], 0.0, float(steps[0].duration or 0)

    now = datetime.now(timezone.utc)
    elapsed_total = max(0.0, (now - fermentation_start).total_seconds() / 60.0)

    cursor = 0.0
    for idx, step in enumerate(steps):
        duration = max(0.0, float(step.duration or 0))
        next_cursor = cursor + duration

        if idx == len(steps) - 1 or elapsed_total < next_cursor:
            elapsed_in_step = max(0.0, elapsed_total - cursor)
            remaining_in_step = max(0.0, next_cursor - elapsed_total)
            return idx, step, elapsed_in_step, remaining_in_step

        cursor = next_cursor

    return len(steps) - 1, steps[-1], 0.0, 0.0


def _parse_datetime_utc(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)
