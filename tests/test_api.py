from custom_components.grainfather.api import (
    _select_active_brew_session,
    build_brew_session_update_payload,
    parse_account_payload,
    parse_batch_payload,
    parse_fermentation_devices_payload,
)
from custom_components.grainfather.const import (
    brew_session_status_name,
    normalize_brew_session_status,
)


def test_parse_account_payload() -> None:
    payload = {
        "userId": "user-123",
        "email": "brewer@example.com",
        "firstName": "Brew",
        "lastName": "Master",
    }

    account = parse_account_payload(payload)

    assert account.user_id == "user-123"
    assert account.email == "brewer@example.com"
    assert account.first_name == "Brew"
    assert account.last_name == "Master"


def test_parse_batch_payload() -> None:
    payload = {
        "id": 1378631,
        "session_name": "Orange IPA #271",
        "name": "Orange IPA",
        "batch_number": 271,
        "batch_variant_name": "Fermenter 1",
        "status": 20,
        "original_gravity": 1.0484,
        "final_gravity": 1.0122,
        "fermentation_devices": [80971, 69883],
        "recipe": {"name": "Orange IPA"},
        "equipment_profile": {"name": "Grainfather-G40"},
    }

    batch = parse_batch_payload(payload)

    assert batch is not None
    assert batch.batch_id == 1378631
    assert batch.recipe_id is None
    assert batch.session_name == "Orange IPA #271"
    assert batch.recipe_name == "Orange IPA"
    assert batch.batch_variant_name == "Fermenter 1"
    assert batch.status == 20
    assert batch.batch_number == 271
    assert batch.original_gravity == 1.0484
    assert batch.final_gravity == 1.0122
    assert batch.fermentation_device_ids == (80971, 69883)
    assert batch.fermentation_device_count == 2
    assert batch.equipment_name == "Grainfather-G40"


def test_parse_fermentation_devices_payload() -> None:
    payload = [
        {
            "id": 80971,
            "name": "Yellow Rapt Pill 29-84",
            "fermentation_device_type_id": 72,
            "brew_session_id": 1378631,
            "last_heard": "2026-04-07T10:47:55.000000Z",
            "last_sg": "1.0122",
            "last_temperature": "5.81",
            "is_controller_linked": None,
            "brew_session": {"session_name": "Orange IPA #271"},
        }
    ]

    devices = parse_fermentation_devices_payload(payload)

    assert len(devices) == 1
    assert devices[0].device_id == 80971
    assert devices[0].linked_brew_session_name == "Orange IPA #271"
    assert devices[0].last_specific_gravity == 1.0122
    assert devices[0].last_temperature == 5.81


def test_build_brew_session_update_payload_updates_status_and_steps() -> None:
    payload = {
        "id": 1378631,
        "status": 20,
        "user": {"id": 1, "api_token": "secret-token"},
        "fermentation_steps": [
            {
                "id": 1,
                "name": "Old step",
                "temperature": 20,
                "time": 1440,
                "order": 0,
                "time_unit_id": 30,
                "is_ramp_step": False,
            }
        ],
    }

    updated = build_brew_session_update_payload(
        payload,
        status=30,
        fermentation_steps=[
            {"name": "New step", "temperature": 18, "time": 2880},
        ],
    )

    assert updated["status"] == 30
    assert updated["user"] == {"id": 1}
    assert updated["fermentation_steps"][0]["name"] == "New step"
    assert updated["fermentation_steps"][0]["brew_session_id"] == 1378631
    assert updated["fermentation_steps"][0]["time_unit_id"] == 30


def test_select_active_brew_session_prefers_latest_active() -> None:
    payload = {
        "data": [
            {
                "id": 1,
                "is_active": True,
                "updated_at": "2026-04-03T16:15:07.000000Z",
            },
            {
                "id": 2,
                "is_active": True,
                "updated_at": "2026-04-07T10:47:55.000000Z",
            },
            {
                "id": 3,
                "is_active": False,
                "updated_at": "2026-04-08T10:47:55.000000Z",
            },
        ]
    }

    selected = _select_active_brew_session(payload)

    assert selected is not None
    assert selected["id"] == 2


def test_normalize_brew_session_status() -> None:
    assert normalize_brew_session_status(30) == 30
    assert normalize_brew_session_status("20") == 20
    assert normalize_brew_session_status("planning") == 0
    assert normalize_brew_session_status("Fermenting") == 20
    assert brew_session_status_name(0) == "planning"
    assert brew_session_status_name(30) == "conditioning"
