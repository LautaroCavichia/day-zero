"""
tests/test_api_endpoints.py — Integration tests for all FastAPI REST endpoints.

Uses FastAPI's TestClient (synchronous) with agents mocked out so no
real Gemini calls are made.
"""

from __future__ import annotations

import json
import os
import sys
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))


# ── App fixture ────────────────────────────────────────────────────────────


@pytest.fixture(scope="module")
def app_with_key():
    """
    Load the FastAPI app with a fake API key set so guards pass.
    We patch at the settings level so all modules see the key.
    """
    with patch.dict(os.environ, {"GOOGLE_API_KEY": "test-key-integration"}):
        import importlib

        import config as cfg

        importlib.reload(cfg)
        import main as main_mod

        importlib.reload(main_mod)
        yield main_mod.app


@pytest.fixture
def client(app_with_key):
    with TestClient(app_with_key, raise_server_exceptions=False) as c:
        yield c


# ── /health ────────────────────────────────────────────────────────────────


def test_health_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["api_key_set"] is True
    assert "features" in data
    assert "config" in data


# ── /api/session ───────────────────────────────────────────────────────────


def test_create_session(client):
    resp = client.post("/api/session")
    assert resp.status_code == 200
    data = resp.json()
    assert "session_id" in data
    assert isinstance(data["session_id"], str)
    assert len(data["session_id"]) > 0


def test_get_session(client):
    # Create first
    create_resp = client.post("/api/session")
    sid = create_resp.json()["session_id"]

    resp = client.get(f"/api/session/{sid}")
    assert resp.status_code == 200
    data = resp.json()
    assert "pitch_context" in data
    assert "debate_rounds" in data


def test_get_session_not_found(client):
    resp = client.get("/api/session/nonexistent-id")
    assert resp.status_code == 404
    data = resp.json()
    assert data["error"] == "session_not_found"


def test_delete_session(client):
    create_resp = client.post("/api/session")
    sid = create_resp.json()["session_id"]

    resp = client.delete(f"/api/session/{sid}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "deleted"

    # Now it's gone
    resp2 = client.get(f"/api/session/{sid}")
    assert resp2.status_code == 404


def test_delete_session_not_found(client):
    resp = client.delete("/api/session/nonexistent-id")
    assert resp.status_code == 404


# ── /api/session/{id}/verdict ──────────────────────────────────────────────


def test_get_verdict_pending(client):
    create_resp = client.post("/api/session")
    sid = create_resp.json()["session_id"]

    resp = client.get(f"/api/session/{sid}/verdict")
    assert resp.status_code == 202
    data = resp.json()
    assert data["status"] == "idle"


def test_get_verdict_not_found(client):
    resp = client.get("/api/session/nonexistent/verdict")
    assert resp.status_code == 404


# ── /api/session/{id}/debate ───────────────────────────────────────────────


def test_get_debate_empty(client):
    create_resp = client.post("/api/session")
    sid = create_resp.json()["session_id"]

    resp = client.get(f"/api/session/{sid}/debate")
    assert resp.status_code == 200
    data = resp.json()
    assert data["debate_rounds"] == []
    assert data["status"] == "idle"


def test_get_debate_not_found(client):
    resp = client.get("/api/session/nonexistent/debate")
    assert resp.status_code == 404


# ── /api/session/{id}/sources ──────────────────────────────────────────────


def test_get_sources_empty(client):
    create_resp = client.post("/api/session")
    sid = create_resp.json()["session_id"]

    resp = client.get(f"/api/session/{sid}/sources")
    assert resp.status_code == 200
    assert resp.json()["sources"] == []


# ── /api/pitch ─────────────────────────────────────────────────────────────


MOCK_PITCH_CONTEXT = {
    "company_name": "Acme AI",
    "one_liner": "AI for email",
    "problem": "Email is slow",
    "solution": "LLM drafting",
    "target_customer": "Workers",
    "business_model": "SaaS",
    "traction": "100 users",
    "team": "2 founders",
    "ask": "$500k",
    "stage": "MVP",
}


def test_submit_pitch_success(client):
    create_resp = client.post("/api/session")
    sid = create_resp.json()["session_id"]

    mock_resp = MagicMock()
    mock_resp.text = json.dumps(MOCK_PITCH_CONTEXT)

    with patch("core.gemini_client.genai.Client") as MockClient:
        mock_instance = MagicMock()
        mock_instance.aio.models.generate_content = AsyncMock(return_value=mock_resp)
        MockClient.return_value = mock_instance

        resp = client.post(
            f"/api/pitch?session_id={sid}",
            json={"pitch_text": "We are building an AI email product."},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["pitch_context"]["company_name"] == "Acme AI"


def test_submit_pitch_session_not_found(client):
    resp = client.post(
        "/api/pitch?session_id=nonexistent",
        json={"pitch_text": "some pitch"},
    )
    assert resp.status_code == 404


def test_submit_pitch_short_text_rejected(client):
    create_resp = client.post("/api/session")
    sid = create_resp.json()["session_id"]

    resp = client.post(
        f"/api/pitch?session_id={sid}",
        json={"pitch_text": "too short"},
    )
    # pydantic min_length=10 causes 422
    assert resp.status_code == 422


# ── /api/upload-deck ───────────────────────────────────────────────────────


def test_upload_deck_invalid_extension(client):
    create_resp = client.post("/api/session")
    sid = create_resp.json()["session_id"]

    resp = client.post(
        "/api/upload-deck",
        data={"session_id": sid},
        files={"file": ("deck.docx", b"fake bytes", "application/octet-stream")},
    )
    assert resp.status_code == 400
    assert resp.json()["error"] == "invalid_file_type"


def test_upload_deck_too_large(client):
    create_resp = client.post("/api/session")
    sid = create_resp.json()["session_id"]

    # 51 MB of zeros
    big_file = b"\x00" * (51 * 1024 * 1024)
    resp = client.post(
        "/api/upload-deck",
        data={"session_id": sid},
        files={"file": ("deck.pdf", big_file, "application/pdf")},
    )
    assert resp.status_code == 413
    assert resp.json()["error"] == "file_too_large"


def test_upload_deck_session_not_found(client):
    resp = client.post(
        "/api/upload-deck",
        data={"session_id": "nonexistent"},
        files={"file": ("deck.pdf", b"fake", "application/pdf")},
    )
    assert resp.status_code == 404


# ── /api/validate-market ────────────────────────────────────────────────────


def test_trigger_market_validation_no_pitch(client):
    create_resp = client.post("/api/session")
    sid = create_resp.json()["session_id"]

    resp = client.post(f"/api/validate-market?session_id={sid}")
    assert resp.status_code == 400
    assert resp.json()["error"] == "pitch_context_empty"


def test_trigger_market_validation_started(client):
    create_resp = client.post("/api/session")
    sid = create_resp.json()["session_id"]

    # Populate pitch_context first
    mock_resp = MagicMock()
    mock_resp.text = json.dumps(MOCK_PITCH_CONTEXT)
    with patch("core.gemini_client.genai.Client") as MockClient:
        mock_instance = MagicMock()
        mock_instance.aio.models.generate_content = AsyncMock(return_value=mock_resp)
        MockClient.return_value = mock_instance
        client.post(
            f"/api/pitch?session_id={sid}", json={"pitch_text": "AI email product for workers."}
        )

    # Now trigger market validation (background — just check it starts)
    with patch("agents.market_validator.validate_market", new=AsyncMock()):
        resp = client.post(f"/api/validate-market?session_id={sid}")

    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "started"


def test_trigger_market_validation_session_not_found(client):
    resp = client.post("/api/validate-market?session_id=nonexistent")
    assert resp.status_code == 404


# ── /api/deliberate ────────────────────────────────────────────────────────


def test_trigger_deliberation_no_pitch(client):
    create_resp = client.post("/api/session")
    sid = create_resp.json()["session_id"]

    resp = client.post(f"/api/deliberate?session_id={sid}")
    assert resp.status_code == 400
    assert resp.json()["error"] == "pitch_context_empty"


def test_trigger_deliberation_started(client):
    create_resp = client.post("/api/session")
    sid = create_resp.json()["session_id"]

    # Populate pitch first
    mock_resp = MagicMock()
    mock_resp.text = json.dumps(MOCK_PITCH_CONTEXT)
    with patch("core.gemini_client.genai.Client") as MockClient:
        mock_instance = MagicMock()
        mock_instance.aio.models.generate_content = AsyncMock(return_value=mock_resp)
        MockClient.return_value = mock_instance
        client.post(
            f"/api/pitch?session_id={sid}", json={"pitch_text": "AI email product for workers."}
        )

    with patch("agents.deliberation.run_deliberation", new=AsyncMock()):
        resp = client.post(f"/api/deliberate?session_id={sid}")

    assert resp.status_code == 200
    assert resp.json()["status"] == "started"


def test_trigger_deliberation_session_not_found(client):
    resp = client.post("/api/deliberate?session_id=nonexistent")
    assert resp.status_code == 404
