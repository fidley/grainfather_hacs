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
from .const import (
    BREW_SESSION_STATUS_COMPLETED,
    CONF_INCLUDE_COMPLETED_SESSIONS,
    CONF_SCAN_INTERVAL,
    DEFAULT_INCLUDE_COMPLETED_SESSIONS,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
)

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
        self.entry = entry

    async def _async_update_data(self) -> GrainfatherSnapshot:
        try:
            snapshot = await self.api.async_get_snapshot()
            include_completed = self.entry.options.get(
                CONF_INCLUDE_COMPLETED_SESSIONS,
                DEFAULT_INCLUDE_COMPLETED_SESSIONS,
            )
            if not include_completed:
                snapshot = _without_completed_sessions(snapshot)
            LOGGER.debug(
                "Refreshed Grainfather snapshot: %s sessions, %s fermentation devices",
                len(snapshot.brew_sessions),
                len(snapshot.fermentation_devices),
            )
            return snapshot
        except GrainfatherAuthenticationError as err:
            raise UpdateFailed(f"Authentication failed: {err}") from err
        except GrainfatherApiError as err:
            raise UpdateFailed(f"Unable to fetch Grainfather data: {err}") from err


def _without_completed_sessions(snapshot: GrainfatherSnapshot) -> GrainfatherSnapshot:
    filtered_sessions = tuple(
        session
        for session in snapshot.brew_sessions
        if session.status != BREW_SESSION_STATUS_COMPLETED
    )

    remaining_batch_ids = {
        int(session.batch_id)
        for session in filtered_sessions
        if session.batch_id is not None and str(session.batch_id).isdigit()
    }
    filtered_history_by_batch_id = {
        batch_id: points
        for batch_id, points in snapshot.brew_session_history_by_batch_id.items()
        if batch_id in remaining_batch_ids
    }

    return GrainfatherSnapshot(
        account=snapshot.account,
        brew_sessions=filtered_sessions,
        fermentation_devices=snapshot.fermentation_devices,
        fermentation_history_by_device_id=snapshot.fermentation_history_by_device_id,
        brew_session_history_by_batch_id=filtered_history_by_batch_id,
    )
