from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.device_registry import DeviceEntryType
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .api import GrainfatherBrewSession
from .const import (
    BREW_SESSION_STATUS_NAME_BY_CODE,
    DOMAIN,
    normalize_brew_session_status,
)
from .coordinator import GrainfatherDataUpdateCoordinator

STATUS_OPTIONS = list(BREW_SESSION_STATUS_NAME_BY_CODE.values())


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: GrainfatherDataUpdateCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        GrainfatherSessionStatusSelect(coordinator, entry, session.batch_id)
        for session in coordinator.data.brew_sessions
    )


class GrainfatherSessionStatusSelect(
    CoordinatorEntity[GrainfatherDataUpdateCoordinator],
    SelectEntity,
):
    _attr_translation_key = "session_status"
    _attr_options = STATUS_OPTIONS

    def __init__(
        self,
        coordinator: GrainfatherDataUpdateCoordinator,
        entry: ConfigEntry,
        batch_id: int | str | None,
    ) -> None:
        super().__init__(coordinator)
        self._batch_id = batch_id
        self._attr_has_entity_name = True
        self._attr_unique_id = f"{entry.entry_id}_session_{batch_id}_status_select"

    @property
    def _session(self) -> GrainfatherBrewSession | None:
        for session in self.coordinator.data.brew_sessions:
            if str(session.batch_id) == str(self._batch_id):
                return session
        return None

    @property
    def available(self) -> bool:
        return self._session is not None

    @property
    def device_info(self) -> DeviceInfo | None:
        session = self._session
        if session is None:
            return None
        return DeviceInfo(
            identifiers={(DOMAIN, f"session_{session.batch_id}")},
            name=session.session_name or session.recipe_name or f"Batch {session.batch_id}",
            manufacturer="Grainfather",
            model=session.style_name,
            entry_type=DeviceEntryType.SERVICE,
        )

    @property
    def current_option(self) -> str | None:
        session = self._session
        if session is None:
            return None
        return BREW_SESSION_STATUS_NAME_BY_CODE.get(session.status)

    async def async_select_option(self, option: str) -> None:
        session = self._session
        if session is None:
            raise HomeAssistantError("Brew session not found")

        recipe_id = session.recipe_id
        batch_id = session.batch_id
        if recipe_id is None:
            raise HomeAssistantError(f"Cannot resolve recipe_id for session {self._batch_id}")
        if batch_id is None:
            raise HomeAssistantError(f"Cannot resolve brew_session_id for session {self._batch_id}")

        status = normalize_brew_session_status(option)
        await self.coordinator.api.async_set_brew_session_status(recipe_id, int(batch_id), status)
        await self.coordinator.async_request_refresh()
