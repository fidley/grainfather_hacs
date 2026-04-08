from __future__ import annotations

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfTime
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
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

_MINUTES_PER_HOUR = 60


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: GrainfatherDataUpdateCoordinator = hass.data[DOMAIN][entry.entry_id]
    entities: list[NumberEntity] = []

    for session in coordinator.data.brew_sessions:
        for step_index in range(len(session.fermentation_steps)):
            entities.append(
                GrainfatherFermentationStepDurationNumber(
                    coordinator,
                    entry,
                    session.batch_id,
                    brew_session_unique_fragment(session),
                    step_index,
                )
            )

    async_add_entities(entities)


class GrainfatherFermentationStepDurationNumber(
    CoordinatorEntity[GrainfatherDataUpdateCoordinator],
    NumberEntity,
):
    _attr_native_min_value = 1.0
    _attr_native_max_value = 1440.0  # 60 days in hours
    _attr_native_step = 1.0
    _attr_native_unit_of_measurement = UnitOfTime.HOURS
    _attr_mode = NumberMode.BOX

    def __init__(
        self,
        coordinator: GrainfatherDataUpdateCoordinator,
        entry: ConfigEntry,
        batch_id: int | str | None,
        session_unique_fragment: str,
        step_index: int,
    ) -> None:
        super().__init__(coordinator)
        self._batch_id = batch_id
        self._step_index = step_index
        self._attr_has_entity_name = True
        self._attr_unique_id = (
            f"{entry.entry_id}_session_{session_unique_fragment}_step_{step_index}_duration"
        )

    @property
    def _session(self) -> GrainfatherBrewSession | None:
        for session in self.coordinator.data.brew_sessions:
            if str(session.batch_id) == str(self._batch_id):
                return session
        return None

    @property
    def available(self) -> bool:
        session = self._session
        if session is None:
            return False
        return self._step_index < len(session.fermentation_steps)

    @property
    def name(self) -> str:
        session = self._session
        if session is not None and self._step_index < len(session.fermentation_steps):
            step = session.fermentation_steps[self._step_index]
            step_name = step.name or f"Step {self._step_index + 1}"
            return f"{step_name} duration"
        return f"Step {self._step_index + 1} duration"

    @property
    def device_info(self) -> DeviceInfo | None:
        session = self._session
        if session is None:
            return None
        return DeviceInfo(
            identifiers={(DOMAIN, brew_session_device_identifier(session))},
            name=brew_session_display_name(session),
            manufacturer="Grainfather",
            model=session.style_name,
            entry_type=DeviceEntryType.SERVICE,
        )

    @property
    def native_value(self) -> float | None:
        session = self._session
        if session is None or self._step_index >= len(session.fermentation_steps):
            return None
        duration_minutes = session.fermentation_steps[self._step_index].duration
        if duration_minutes is None:
            return None
        return round(duration_minutes / _MINUTES_PER_HOUR, 1)

    async def async_set_native_value(self, value: float) -> None:
        session = self._session
        if session is None:
            raise HomeAssistantError("Brew session not found")
        if self._step_index >= len(session.fermentation_steps):
            raise HomeAssistantError(
                f"Step index {self._step_index} is out of range for this session"
            )
        if session.recipe_id is None or session.batch_id is None:
            raise HomeAssistantError(
                "Cannot resolve recipe_id or batch_id for this session"
            )
        duration_minutes = int(round(value * _MINUTES_PER_HOUR))
        await self.coordinator.api.async_set_fermentation_step_duration(
            session.recipe_id,
            int(session.batch_id),
            self._step_index,
            duration_minutes,
        )
        await self.coordinator.async_request_refresh()
