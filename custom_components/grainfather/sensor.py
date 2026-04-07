from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from homeassistant.components.sensor import SensorEntity, SensorEntityDescription
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfTemperature
from homeassistant.core import HomeAssistant
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .api import (
    GrainfatherEquipmentProfile,
    GrainfatherFermentationDevice,
    GrainfatherSnapshot,
)
from .const import DOMAIN, brew_session_status_name
from .coordinator import GrainfatherDataUpdateCoordinator


@dataclass(frozen=True, kw_only=True)
class GrainfatherSensorDescription(SensorEntityDescription):
    value_fn: Callable[[GrainfatherSnapshot], Any]
    attributes_fn: Callable[[GrainfatherSnapshot], dict[str, Any] | None] | None = None


SENSORS: tuple[GrainfatherSensorDescription, ...] = (
    GrainfatherSensorDescription(
        key="account_email",
        translation_key="account_email",
        value_fn=lambda snapshot: snapshot.account.email,
    ),
    GrainfatherSensorDescription(
        key="session_name",
        translation_key="session_name",
        value_fn=lambda snapshot: snapshot.active_batch.session_name if snapshot.active_batch else None,
        attributes_fn=lambda snapshot: _active_batch_attributes(snapshot),
    ),
    GrainfatherSensorDescription(
        key="recipe_name",
        translation_key="recipe_name",
        value_fn=lambda snapshot: snapshot.active_batch.recipe_name if snapshot.active_batch else None,
    ),
    GrainfatherSensorDescription(
        key="batch_status",
        translation_key="batch_status",
        value_fn=lambda snapshot: snapshot.active_batch.status if snapshot.active_batch else None,
        attributes_fn=lambda snapshot: {
            "status_name": brew_session_status_name(snapshot.active_batch.status)
            if snapshot.active_batch
            else None
        },
    ),
    GrainfatherSensorDescription(
        key="batch_number",
        translation_key="batch_number",
        value_fn=lambda snapshot: snapshot.active_batch.batch_number if snapshot.active_batch else None,
    ),
    GrainfatherSensorDescription(
        key="batch_variant",
        translation_key="batch_variant",
        value_fn=lambda snapshot: snapshot.active_batch.batch_variant_name if snapshot.active_batch else None,
    ),
    GrainfatherSensorDescription(
        key="original_gravity",
        translation_key="original_gravity",
        suggested_display_precision=3,
        value_fn=lambda snapshot: snapshot.active_batch.original_gravity if snapshot.active_batch else None,
    ),
    GrainfatherSensorDescription(
        key="final_gravity",
        translation_key="final_gravity",
        suggested_display_precision=3,
        value_fn=lambda snapshot: snapshot.active_batch.final_gravity if snapshot.active_batch else None,
    ),
    GrainfatherSensorDescription(
        key="fermentation_device_count",
        translation_key="fermentation_device_count",
        value_fn=lambda snapshot: snapshot.active_batch.fermentation_device_count if snapshot.active_batch else 0,
        attributes_fn=lambda snapshot: {
            "fermentation_devices": [
                {
                    "id": device.device_id,
                    "name": device.name,
                    "linked_brew_session_id": device.linked_brew_session_id,
                    "linked_brew_session_name": device.linked_brew_session_name,
                }
                for device in snapshot.fermentation_devices
            ]
        },
    ),
    GrainfatherSensorDescription(
        key="equipment_name",
        translation_key="equipment_name",
        value_fn=lambda snapshot: snapshot.active_batch.equipment_name if snapshot.active_batch else None,
        attributes_fn=lambda snapshot: _active_equipment_attributes(snapshot),
    ),
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    coordinator: GrainfatherDataUpdateCoordinator = hass.data[DOMAIN][entry.entry_id]
    entities: list[SensorEntity] = [
        GrainfatherSensor(coordinator, entry, description) for description in SENSORS
    ]
    entities.extend(
        GrainfatherFermentationDeviceMetricSensor(coordinator, entry, device, metric="temperature")
        for device in coordinator.data.fermentation_devices
    )
    entities.extend(
        GrainfatherFermentationDeviceMetricSensor(coordinator, entry, device, metric="gravity")
        for device in coordinator.data.fermentation_devices
    )
    entities.extend(
        GrainfatherEquipmentProfileSensor(coordinator, entry, profile)
        for profile in coordinator.data.equipment_profiles
    )
    async_add_entities(entities)


class GrainfatherSensor(
    CoordinatorEntity[GrainfatherDataUpdateCoordinator],
    SensorEntity,
):
    entity_description: GrainfatherSensorDescription

    def __init__(
        self,
        coordinator: GrainfatherDataUpdateCoordinator,
        entry: ConfigEntry,
        description: GrainfatherSensorDescription,
    ) -> None:
        super().__init__(coordinator)
        self.entity_description = description
        self._attr_has_entity_name = True
        self._attr_unique_id = f"{entry.entry_id}_{description.key}"

    @property
    def native_value(self) -> Any:
        return self.entity_description.value_fn(self.coordinator.data)

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        if self.entity_description.attributes_fn is None:
            return None
        return self.entity_description.attributes_fn(self.coordinator.data)


class GrainfatherFermentationDeviceMetricSensor(
    CoordinatorEntity[GrainfatherDataUpdateCoordinator],
    SensorEntity,
):
    def __init__(
        self,
        coordinator: GrainfatherDataUpdateCoordinator,
        entry: ConfigEntry,
        fermentation_device: GrainfatherFermentationDevice,
        metric: str,
    ) -> None:
        super().__init__(coordinator)
        self._device_id = fermentation_device.device_id
        self._metric = metric
        self._attr_has_entity_name = True
        metric_name = "temperature" if metric == "temperature" else "gravity"
        self._attr_name = f"Fermentation device {fermentation_device.name or self._device_id} {metric_name}"
        self._attr_unique_id = (
            f"{entry.entry_id}_fermentation_device_{self._device_id}_{metric_name}"
        )
        self._attr_suggested_display_precision = 2
        if metric == "temperature":
            self._attr_native_unit_of_measurement = UnitOfTemperature.CELSIUS

    @property
    def available(self) -> bool:
        return self._device is not None

    @property
    def native_value(self) -> Any:
        if self._device is None:
            return None
        if self._metric == "temperature":
            return self._device.last_temperature
        return self._device.last_specific_gravity

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        if self._device is None:
            return None
        return {
            "device_id": self._device.device_id,
            "device_type_id": self._device.fermentation_device_type_id,
            "linked_brew_session_id": self._device.linked_brew_session_id,
            "linked_brew_session_name": self._device.linked_brew_session_name,
            "last_heard": self._device.last_heard,
            "last_specific_gravity": self._device.last_specific_gravity,
            "is_controller_linked": self._device.is_controller_linked,
        }

    @property
    def _device(self) -> GrainfatherFermentationDevice | None:
        for device in self.coordinator.data.fermentation_devices:
            if device.device_id == self._device_id:
                return device
        return None


class GrainfatherEquipmentProfileSensor(
    CoordinatorEntity[GrainfatherDataUpdateCoordinator],
    SensorEntity,
):
    def __init__(
        self,
        coordinator: GrainfatherDataUpdateCoordinator,
        entry: ConfigEntry,
        equipment_profile: GrainfatherEquipmentProfile,
    ) -> None:
        super().__init__(coordinator)
        self._profile_id = equipment_profile.profile_id
        self._attr_has_entity_name = True
        self._attr_name = f"Equipment profile {equipment_profile.name or self._profile_id}"
        self._attr_unique_id = f"{entry.entry_id}_equipment_profile_{self._profile_id}"

    @property
    def available(self) -> bool:
        return self._profile is not None

    @property
    def native_value(self) -> Any:
        if self._profile is None:
            return None
        return self._profile.batch_size

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        if self._profile is None:
            return None

        active_profile_id = None
        if self.coordinator.data.active_batch and self.coordinator.data.active_batch.equipment_profile:
            active_profile_id = self.coordinator.data.active_batch.equipment_profile.profile_id

        return {
            "profile_id": self._profile.profile_id,
            "brand": self._profile.brand,
            "mash_volume": self._profile.mash_volume,
            "boil_volume": self._profile.boil_volume,
            "unit_type_id": self._profile.unit_type_id,
            "is_active_profile": self._profile.profile_id == active_profile_id,
        }

    @property
    def _profile(self) -> GrainfatherEquipmentProfile | None:
        for profile in self.coordinator.data.equipment_profiles:
            if profile.profile_id == self._profile_id:
                return profile
        return None


def _active_batch_attributes(snapshot: GrainfatherSnapshot) -> dict[str, Any] | None:
    batch = snapshot.active_batch
    if batch is None:
        return None

    linked_ids = set(batch.fermentation_device_ids)
    linked_devices = [
        device
        for device in snapshot.fermentation_devices
        if device.device_id in linked_ids
    ]

    return {
        "brew_session_id": batch.batch_id,
        "recipe_id": batch.recipe_id,
        "status_name": brew_session_status_name(batch.status),
        "fermentation_device_ids": list(batch.fermentation_device_ids),
        "fermentation_device_readings": [
            {
                "id": device.device_id,
                "name": device.name,
                "temperature": device.last_temperature,
                "gravity": device.last_specific_gravity,
                "last_heard": device.last_heard,
            }
            for device in linked_devices
        ],
        "fermentation_steps": [
            {
                "id": step.step_id,
                "name": step.name,
                "temperature": step.temperature,
                "time": step.duration,
                "order": step.order,
                "time_unit_id": step.time_unit_id,
                "is_ramp_step": step.is_ramp_step,
                "finish_temperature": step.finish_temperature,
            }
            for step in batch.fermentation_steps
        ],
    }


def _active_equipment_attributes(snapshot: GrainfatherSnapshot) -> dict[str, Any] | None:
    batch = snapshot.active_batch
    if batch is None or batch.equipment_profile is None:
        return None

    return {
        "profile_id": batch.equipment_profile.profile_id,
        "brand": batch.equipment_profile.brand,
        "batch_size": batch.equipment_profile.batch_size,
        "mash_volume": batch.equipment_profile.mash_volume,
        "boil_volume": batch.equipment_profile.boil_volume,
        "unit_type_id": batch.equipment_profile.unit_type_id,
    }
