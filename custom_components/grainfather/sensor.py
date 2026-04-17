from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from homeassistant.components.sensor import SensorEntity, SensorEntityDescription
from homeassistant.components.sensor import SensorDeviceClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfTemperature
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceEntryType
from homeassistant.helpers.entity import DeviceInfo
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .api import (
    GrainfatherHistoryPoint,
    GrainfatherBrewSession,
    GrainfatherFermentationDevice,
    GrainfatherSnapshot,
    brew_session_device_identifier,
    brew_session_display_name,
    brew_session_unique_fragment,
)
from .const import BREW_SESSION_STATUS_NAME_BY_CODE, DOMAIN
from .coordinator import GrainfatherDataUpdateCoordinator

_MAX_EXPOSED_HISTORY_POINTS = 500


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
        key="batch_number",
        translation_key="session_batch_number",
        value_fn=lambda s: s.batch_number,
        attributes_fn=lambda s, snapshot: _session_batch_number_attributes(s, snapshot),
    ),
    GrainfatherSessionSensorDescription(
        key="abv",
        translation_key="session_abv",
        native_unit_of_measurement="%vol",
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
        key="batch_variant_name",
        translation_key="session_batch_variant_name",
        value_fn=lambda s: s.batch_variant_name,
    ),
    GrainfatherSessionSensorDescription(
        key="recipe_image_url",
        translation_key="session_recipe_image_url",
        value_fn=lambda s: s.recipe_image_url,
    ),
)


def _serialize_history_points(points: tuple[GrainfatherHistoryPoint, ...]) -> list[dict[str, Any]]:
    # Keep attributes reasonably small for Home Assistant state storage.
    recent_points = points[-_MAX_EXPOSED_HISTORY_POINTS:]
    return [
        {
            "timestamp": point.timestamp,
            "temperature": point.temperature,
            "specific_gravity": point.specific_gravity,
            "device_id": point.device_id,
            "brew_session_id": point.brew_session_id,
        }
        for point in recent_points
    ]


def _session_batch_number_attributes(
    session: GrainfatherBrewSession,
    snapshot: GrainfatherSnapshot,
) -> dict[str, Any]:
    history: tuple[GrainfatherHistoryPoint, ...] = tuple()
    batch_id_int = None
    if session.batch_id is not None:
        try:
            batch_id_int = int(session.batch_id)
        except (TypeError, ValueError):
            batch_id_int = None

    if batch_id_int is not None:
        history = snapshot.brew_session_history_by_batch_id.get(batch_id_int, tuple())

    return {
        "grainfather_entity_type": "brew_session",
        "batch_number": session.batch_number if session.batch_number is not None else 0,
        "batch_variant_name": session.batch_variant_name,
        "status": BREW_SESSION_STATUS_NAME_BY_CODE.get(session.status or -1, "unknown"),
        "brew_session_id": session.batch_id,
        "recipe_id": session.recipe_id,
        "session_name": session.session_name,
        "recipe_name": session.recipe_name,
        "condition_date": session.condition_date,
        "fermentation_start_date": session.fermentation_start_date,
        "created_at": session.created_at,
        "recipe_image_url": session.recipe_image_url,
        "notes": session.notes,
        "equipment_name": session.equipment_name,
        "fermentation_device_ids": list(session.fermentation_device_ids),
        "fermentation_steps": [
            {
                "index": i,
                "name": step.name,
                "temperature": step.temperature,
                "duration_minutes": step.duration,
                "is_ramp_step": step.is_ramp_step,
            }
            for i, step in enumerate(session.fermentation_steps)
        ],
        "history_points": _serialize_history_points(history),
        "history_points_count": len(history),
    }


def _session_device_info(session: GrainfatherBrewSession) -> DeviceInfo:
    return DeviceInfo(
        identifiers={(DOMAIN, brew_session_device_identifier(session))},
        name=brew_session_display_name(session),
        manufacturer="fidley",
        model="Brew Session",
        entry_type=DeviceEntryType.SERVICE,
    )


def _ferm_device_info(
    device: GrainfatherFermentationDevice,
    snapshot: GrainfatherSnapshot,
) -> DeviceInfo:
    kwargs: dict[str, Any] = {
        "identifiers": {(DOMAIN, f"fermdevice_{device.device_id}")},
        "name": device.name or f"Fermentation Device {device.device_id}",
        "manufacturer": "fidley",
        "model": "Fermentation Device",
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
    known_unique_ids: set[str] = set()

    entities = _build_sensor_entities(coordinator, entry, known_unique_ids)
    async_add_entities(entities)

    def _async_handle_coordinator_update() -> None:
        new_entities = _build_sensor_entities(coordinator, entry, known_unique_ids)
        if new_entities:
            async_add_entities(new_entities)

    entry.async_on_unload(coordinator.async_add_listener(_async_handle_coordinator_update))


def _build_sensor_entities(
    coordinator: GrainfatherDataUpdateCoordinator,
    entry: ConfigEntry,
    known_unique_ids: set[str],
) -> list[SensorEntity]:
    entities: list[SensorEntity] = []

    for session in coordinator.data.brew_sessions:
        session_fragment = brew_session_unique_fragment(session)
        for description in SESSION_SENSORS:
            unique_id = f"{entry.entry_id}_session_{session_fragment}_{description.key}"
            if unique_id in known_unique_ids:
                continue
            known_unique_ids.add(unique_id)
            entities.append(
                GrainfatherSessionSensor(
                    coordinator,
                    entry,
                    session.batch_id,
                    session_fragment,
                    description,
                )
            )

    for device in coordinator.data.fermentation_devices:
        if device.device_id is None:
            continue

        temp_unique_id = f"{entry.entry_id}_fermdevice_{device.device_id}_temperature"
        if temp_unique_id not in known_unique_ids:
            known_unique_ids.add(temp_unique_id)
            entities.append(
                GrainfatherFermDeviceTemperatureSensor(coordinator, entry, device.device_id)
            )

        gravity_unique_id = f"{entry.entry_id}_fermdevice_{device.device_id}_gravity"
        if gravity_unique_id not in known_unique_ids:
            known_unique_ids.add(gravity_unique_id)
            entities.append(
                GrainfatherFermDeviceGravitySensor(coordinator, entry, device.device_id)
            )

    return entities


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

    async def async_added_to_hass(self) -> None:
        """Write updated state whenever coordinator data changes."""
        await super().async_added_to_hass()
        self.async_on_remove(
            self.coordinator.async_add_listener(self._force_state_write_if_batch_number)
        )

    def _force_state_write_if_batch_number(self) -> None:
        """Force state write for the batch-number anchor sensor."""
        if self.entity_description.key == "batch_number":
            self.async_write_ha_state()

    @property
    def entity_picture(self) -> str | None:
        if self.entity_description.key != "recipe_image_url":
            return None
        session = self._session
        if session is None:
            return None
        return session.recipe_image_url



class GrainfatherFermDeviceTemperatureSensor(
    CoordinatorEntity[GrainfatherDataUpdateCoordinator],
    SensorEntity,
):
    _attr_translation_key = "fermdevice_temperature"
    _attr_device_class = SensorDeviceClass.TEMPERATURE
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
        history = self.coordinator.data.fermentation_history_by_device_id.get(
            device.device_id or -1,
            tuple(),
        )
        return {
            "grainfather_entity_type": "fermentation_device",
            "device_id": device.device_id,
            "last_heard": device.last_heard,
            "last_specific_gravity": device.last_specific_gravity,
            "linked_brew_session_id": device.linked_brew_session_id,
            "linked_brew_session_name": device.linked_brew_session_name,
            "is_controller_linked": device.is_controller_linked,
            "history_points": _serialize_history_points(history),
            "history_points_count": len(history),
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
        history = self.coordinator.data.fermentation_history_by_device_id.get(
            device.device_id or -1,
            tuple(),
        )
        return {
            "device_id": device.device_id,
            "last_heard": device.last_heard,
            "linked_brew_session_id": device.linked_brew_session_id,
            "linked_brew_session_name": device.linked_brew_session_name,
            "history_points": _serialize_history_points(history),
            "history_points_count": len(history),
        }

