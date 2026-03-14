"""
core/logging_config.py — Structured logging configuration for DayZero.

Supports two output formats controlled by the LOG_FORMAT setting:
  - "json"  — machine-readable JSON lines (default for production / Cloud Run)
  - "text"  — human-readable coloured text (default for local dev)

A request_id ContextVar is also defined here so that all log records
emitted within a FastAPI request automatically carry the request's
correlation ID when the RequestIdFilter is installed.

Usage:
    from core.logging_config import configure_logging
    configure_logging(settings)
"""

from __future__ import annotations

import logging
import logging.config
import sys
from contextvars import ContextVar

# ── Request-ID context variable ────────────────────────────────────────────
# Set by RequestIdMiddleware on each inbound request.
# Reads as "" when no request is active (background tasks, startup).

request_id_var: ContextVar[str] = ContextVar("request_id", default="")


class _RequestIdFilter(logging.Filter):
    """Inject the current request_id into every log record."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get("")  # type: ignore[attr-defined]
        return True


def configure_logging(log_level: str = "INFO", log_format: str = "text") -> None:
    """
    Configure the root logger for the DayZero application.

    Parameters
    ----------
    log_level:
        Standard Python log level string (DEBUG, INFO, WARNING, ERROR, CRITICAL).
    log_format:
        ``"json"`` for structured JSON output (production),
        ``"text"`` for human-readable output (development).
    """
    level = getattr(logging, log_level.upper(), logging.INFO)

    # Install the request-id filter on the root logger so every handler gets it
    request_id_filter = _RequestIdFilter()

    if log_format.lower() == "json":
        try:
            from pythonjsonlogger.json import JsonFormatter

            formatter: logging.Formatter = JsonFormatter(
                fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
                rename_fields={"asctime": "timestamp", "levelname": "level", "name": "logger"},
                datefmt="%Y-%m-%dT%H:%M:%S",
            )
        except ImportError:
            # Graceful fallback if python-json-logger is not installed
            logging.warning(
                "python-json-logger not installed — falling back to text format. "
                "Run: pip install python-json-logger"
            )
            formatter = _text_formatter()
    else:
        formatter = _text_formatter()

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)
    handler.addFilter(request_id_filter)

    root = logging.getLogger()
    root.setLevel(level)
    # Remove any handlers added by basicConfig or previous calls
    root.handlers.clear()
    root.addHandler(handler)

    # Quieten noisy third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("google.auth").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)

    logging.getLogger(__name__).info(
        "Logging configured: level=%s format=%s", log_level.upper(), log_format
    )


def _text_formatter() -> logging.Formatter:
    return logging.Formatter(
        fmt="%(asctime)s [%(levelname)s] %(name)s (req=%(request_id)s) %(message)s",
        datefmt="%H:%M:%S",
    )
