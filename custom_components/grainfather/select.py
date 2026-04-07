from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import (
    BREW_SESSION_STATUS_NAME_BY_CODE,
    DOMAIN,
    normalize_brew_session_status,
)
from .coordinator import GrainfatherDataUpdateCoordinator

STATUS_OPTIONS = [
    BREW_SESSION_STATUS_NAME_BY_CODE[0],
    BREW_SESSION_STATUS_NAME_BY_CODE[10],
    BREW_SESSION_STATUS_NAME_BY_CODE[20],
    BREW_SESSION_STATUS_NAME_BY_CODE[30],
    BREW_SESSION_STATUS_NAME_BY_CODE[40],
]


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: GrainfatherDataUpdateCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities([GrainfatherBatchStatusSelect(coordinator, entry)])


class GrainfatherBatchStatusSelect(
    CoordinatorEntity[GrainfatherDataUpdateCoordinator],
    SelectEntity,
):
    def __init__(
        self,
        coordinator: GrainfatherDataUpdateCoordinator,
        entry: ConfigEntry,
    ) -> None:
        super().__init__(coordinator)
        self._attr_has_entity_name = True
        self._attr_unique_id = f"{entry.entry_id}_batch_status_select"
        self._attr_translation_key = "batch_status_select"
        self._attr_options = STATUS_OPTIONS

    @property
    def current_option(self) -> str | None:
        active_batch = self.coordinator.data.active_batch
        if active_batch is None:
            return None

        status_name = BREW_SESSION_STATUS_NAME_BY_CODE.get(active_batch.status)
        if status_name in self.options:
            return status_name
        return None

    async def async_select_option(self, option: str) -> None:
        active_batch = self.coordinator.data.active_batch
        if active_batch is None:
            raise HomeAssistantError("No active Grainfather brew session is available")

        recipe_id = active_batch.recipe_id
        batch_id = active_batch.batch_id
        if recipe_id is None:
            raise HomeAssistantError("Cannot resolve recipe_id for the active brew session")
        if batch_id is None:
            raise HomeAssistantError("Cannot resolve brew_session_id for the active batch")

        status = normalize_brew_session_status(option)
        await self.coordinator.api.async_set_brew_session_status(recipe_id, int(batch_id), status)
        await self.coordinator.async_request_refresh()