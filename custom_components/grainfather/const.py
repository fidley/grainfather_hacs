from __future__ import annotations

DOMAIN = "grainfather"
PLATFORMS = ["sensor", "button", "select"]

CONF_EMAIL = "email"
CONF_PASSWORD = "password"
CONF_ENTRY_ID = "entry_id"
CONF_BREW_SESSION_ID = "brew_session_id"
CONF_RECIPE_ID = "recipe_id"
CONF_STATUS = "status"
CONF_FERMENTATION_STEPS = "fermentation_steps"
CONF_STEP_INDEX = "step_index"
CONF_DURATION_MINUTES = "duration_minutes"
CONF_TEMPERATURE = "temperature"
CONF_IS_RAMP_STEP = "is_ramp_step"
CONF_FINISH_TEMPERATURE = "finish_temperature"
CONF_SCAN_INTERVAL = "scan_interval"
CONF_INCLUDE_COMPLETED_SESSIONS = "include_completed_sessions"

DEFAULT_SCAN_INTERVAL = 300  # seconds
DEFAULT_INCLUDE_COMPLETED_SESSIONS = False
MIN_SCAN_INTERVAL = 60
MAX_SCAN_INTERVAL = 3600

BREW_SESSION_STATUS_COMPLETED = 40

SERVICE_SET_BREW_SESSION_STATUS = "set_brew_session_status"
SERVICE_SET_FERMENTATION_STEPS = "set_fermentation_steps"
SERVICE_SET_FERMENTATION_STEP_DURATION = "set_fermentation_step_duration"
SERVICE_CLEAR_FERMENTATION_STEP_FINISH_TEMPERATURE = (
    "clear_fermentation_step_finish_temperature"
)

BREW_SESSION_STATUS_MAP = {
	"planning": 5,
	"brewing": 10,
	"fermenting": 20,
	"conditioning": 30,
	"serving": 35,
    "completed": BREW_SESSION_STATUS_COMPLETED
}

BREW_SESSION_STATUS_NAME_BY_CODE = {
	5: "planning",
	10: "brewing",
	20: "fermenting",
	30: "conditioning",
    35: "serving",
    BREW_SESSION_STATUS_COMPLETED: "completed",
}


def normalize_brew_session_status(value: int | str) -> int:
    if isinstance(value, int):
        return value

    normalized = value.strip().lower()
    if normalized.isdigit():
        return int(normalized)

    if normalized in BREW_SESSION_STATUS_MAP:
        return BREW_SESSION_STATUS_MAP[normalized]

    allowed = ", ".join(sorted(set(BREW_SESSION_STATUS_MAP)))
    raise ValueError(f"Unsupported status '{value}'. Use a code or one of: {allowed}")


def brew_session_status_name(value: int | None) -> str | None:
    if value is None:
        return None
    return BREW_SESSION_STATUS_NAME_BY_CODE.get(value)
