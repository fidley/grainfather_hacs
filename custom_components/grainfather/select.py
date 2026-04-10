from __future__ import annotations

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
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
from .const import (
    BREW_SESSION_STATUS_NAME_BY_CODE,
    DOMAIN,
    normalize_brew_session_status,
)
from .coordinator import GrainfatherDataUpdateCoordinator

STATUS_OPTIONS = list(BREW_SESSION_STATUS_NAME_BY_CODE.values())
RAMP_STEP_OPTIONS = ["off", "on"]


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: GrainfatherDataUpdateCoordinator = hass.data[DOMAIN][entry.entry_id]
    entities = [
        GrainfatherSessionStatusSelect(
            coordinator,
            entry,
            session.batch_id,
            brew_session_unique_fragment(session),
        )
        for session in coordinator.data.brew_sessions
    ]
    for session in coordinator.data.brew_sessions:
        for step_index in range(len(session.fermentation_steps)):
            entities.append(
                GrainfatherFermentationStepRampSelect(
                    coordinator,
                    entry,
                    session.batch_id,
                    brew_session_unique_fragment(session),
                    step_index,
                )
            )

    async_add_entities(entities)


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
        session_unique_fragment: str,
    ) -> None:
        super().__init__(coordinator)
        self._batch_id = batch_id
        self._attr_has_entity_name = True
        self._attr_unique_id = (
            f"{entry.entry_id}_session_{session_unique_fragment}_status_select"
        )

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
            identifiers={(DOMAIN, brew_session_device_identifier(session))},
            name=brew_session_display_name(session),
            manufacturer="fidley",
            model="Brew Session",
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


class GrainfatherFermentationStepRampSelect(
    CoordinatorEntity[GrainfatherDataUpdateCoordinator],
    SelectEntity,
):
    _attr_options = RAMP_STEP_OPTIONS

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
            f"{entry.entry_id}_session_{session_unique_fragment}_step_{step_index}_ramp_select"
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
            return f"{step_name} ramp step"
        return f"Step {self._step_index + 1} ramp step"

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

    @property
    def current_option(self) -> str | None:
        session = self._session
        if session is None or self._step_index >= len(session.fermentation_steps):
            return None
        return "on" if session.fermentation_steps[self._step_index].is_ramp_step else "off"

    async def async_select_option(self, option: str) -> None:
        if option not in RAMP_STEP_OPTIONS:
            raise HomeAssistantError(f"Unsupported ramp step option: {option}")

        session = self._session
        if session is None:
            raise HomeAssistantError("Brew session not found")
        if self._step_index >= len(session.fermentation_steps):
            raise HomeAssistantError(
                f"Step index {self._step_index} is out of range for this session"
            )
        if session.recipe_id is None:
            raise HomeAssistantError(f"Cannot resolve recipe_id for session {self._batch_id}")
        if session.batch_id is None:
            raise HomeAssistantError(f"Cannot resolve brew_session_id for session {self._batch_id}")

        await self.coordinator.api.async_set_fermentation_step_duration(
            session.recipe_id,
            int(session.batch_id),
            self._step_index,
            is_ramp_step=(option == "on"),
        )
        await self.coordinator.async_request_refresh()
