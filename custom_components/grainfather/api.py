from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import parse_qs, urlparse

from aiohttp import ClientResponseError, ClientSession


class GrainfatherApiError(Exception):
    """Base API exception."""


class GrainfatherAuthenticationError(GrainfatherApiError):
    """Raised when authentication fails."""


@dataclass(slots=True)
class GrainfatherAccount:
    user_id: str | None
    email: str | None
    first_name: str | None
    last_name: str | None


@dataclass(slots=True)
class GrainfatherBrewSession:
    batch_id: int | str | None
    recipe_id: int | None
    session_name: str | None
    recipe_name: str | None
    condition_date: str | None
    fermentation_start_date: str | None
    created_at: str | None
    recipe_image_url: str | None
    style_name: str | None
    batch_variant_name: str | None
    status: int | None
    batch_number: int | None
    original_gravity: float | None
    final_gravity: float | None
    fermentation_device_ids: tuple[int, ...]
    fermentation_device_count: int
    equipment_name: str | None
    fermentation_steps: tuple["GrainfatherFermentationStep", ...]
    equipment_profile: "GrainfatherEquipmentProfile | None"
    raw_payload: dict[str, Any]


@dataclass(slots=True)
class GrainfatherFermentationStep:
    step_id: int | None
    name: str | None
    temperature: float | None
    duration: int | None
    order: int | None
    time_unit_id: int | None
    is_ramp_step: bool
    finish_temperature: float | None


@dataclass(slots=True)
class GrainfatherEquipmentProfile:
    profile_id: int | None
    name: str | None
    brand: str | None
    batch_size: float | None
    mash_volume: float | None
    boil_volume: float | None
    unit_type_id: int | None
    raw_payload: dict[str, Any]


@dataclass(slots=True)
class GrainfatherFermentationDevice:
    device_id: int | None
    name: str | None
    fermentation_device_type_id: int | None
    linked_brew_session_id: int | None
    linked_brew_session_name: str | None
    last_heard: str | None
    last_specific_gravity: float | None
    last_temperature: float | None
    is_controller_linked: bool | None
    raw_payload: dict[str, Any]


@dataclass(slots=True)
class GrainfatherHistoryPoint:
    device_id: int
    brew_session_id: int | None
    timestamp: str | None
    temperature: float | None
    specific_gravity: float | None
    raw_payload: dict[str, Any]


@dataclass(slots=True)
class GrainfatherSnapshot:
    account: GrainfatherAccount
    brew_sessions: tuple[GrainfatherBrewSession, ...]
    fermentation_devices: tuple[GrainfatherFermentationDevice, ...]
    fermentation_history_by_device_id: dict[int, tuple[GrainfatherHistoryPoint, ...]] = field(
        default_factory=dict
    )
    brew_session_history_by_batch_id: dict[int, tuple[GrainfatherHistoryPoint, ...]] = field(
        default_factory=dict
    )


class GrainfatherApiClient:
    """Small async client for the Grainfather cloud API."""

    def __init__(self, session: ClientSession, email: str, password: str) -> None:
        self._session = session
        self._email = email
        self._password = password
        self._base_url = "https://community.grainfather.com/api"
        self._access_token: str | None = None
        self._account: GrainfatherAccount | None = None

    async def authenticate(self) -> None:
        payload = {"email": self._email, "password": self._password}

        try:
            async with self._session.post(
                f"{self._base_url}/auth/login",
                json=payload,
            ) as response:
                if response.status in (401, 403):
                    raise GrainfatherAuthenticationError("Invalid Grainfather credentials")
                response.raise_for_status()
                data = await response.json()
        except ClientResponseError as err:
            raise GrainfatherApiError(f"Authentication failed: {err}") from err

        token = data.get("api_token") or data.get("accessToken") or data.get("token")
        if not token:
            raise GrainfatherAuthenticationError("Authentication response did not include a token")

        self._access_token = token
        self._account = parse_account_payload(data)

    async def async_validate_credentials(self) -> bool:
        await self.authenticate()
        return True

    async def async_get_snapshot(self) -> GrainfatherSnapshot:
        sessions_list = await self.async_get_brew_sessions()

        brew_sessions: list[GrainfatherBrewSession] = []
        for session_item in sessions_list:
            recipe_id = _to_int(_first_value(session_item, "recipe_id")) or _to_int(
                _first_value(session_item.get("recipe") or {}, "id")
            )
            batch_id = _to_int(_first_value(session_item, "id", "batchId"))
            status = _to_int(_first_value(session_item, "status", "state"))

            # Fetch full detail for fermenting sessions to include fermentation steps
            if status == 20 and recipe_id is not None and batch_id is not None:
                try:
                    detail_payload = await self.async_get_brew_session_detail(recipe_id, batch_id)
                    batch = parse_batch_payload(detail_payload)
                except GrainfatherApiError:
                    batch = parse_batch_payload(session_item)
            else:
                batch = parse_batch_payload(session_item)

            if batch is not None:
                brew_sessions.append(batch)

        fermentation_devices = parse_fermentation_devices_payload(
            await self._request_json("GET", "/equipment/fermentation-devices")
        )

        history_from_date = (datetime.now(timezone.utc) - timedelta(days=90)).strftime("%Y-%m-%d")
        history_by_device_id: dict[int, list[GrainfatherHistoryPoint]] = {}
        history_by_batch_id: dict[int, list[GrainfatherHistoryPoint]] = {}

        for device in fermentation_devices:
            if device.device_id is None:
                continue

            try:
                history_payload = await self.async_get_fermentation_device_history(
                    device.device_id,
                    from_date=history_from_date,
                    data_format="raw",
                    metric=True,
                )
            except GrainfatherApiError:
                continue

            points = list(parse_fermentation_device_history_points(history_payload, device.device_id))
            if not points:
                continue

            points.sort(
                key=lambda point: _parse_datetime(point.timestamp)
                or datetime.min.replace(tzinfo=timezone.utc)
            )
            history_by_device_id[device.device_id] = points

            for point in points:
                if point.brew_session_id is not None:
                    history_by_batch_id.setdefault(point.brew_session_id, []).append(point)

        frozen_history_by_device_id = {
            device_id: tuple(points) for device_id, points in history_by_device_id.items()
        }
        frozen_history_by_batch_id = {
            batch_id: tuple(points) for batch_id, points in history_by_batch_id.items()
        }

        return GrainfatherSnapshot(
            account=self._account or GrainfatherAccount(None, self._email, None, None),
            brew_sessions=tuple(brew_sessions),
            fermentation_devices=fermentation_devices,
            fermentation_history_by_device_id=frozen_history_by_device_id,
            brew_session_history_by_batch_id=frozen_history_by_batch_id,
        )

    async def async_get_brew_sessions(self) -> list[dict[str, Any]]:
        sessions: list[dict[str, Any]] = []
        current_page = 1
        seen_pages: set[int] = set()

        while current_page not in seen_pages:
            seen_pages.add(current_page)
            payload = await self._request_json(
                "GET",
                "/2/brew-sessions",
                query_params={"deleted": 1, "page": current_page},
            )
            sessions.extend(payload.get("data") or [])

            next_page = _extract_next_page(payload)
            if next_page is None:
                break
            current_page = next_page

        return sessions

    async def async_get_brew_session_detail(
        self,
        recipe_id: int,
        brew_session_id: int,
    ) -> dict[str, Any]:
        return await self._request_json(
            "GET",
            f"/recipes/{recipe_id}/brew-sessions/{brew_session_id}",
        )

    async def async_set_brew_session_status(
        self,
        recipe_id: int,
        brew_session_id: int,
        status: int,
    ) -> GrainfatherBrewSession | None:
        detail_payload = await self.async_get_brew_session_detail(recipe_id, brew_session_id)
        updated_payload = build_brew_session_update_payload(detail_payload, status=status)
        result = await self._request_json(
            "PUT",
            f"/recipes/{recipe_id}/brew-sessions/{brew_session_id}",
            json_payload=updated_payload,
        )
        return parse_batch_payload(result)

    async def async_set_fermentation_steps(
        self,
        recipe_id: int,
        brew_session_id: int,
        fermentation_steps: list[dict[str, Any]],
    ) -> GrainfatherBrewSession | None:
        detail_payload = await self.async_get_brew_session_detail(recipe_id, brew_session_id)
        updated_payload = build_brew_session_update_payload(
            detail_payload,
            fermentation_steps=fermentation_steps,
        )
        result = await self._request_json(
            "PUT",
            f"/recipes/{recipe_id}/brew-sessions/{brew_session_id}",
            json_payload=updated_payload,
        )
        return parse_batch_payload(result)

    async def async_set_fermentation_step_duration(
        self,
        recipe_id: int,
        brew_session_id: int,
        step_index: int,
        duration_minutes: int,
    ) -> GrainfatherBrewSession | None:
        detail_payload = await self.async_get_brew_session_detail(recipe_id, brew_session_id)
        steps = list(detail_payload.get("fermentation_steps") or [])
        if step_index >= len(steps):
            raise GrainfatherApiError(
                f"Step index {step_index} out of range (session has {len(steps)} steps)"
            )
        updated_steps = [dict(step) for step in steps]
        updated_steps[step_index]["time"] = duration_minutes
        updated_payload = build_brew_session_update_payload(
            detail_payload, fermentation_steps=updated_steps
        )
        result = await self._request_json(
            "PUT",
            f"/recipes/{recipe_id}/brew-sessions/{brew_session_id}",
            json_payload=updated_payload,
        )
        return parse_batch_payload(result)

    async def async_get_fermentation_device_history(
        self,
        device_id: int,
        *,
        from_date: str = "2001-01-07",
        data_format: str = "raw",
        metric: bool = True,
    ) -> list[dict[str, Any]]:
        payload = await self._request_json(
            "GET",
            f"/equipment/fermentation-devices/{device_id}/history",
            query_params={
                "from": from_date,
                "format": data_format,
                "metric": str(metric).lower(),
            },
        )
        return parse_fermentation_device_history_payload(payload)

    async def _request_json(
        self,
        method: str,
        path: str,
        *,
        json_payload: dict[str, Any] | None = None,
        query_params: dict[str, Any] | None = None,
        retry_on_auth_error: bool = True,
    ) -> Any:
        if self._access_token is None:
            await self.authenticate()

        headers = {
            "Authorization": f"Bearer {self._access_token}",
            "Cache-Control": "no-cache, no-store, max-age=0",
            "Pragma": "no-cache",
        }
        params: dict[str, Any] | None = None
        if method.upper() == "GET":
            # Add a cache-buster to reduce stale responses from intermediate proxies/CDNs.
            params = {
                "_ts": int(datetime.now(timezone.utc).timestamp()),
                **(query_params or {}),
            }

        try:
            async with self._session.request(
                method,
                f"{self._base_url}{path}",
                headers=headers,
                json=json_payload,
                params=params,
            ) as response:
                if response.status in (401, 403) and retry_on_auth_error:
                    self._access_token = None
                    await self.authenticate()
                    return await self._request_json(
                        method,
                        path,
                        json_payload=json_payload,
                        query_params=query_params,
                        retry_on_auth_error=False,
                    )

                if response.status in (401, 403):
                    raise GrainfatherAuthenticationError("Grainfather session expired")

                response.raise_for_status()
                return await response.json()
        except ClientResponseError as err:
            if err.status in (401, 403):
                self._access_token = None
                raise GrainfatherAuthenticationError("Grainfather session expired") from err
            raise GrainfatherApiError(f"Grainfather request failed: {err}") from err


def parse_account_payload(payload: dict[str, Any]) -> GrainfatherAccount:
    return GrainfatherAccount(
        user_id=_first_value(payload, "id", "userId"),
        email=_first_value(payload, "email"),
        first_name=_first_value(payload, "firstName", "first_name"),
        last_name=_first_value(payload, "lastName", "last_name"),
    )


def parse_batch_payload(payload: dict[str, Any] | None) -> GrainfatherBrewSession | None:
    if not payload:
        return None

    recipe_payload = payload.get("recipe") or {}
    recipe_image_payload = recipe_payload.get("image") or {}
    recipe_style_payload = recipe_payload.get("recipe_style") or recipe_payload.get("recipeStyle") or {}
    equipment_payload = payload.get("equipment_profile") or {}
    fermentation_device_ids = tuple(_parse_int_list(payload.get("fermentation_devices") or []))
    fermentation_steps = parse_fermentation_steps_payload(payload.get("fermentation_steps") or [])
    equipment_profile = parse_equipment_profile_payload(equipment_payload) if equipment_payload else None

    return GrainfatherBrewSession(
        batch_id=_first_value(payload, "id", "batchId"),
        recipe_id=_to_int(_first_value(payload, "recipe_id")) or _to_int(_first_value(recipe_payload, "id")),
        session_name=_first_value(payload, "session_name", "sessionName"),
        recipe_name=_first_value(recipe_payload, "name") or _first_value(payload, "name"),
        condition_date=_first_value(payload, "condition_date", "conditionDate"),
        fermentation_start_date=_first_value(
            payload,
            "fermentation_start_date",
            "fermentationStartDate",
        ),
        created_at=_first_value(payload, "created_at", "createdAt"),
        recipe_image_url=(
            _first_value(recipe_image_payload, "url")
            or _first_value(recipe_payload, "image_url", "imageUrl")
            or _first_value(payload, "image_url", "imageUrl")
        ),
        style_name=(
            _first_value(recipe_style_payload, "sub_category_name", "subCategoryName")
            or _first_value(recipe_payload, "recipe_style-sub_category_name", "recipe_style_sub_category_name")
            or _first_value(recipe_payload, "style_name")
            or _first_value(recipe_payload, "styleName")
            or _first_value(recipe_style_payload, "name")
            or _first_value(recipe_payload.get("style") or {}, "name")
        ),
        batch_variant_name=_first_value(payload, "batch_variant_name", "batchVariantName"),
        status=_to_int(_first_value(payload, "status", "state")),
        batch_number=_to_int(_first_value(payload, "batch_number", "batchNumber")),
        original_gravity=_to_float(_first_value(payload, "original_gravity", "originalGravity")),
        final_gravity=_to_float(_first_value(payload, "final_gravity", "finalGravity")),
        fermentation_device_ids=fermentation_device_ids,
        fermentation_device_count=len(fermentation_device_ids),
        equipment_name=_first_value(equipment_payload, "name"),
        fermentation_steps=fermentation_steps,
        equipment_profile=equipment_profile,
        raw_payload=deepcopy(payload),
    )


def brew_session_device_identifier(session: GrainfatherBrewSession) -> str:
    return f"batch_{brew_session_unique_fragment(session)}"


def brew_session_unique_fragment(session: GrainfatherBrewSession) -> str:
    parts: list[str] = []

    batch_id = session.batch_id
    if batch_id is not None:
        parts.append(f"id_{batch_id}")

    if session.batch_number is not None:
        parts.append(f"no_{session.batch_number}")

    return "_".join(parts) or "unknown"


def brew_session_display_name(session: GrainfatherBrewSession) -> str:
    base_name = session.session_name or session.recipe_name

    if session.batch_number is not None:
        prefix = f"#{session.batch_number:04d}"
    elif session.batch_id is not None:
        prefix = f"ID {session.batch_id}"
    else:
        prefix = "Batch"

    if not base_name:
        return prefix

    return f"{prefix} - {base_name}"


def parse_fermentation_steps_payload(payload: list[dict[str, Any]]) -> tuple[GrainfatherFermentationStep, ...]:
    return tuple(parse_fermentation_step_payload(item) for item in payload if item)


def parse_fermentation_step_payload(payload: dict[str, Any]) -> GrainfatherFermentationStep:
    return GrainfatherFermentationStep(
        step_id=_to_int(_first_value(payload, "id")),
        name=_first_value(payload, "name"),
        temperature=_to_float(_first_value(payload, "temperature")),
        duration=_to_int(_first_value(payload, "time")),
        order=_to_int(_first_value(payload, "order")),
        time_unit_id=_to_int(_first_value(payload, "time_unit_id")),
        is_ramp_step=bool(_first_value(payload, "is_ramp_step") or False),
        finish_temperature=_to_float(_first_value(payload, "finish_temperature")),
    )


def parse_equipment_profiles_payload(payload: Any) -> tuple[GrainfatherEquipmentProfile, ...]:
    if not isinstance(payload, list):
        return tuple()

    return tuple(parse_equipment_profile_payload(item) for item in payload if item)


def parse_equipment_profile_payload(payload: dict[str, Any]) -> GrainfatherEquipmentProfile:
    return GrainfatherEquipmentProfile(
        profile_id=_to_int(_first_value(payload, "id")),
        name=_first_value(payload, "name"),
        brand=_first_value(payload, "brand")
        or _first_value(payload.get("profile_brand") or {}, "name"),
        batch_size=_to_float(_first_value(payload, "batch_size")),
        mash_volume=_to_float(_first_value(payload, "mash_volume")),
        boil_volume=_to_float(_first_value(payload, "boil_volume")),
        unit_type_id=_to_int(_first_value(payload, "unit_type_id")),
        raw_payload=deepcopy(payload),
    )


def parse_fermentation_devices_payload(payload: Any) -> tuple[GrainfatherFermentationDevice, ...]:
    if not isinstance(payload, list):
        return tuple()

    return tuple(parse_fermentation_device_payload(item) for item in payload if item)


def parse_fermentation_device_payload(payload: dict[str, Any]) -> GrainfatherFermentationDevice:
    brew_session_payload = payload.get("brew_session") or {}

    return GrainfatherFermentationDevice(
        device_id=_to_int(_first_value(payload, "id")),
        name=_first_value(payload, "name"),
        fermentation_device_type_id=_to_int(_first_value(payload, "fermentation_device_type_id")),
        linked_brew_session_id=_to_int(_first_value(payload, "brew_session_id")),
        linked_brew_session_name=_first_value(brew_session_payload, "session_name"),
        last_heard=_first_value(payload, "last_heard"),
        last_specific_gravity=_to_float(_first_value(payload, "last_sg")),
        last_temperature=_to_float(_first_value(payload, "last_temperature")),
        is_controller_linked=_to_bool(_first_value(payload, "is_controller_linked")),
        raw_payload=deepcopy(payload),
    )


def parse_fermentation_device_history_payload(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]

    if isinstance(payload, dict):
        data = payload.get("data")
        if isinstance(data, list):
            return [item for item in data if isinstance(item, dict)]

    return []


def parse_fermentation_device_history_points(
    payload: list[dict[str, Any]],
    device_id: int,
) -> tuple[GrainfatherHistoryPoint, ...]:
    points: list[GrainfatherHistoryPoint] = []

    for item in payload:
        if not isinstance(item, dict):
            continue

        brew_session_id = _to_int(
            _first_value(item, "brew_session_id", "brewSessionId", "batch_id", "batchId")
        )
        timestamp = _first_value(
            item,
            "timestamp",
            "recorded_at",
            "recordedAt",
            "created_at",
            "createdAt",
            "date",
            "datetime",
            "time",
            "last_heard",
        )
        temperature = _to_float(_first_value(item, "temperature", "temp", "last_temperature"))
        specific_gravity = _to_float(
            _first_value(
                item,
                "specific_gravity",
                "specificGravity",
                "gravity",
                "sg",
                "last_sg",
                "last_specific_gravity",
            )
        )

        if temperature is None and specific_gravity is None:
            continue

        points.append(
            GrainfatherHistoryPoint(
                device_id=device_id,
                brew_session_id=brew_session_id,
                timestamp=timestamp,
                temperature=temperature,
                specific_gravity=specific_gravity,
                raw_payload=deepcopy(item),
            )
        )

    return tuple(points)


def build_brew_session_update_payload(
    payload: dict[str, Any],
    *,
    status: int | None = None,
    fermentation_steps: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    updated_payload = deepcopy(payload)
    brew_session_id = _to_int(updated_payload.get("id"))

    user_payload = updated_payload.get("user")
    if isinstance(user_payload, dict):
        user_payload.pop("api_token", None)

    if status is not None:
        updated_payload["status"] = status

    if fermentation_steps is not None:
        normalized_steps: list[dict[str, Any]] = []
        for index, step in enumerate(fermentation_steps):
            step_payload = dict(step)
            step_payload.setdefault("order", index)
            step_payload.setdefault("time_unit_id", 30)
            step_payload.setdefault("is_ramp_step", False)
            if brew_session_id is not None:
                step_payload.setdefault("brew_session_id", brew_session_id)
            normalized_steps.append(step_payload)
        updated_payload["fermentation_steps"] = normalized_steps

    return updated_payload


def _select_active_brew_session(payload: dict[str, Any]) -> dict[str, Any] | None:
    sessions = payload.get("data") or []
    if not sessions:
        return None

    active_sessions = [session for session in sessions if session.get("is_active")]
    candidates = active_sessions or sessions
    candidates.sort(
        key=lambda session: _parse_datetime(session.get("updated_at"))
        or datetime.min.replace(tzinfo=timezone.utc),
        reverse=True,
    )
    return candidates[0]


def _brew_session_reference(session: GrainfatherBrewSession) -> str:
    if session.batch_number is not None and session.batch_id is not None:
        return f"Batch #{session.batch_number}, ID {session.batch_id}"
    if session.batch_number is not None:
        return f"Batch #{session.batch_number}"
    if session.batch_id is not None:
        return f"Batch ID {session.batch_id}"
    return "Batch"


def _extract_next_page(payload: dict[str, Any]) -> int | None:
    next_page = _first_value(payload, "next_page", "nextPage")
    parsed_page = _page_number_from_value(next_page)
    if parsed_page is not None:
        return parsed_page

    next_page_url = _first_value(payload, "next_page_url", "nextPageUrl")
    return _page_number_from_value(next_page_url)


def _page_number_from_value(value: Any) -> int | None:
    parsed_value = _to_int(value)
    if parsed_value is not None:
        return parsed_value

    if not isinstance(value, str) or not value:
        return None

    parsed_url = urlparse(value)
    page_values = parse_qs(parsed_url.query).get("page")
    if not page_values:
        return None

    return _to_int(page_values[0])


def _first_value(payload: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = payload.get(key)
        if value is not None:
            return value
    return None


def _to_float(value: Any) -> float | None:
    if value is None:
        return None

    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_int(value: Any) -> int | None:
    if value is None:
        return None

    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _to_bool(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    return bool(value)


def _parse_int_list(values: list[Any]) -> list[int]:
    parsed_values: list[int] = []
    for value in values:
        parsed_value = _to_int(value)
        if parsed_value is not None:
            parsed_values.append(parsed_value)
    return parsed_values


def _parse_datetime(value: Any) -> datetime | None:
    if not value or not isinstance(value, str):
        return None

    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
