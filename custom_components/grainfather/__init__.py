from __future__ import annotations

from aiohttp import ClientSession
import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.aiohttp_client import async_get_clientsession
import homeassistant.helpers.config_validation as cv

from .api import GrainfatherApiClient
from .const import (
    CONF_BREW_SESSION_ID,
    CONF_DURATION_MINUTES,
    CONF_EMAIL,
    CONF_ENTRY_ID,
    CONF_FERMENTATION_STEPS,
    CONF_PASSWORD,
    CONF_RECIPE_ID,
    CONF_STATUS,
    CONF_STEP_INDEX,
    DOMAIN,
    SERVICE_SET_BREW_SESSION_STATUS,
    SERVICE_SET_FERMENTATION_STEP_DURATION,
    SERVICE_SET_FERMENTATION_STEPS,
    normalize_brew_session_status,
)
from .coordinator import GrainfatherDataUpdateCoordinator

PLATFORMS: list[Platform] = [
    Platform.SENSOR,
    Platform.NUMBER,
    Platform.SELECT,
    Platform.IMAGE,
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
    {
        vol.Optional(CONF_ENTRY_ID): cv.string,
        vol.Optional(CONF_BREW_SESSION_ID): vol.Coerce(int),
        vol.Optional(CONF_RECIPE_ID): vol.Coerce(int),
        vol.Required(CONF_STEP_INDEX): vol.Coerce(int),
        vol.Required(CONF_DURATION_MINUTES): vol.Coerce(int),
    }
)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    hass.data.setdefault(DOMAIN, {})

    session: ClientSession = async_get_clientsession(hass)
    api = GrainfatherApiClient(
        session,
        entry.data[CONF_EMAIL],
        entry.data[CONF_PASSWORD],
    )
    coordinator = GrainfatherDataUpdateCoordinator(hass, api, entry)
    await coordinator.async_config_entry_first_refresh()

    hass.data[DOMAIN][entry.entry_id] = coordinator
    _async_register_services(hass)
    await _async_create_helpers(hass, entry)
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    entry.async_on_unload(entry.add_update_listener(_async_options_updated))
    return True


async def _async_options_updated(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data[DOMAIN].pop(entry.entry_id, None)
        if not hass.data[DOMAIN]:
            hass.services.async_remove(DOMAIN, SERVICE_SET_BREW_SESSION_STATUS)
            hass.services.async_remove(DOMAIN, SERVICE_SET_FERMENTATION_STEPS)
            hass.services.async_remove(DOMAIN, SERVICE_SET_FERMENTATION_STEP_DURATION)
    return unload_ok


def _async_register_services(hass: HomeAssistant) -> None:
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
                service_call.data[CONF_DURATION_MINUTES],
            )
            await coordinator.async_request_refresh()

        hass.services.async_register(
            DOMAIN,
            SERVICE_SET_FERMENTATION_STEP_DURATION,
            async_handle_set_fermentation_step_duration,
            schema=SET_FERMENTATION_STEP_DURATION_SCHEMA,
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
