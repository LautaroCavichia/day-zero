"""
tests/test_config.py — Tests for the Settings / config module.
"""

from __future__ import annotations

import os
from unittest.mock import patch


def test_default_values():
    """All settings have sane defaults (tested without .env override)."""
    import sys

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

    import importlib

    # Clear any env vars that would override defaults, and bypass the .env file
    env_overrides = {
        "GEMINI_FLASH_MODEL": "",
        "DEBATE_ROUNDS": "",
        "DECK_RENDER_DPI": "",
    }
    with patch.dict(os.environ, env_overrides, clear=False):
        # Unset rather than set-to-empty for pydantic-settings to use defaults
        for key in env_overrides:
            os.environ.pop(key, None)

        import config as cfg

        importlib.reload(cfg)
        s = cfg.Settings(_env_file=None)

    assert s.gemini_flash_model == "gemini-2.5-flash"
    assert s.debate_rounds == 3
    assert s.deck_render_dpi == 150
    assert s.live_api_input_sample_rate == 24000
    assert s.live_api_output_sample_rate == 24000
    assert s.max_upload_bytes == 50 * 1024 * 1024
    assert s.port == 8080
    assert s.app_name == "dayzero"


def test_api_key_set_property():
    import sys

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

    import config as cfg

    # Test with all API keys empty
    s = cfg.Settings(
        llm_provider=cfg.LLMProviderEnum.GOOGLE,
        google_api_key="",
        mistral_api_key="",
        openai_api_key="",
    )
    assert s.api_key_set is False

    # Test with Google key set and provider=google
    s2 = cfg.Settings(
        llm_provider=cfg.LLMProviderEnum.GOOGLE,
        google_api_key="abc123",
        mistral_api_key="",
        openai_api_key="",
    )
    assert s2.api_key_set is True

    # Test with Mistral key set and provider=mistral
    s3 = cfg.Settings(
        llm_provider=cfg.LLMProviderEnum.MISTRAL,
        google_api_key="",
        mistral_api_key="abc123",
        openai_api_key="",
    )
    assert s3.api_key_set is True


def test_env_override():
    """Environment variables override defaults."""
    import sys

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

    import config as cfg

    with patch.dict(os.environ, {"DEBATE_ROUNDS": "5", "DECK_RENDER_DPI": "200"}):
        s = cfg.Settings()
    assert s.debate_rounds == 5
    assert s.deck_render_dpi == 200


def test_feature_flags_default_on():
    import sys

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

    import config as cfg

    # Create settings without env file to get actual defaults
    s = cfg.Settings(_env_file=None)
    assert s.enable_deck_analysis is True
    assert s.enable_market_validation is True
    assert s.enable_live_interview is True


def test_feature_flags_can_be_disabled():
    import sys

    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

    import config as cfg

    s = cfg.Settings(enable_deck_analysis=False, enable_market_validation=False)
    assert s.enable_deck_analysis is False
    assert s.enable_market_validation is False
