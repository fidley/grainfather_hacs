from __future__ import annotations

from dataclasses import dataclass

from homeassistant.components.button import ButtonEntity, ButtonEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import GrainfatherDataUpdateCoordinator


@dataclass(frozen=True, kw_only=True)
class GrainfatherStatusButtonDescription(ButtonEntityDescription):
    target_status: int


BUTTONS: tuple[GrainfatherStatusButtonDescription, ...] = (
    GrainfatherStatusButtonDescription(
        key="set_status_planning",
        translation_key="set_status_planning",
        target_status=0,
    ),
    GrainfatherStatusButtonDescription(
        key="set_status_brewing",
        translation_key="set_status_brewing",
        target_status=10,
    ),
    GrainfatherStatusButtonDescription(
        key="set_status_fermenting",
        translation_key="set_status_fermenting",
        target_status=20,
    ),
    GrainfatherStatusButtonDescription(
        key="set_status_conditioning",
        translation_key="set_status_conditioning",
        target_status=30,
    ),
    GrainfatherStatusButtonDescription(
        key="set_status_completed",
        translation_key="set_status_completed",
        target_status=40,
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: GrainfatherDataUpdateCoordinator = hass.data[DOMAIN][entry.entry_id]
    async_add_entities(
        GrainfatherSetStatusButton(coordinator, entry, description)
        for description in BUTTONS
    )


class GrainfatherSetStatusButton(
    CoordinatorEntity[GrainfatherDataUpdateCoordinator],
    ButtonEntity,
):
    entity_description: GrainfatherStatusButtonDescription

    def __init__(
        self,
        coordinator: GrainfatherDataUpdateCoordinator,
        entry: ConfigEntry,
        description: GrainfatherStatusButtonDescription,
    ) -> None:
        super().__init__(coordinator)
        self.entity_description = description
        self._attr_has_entity_name = True
        self._attr_unique_id = f"{entry.entry_id}_{description.key}"

    async def async_press(self) -> None:
        active_batch = self.coordinator.data.active_batch
        if active_batch is None:
            raise HomeAssistantError("No active Grainfather brew session is available")

        batch_id = active_batch.batch_id
        recipe_id = active_batch.recipe_id
        if recipe_id is None:
            raise HomeAssistantError("Cannot resolve recipe_id for the active brew session")
        if not isinstance(batch_id, int):
            try:
                batch_id = int(batch_id)
            except (TypeError, ValueError) as err:
                raise HomeAssistantError("Cannot resolve brew_session_id for the active batch") from err

        await self.coordinator.api.async_set_brew_session_status(
            recipe_id,
            batch_id,
            self.entity_description.target_status,
        )
        await self.coordinator.async_request_refresh()