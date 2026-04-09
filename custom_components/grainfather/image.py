from __future__ import annotations

from homeassistant.components.image import ImageEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceEntryType
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .api import (
    GrainfatherBrewSession,
    brew_session_device_identifier,
    brew_session_display_name,
    brew_session_unique_fragment,
)
from .const import DOMAIN
from .coordinator import GrainfatherDataUpdateCoordinator


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: GrainfatherDataUpdateCoordinator = hass.data[DOMAIN][entry.entry_id]

    entities = [
        GrainfatherSessionRecipeImage(
            coordinator,
            entry,
            session.batch_id,
            brew_session_unique_fragment(session),
        )
        for session in coordinator.data.brew_sessions
        if session.recipe_image_url
    ]

    async_add_entities(entities)


class GrainfatherSessionRecipeImage(
    CoordinatorEntity[GrainfatherDataUpdateCoordinator],
    ImageEntity,
):
    _attr_translation_key = "session_recipe_image"

    def __init__(
        self,
        coordinator: GrainfatherDataUpdateCoordinator,
        entry: ConfigEntry,
        batch_id: int | str | None,
        session_unique_fragment: str,
    ) -> None:
        super().__init__(coordinator)
        self._batch_id = batch_id
        self._attr_has_entity_name = True
        self._attr_unique_id = f"{entry.entry_id}_session_{session_unique_fragment}_recipe_image"

    @property
    def _session(self) -> GrainfatherBrewSession | None:
        for session in self.coordinator.data.brew_sessions:
            if str(session.batch_id) == str(self._batch_id):
                return session
        return None

    @property
    def available(self) -> bool:
        session = self._session
        return session is not None and bool(session.recipe_image_url)

    @property
    def image_url(self) -> str | None:
        session = self._session
        return session.recipe_image_url if session else None

    @property
    def device_info(self) -> DeviceInfo | None:
        session = self._session
        if session is None:
            return None
        return DeviceInfo(
            identifiers={(DOMAIN, brew_session_device_identifier(session))},
            name=brew_session_display_name(session),
            manufacturer="fidley",
            model="Brew Session",
            entry_type=DeviceEntryType.SERVICE,
        )
