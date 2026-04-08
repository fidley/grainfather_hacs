from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from homeassistant.components.sensor import SensorEntity, SensorEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import PERCENTAGE, UnitOfTemperature
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceEntryType
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .api import (
    GrainfatherBrewSession,
    GrainfatherFermentationDevice,
    GrainfatherSnapshot,
    brew_session_device_identifier,
    brew_session_display_name,
    brew_session_unique_fragment,
)
from .const import DOMAIN, brew_session_status_name
from .coordinator import GrainfatherDataUpdateCoordinator


@dataclass(frozen=True, kw_only=True)
class GrainfatherSessionSensorDescription(SensorEntityDescription):
    value_fn: Callable[[GrainfatherBrewSession], Any]
    attributes_fn: Callable[[GrainfatherBrewSession, GrainfatherSnapshot], dict[str, Any] | None] | None = None


def _calc_abv(og: float | None, fg: float | None) -> float | None:
    if og is None or fg is None:
        return None
    return round((og - fg) * 131.25, 2)


SESSION_SENSORS: tuple[GrainfatherSessionSensorDescription, ...] = (
    GrainfatherSessionSensorDescription(
        key="status",
        translation_key="session_status",
        value_fn=lambda s: brew_session_status_name(s.status),
    ),
    GrainfatherSessionSensorDescription(
        key="abv",
        translation_key="session_abv",
        native_unit_of_measurement=PERCENTAGE,
        suggested_display_precision=1,
        value_fn=lambda s: _calc_abv(s.original_gravity, s.final_gravity),
    ),
    GrainfatherSessionSensorDescription(
        key="style",
        translation_key="session_style",
        value_fn=lambda s: s.style_name,
    ),
    GrainfatherSessionSensorDescription(
        key="original_gravity",
        translation_key="session_original_gravity",
        suggested_display_precision=4,
        value_fn=lambda s: s.original_gravity,
    ),
    GrainfatherSessionSensorDescription(
        key="final_gravity",
        translation_key="session_final_gravity",
        suggested_display_precision=4,
        value_fn=lambda s: s.final_gravity,
    ),
    GrainfatherSessionSensorDescription(
        key="batch_number",
        translation_key="session_batch_number",
        value_fn=lambda s: s.batch_number,
        attributes_fn=lambda s, snapshot: {
            "brew_session_id": s.batch_id,
            "recipe_id": s.recipe_id,
            "session_name": s.session_name,
            "recipe_name": s.recipe_name,
            "batch_variant": s.batch_variant_name,
            "equipment_name": s.equipment_name,
            "fermentation_device_ids": list(s.fermentation_device_ids),
            "fermentation_steps": [
                {
                    "index": i,
                    "name": step.name,
                    "temperature": step.temperature,
                    "duration_minutes": step.duration,
                    "is_ramp_step": step.is_ramp_step,
                }
                for i, step in enumerate(s.fermentation_steps)
            ],
        },
    ),
)


def _session_device_info(session: GrainfatherBrewSession) -> DeviceInfo:
    return DeviceInfo(
        identifiers={(DOMAIN, brew_session_device_identifier(session))},
        name=brew_session_display_name(session),
        manufacturer="Grainfather",
        model=session.style_name,
        entry_type=DeviceEntryType.SERVICE,
    )


def _ferm_device_info(
    device: GrainfatherFermentationDevice,
    snapshot: GrainfatherSnapshot,
) -> DeviceInfo:
    kwargs: dict[str, Any] = {
        "identifiers": {(DOMAIN, f"fermdevice_{device.device_id}")},
        "name": device.name or f"Fermentation Device {device.device_id}",
        "manufacturer": "Grainfather",
        "entry_type": DeviceEntryType.SERVICE,
    }
    linked_session = next(
        (
            session
            for session in snapshot.brew_sessions
            if device.linked_brew_session_id is not None
            and str(session.batch_id) == str(device.linked_brew_session_id)
        ),
        None,
    )
    if linked_session is not None:
        kwargs["via_device"] = (DOMAIN, brew_session_device_identifier(linked_session))
    return DeviceInfo(**kwargs)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: GrainfatherDataUpdateCoordinator = hass.data[DOMAIN][entry.entry_id]
    entities: list[SensorEntity] = []

    for session in coordinator.data.brew_sessions:
        entities.extend(
            GrainfatherSessionSensor(
                coordinator,
                entry,
                session.batch_id,
                brew_session_unique_fragment(session),
                description,
            )
            for description in SESSION_SENSORS
        )

    for device in coordinator.data.fermentation_devices:
        entities.append(GrainfatherFermDeviceTemperatureSensor(coordinator, entry, device.device_id))
        entities.append(GrainfatherFermDeviceGravitySensor(coordinator, entry, device.device_id))

    async_add_entities(entities)


class GrainfatherSessionSensor(
    CoordinatorEntity[GrainfatherDataUpdateCoordinator],
    SensorEntity,
):
    entity_description: GrainfatherSessionSensorDescription

    def __init__(
        self,
        coordinator: GrainfatherDataUpdateCoordinator,
        entry: ConfigEntry,
        batch_id: int | str | None,
        session_unique_fragment: str,
        description: GrainfatherSessionSensorDescription,
    ) -> None:
        super().__init__(coordinator)
        self.entity_description = description
        self._batch_id = batch_id
        self._attr_has_entity_name = True
        self._attr_unique_id = (
            f"{entry.entry_id}_session_{session_unique_fragment}_{description.key}"
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
        return _session_device_info(session)

    @property
    def native_value(self) -> Any:
        session = self._session
        if session is None:
            return None
        return self.entity_description.value_fn(session)

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        session = self._session
        if session is None or self.entity_description.attributes_fn is None:
            return None
        return self.entity_description.attributes_fn(session, self.coordinator.data)


class GrainfatherFermDeviceTemperatureSensor(
    CoordinatorEntity[GrainfatherDataUpdateCoordinator],
    SensorEntity,
):
    _attr_translation_key = "fermdevice_temperature"
    _attr_native_unit_of_measurement = UnitOfTemperature.CELSIUS
    _attr_suggested_display_precision = 2

    def __init__(
        self,
        coordinator: GrainfatherDataUpdateCoordinator,
        entry: ConfigEntry,
        device_id: int | None,
    ) -> None:
        super().__init__(coordinator)
        self._device_id = device_id
        self._attr_has_entity_name = True
        self._attr_unique_id = f"{entry.entry_id}_fermdevice_{device_id}_temperature"

    @property
    def _device(self) -> GrainfatherFermentationDevice | None:
        for device in self.coordinator.data.fermentation_devices:
            if device.device_id == self._device_id:
                return device
        return None

    @property
    def available(self) -> bool:
        return self._device is not None

    @property
    def native_value(self) -> Any:
        device = self._device
        return device.last_temperature if device else None

    @property
    def device_info(self) -> DeviceInfo | None:
        device = self._device
        if device is None:
            return None
        return _ferm_device_info(device, self.coordinator.data)

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        device = self._device
        if device is None:
            return None
        return {
            "device_id": device.device_id,
            "last_heard": device.last_heard,
            "linked_brew_session_id": device.linked_brew_session_id,
            "linked_brew_session_name": device.linked_brew_session_name,
            "is_controller_linked": device.is_controller_linked,
        }


class GrainfatherFermDeviceGravitySensor(
    CoordinatorEntity[GrainfatherDataUpdateCoordinator],
    SensorEntity,
):
    _attr_translation_key = "fermdevice_gravity"
    _attr_suggested_display_precision = 4

    def __init__(
        self,
        coordinator: GrainfatherDataUpdateCoordinator,
        entry: ConfigEntry,
        device_id: int | None,
    ) -> None:
        super().__init__(coordinator)
        self._device_id = device_id
        self._attr_has_entity_name = True
        self._attr_unique_id = f"{entry.entry_id}_fermdevice_{device_id}_gravity"

    @property
    def _device(self) -> GrainfatherFermentationDevice | None:
        for device in self.coordinator.data.fermentation_devices:
            if device.device_id == self._device_id:
                return device
        return None

    @property
    def available(self) -> bool:
        return self._device is not None

    @property
    def native_value(self) -> Any:
        device = self._device
        return device.last_specific_gravity if device else None

    @property
    def device_info(self) -> DeviceInfo | None:
        device = self._device
        if device is None:
            return None
        return _ferm_device_info(device, self.coordinator.data)

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        device = self._device
        if device is None:
            return None
        return {
            "device_id": device.device_id,
            "last_heard": device.last_heard,
            "linked_brew_session_id": device.linked_brew_session_id,
            "linked_brew_session_name": device.linked_brew_session_name,
        }

