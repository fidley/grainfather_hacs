from __future__ import annotations

from datetime import timedelta
import logging

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed

from .api import (
    GrainfatherApiClient,
    GrainfatherApiError,
    GrainfatherAuthenticationError,
    GrainfatherSnapshot,
)
from .const import CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL, DOMAIN

LOGGER = logging.getLogger(__name__)


class GrainfatherDataUpdateCoordinator(DataUpdateCoordinator[GrainfatherSnapshot]):
    def __init__(
        self,
        hass: HomeAssistant,
        api: GrainfatherApiClient,
        entry: ConfigEntry,
    ) -> None:
        interval = entry.options.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)
        super().__init__(
            hass,
            logger=LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=interval),
        )
        self.api = api

    async def _async_update_data(self) -> GrainfatherSnapshot:
        try:
            return await self.api.async_get_snapshot()
        except GrainfatherAuthenticationError as err:
            raise UpdateFailed(f"Authentication failed: {err}") from err
        except GrainfatherApiError as err:
            raise UpdateFailed(f"Unable to fetch Grainfather data: {err}") from err
