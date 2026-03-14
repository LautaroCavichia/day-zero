"""
core/errors.py — Domain-specific exception hierarchy for DayZero.

Raising these instead of generic ValueError / Exception makes it
easier to map errors to HTTP status codes in the API layer and to
assert specific failure modes in tests.
"""

from __future__ import annotations


class DayZeroError(Exception):
    """Base class for all DayZero application errors."""

    def __init__(self, message: str, *, detail: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.detail = detail or message

    def __repr__(self) -> str:
        return f"{type(self).__name__}({self.message!r})"


# ── Session errors ─────────────────────────────────────────────────────────


class SessionNotFoundError(DayZeroError):
    """Raised when a session ID does not exist in the session store."""

    def __init__(self, session_id: str) -> None:
        super().__init__(
            f"Session not found: {session_id}",
            detail=f"No session with id '{session_id}' exists. Create one via POST /api/session.",
        )
        self.session_id = session_id


class SessionStateError(DayZeroError):
    """Raised when session state is missing required data for an operation."""


# ── Configuration errors ───────────────────────────────────────────────────


class ConfigError(DayZeroError):
    """Raised when required configuration (e.g. API key) is not set."""


# ── Agent / AI errors ──────────────────────────────────────────────────────


class AgentError(DayZeroError):
    """Base class for errors from AI agent execution."""


class GeminiResponseError(AgentError):
    """Raised when Gemini returns an unexpected or unparseable response."""

    def __init__(self, message: str, *, raw_response: str | None = None) -> None:
        super().__init__(message)
        self.raw_response = raw_response


class GeminiApiError(AgentError):
    """
    Raised when the Gemini API returns a non-2xx HTTP error.

    Wraps ``google.genai.errors.ClientError`` / ``ServerError`` so the rest
    of the application never needs to import the google-genai error types
    directly.

    Attributes:
        status_code: The HTTP status code returned by the API (e.g. 429, 401, 500).
        error_code:  The API-level error code string (e.g. "RESOURCE_EXHAUSTED").
        retry_after: Suggested retry delay in seconds, parsed from RetryInfo when
                     present (None if not provided by the API).
    """

    def __init__(
        self,
        message: str,
        *,
        status_code: int,
        error_code: str = "",
        retry_after: float | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.error_code = error_code
        self.retry_after = retry_after


# ── Provider-agnostic LLM errors ──────────────────────────────────────────


class LLMProviderError(AgentError):
    """
    Raised when any LLM provider returns an API-level error.

    Provider-specific errors (GeminiApiError, etc.) are subclasses of this
    so callers can catch all provider errors with a single except clause.

    Attributes:
        status_code: HTTP status code (0 if unavailable).
        provider:    Provider name string ("google", "mistral", "openai", …).
    """

    def __init__(
        self,
        message: str,
        *,
        status_code: int = 0,
        provider: str = "",
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.provider = provider


class RateLimitError(LLMProviderError):
    """Raised when the provider returns HTTP 429 (rate limit / quota exhausted)."""


class LLMResponseError(AgentError):
    """Raised when the provider returns a response that cannot be parsed as JSON."""

    def __init__(self, message: str, *, raw_response: str | None = None) -> None:
        super().__init__(message)
        self.raw_response = raw_response


# ── Input validation errors ────────────────────────────────────────────────


class InvalidFileTypeError(DayZeroError):
    """Raised when an uploaded file has an unsupported extension."""

    def __init__(self, filename: str, allowed: set[str]) -> None:
        super().__init__(
            f"Unsupported file type: '{filename}'. Allowed: {sorted(allowed)}",
        )
        self.filename = filename
        self.allowed = allowed


class FileTooLargeError(DayZeroError):
    """Raised when an uploaded file exceeds the size limit."""

    def __init__(self, size_bytes: int, max_bytes: int) -> None:
        super().__init__(
            f"File too large: {size_bytes:,} bytes (max {max_bytes:,} bytes).",
        )
        self.size_bytes = size_bytes
        self.max_bytes = max_bytes


class PitchContextEmptyError(DayZeroError):
    """Raised when an agent requires pitch_context but it hasn't been set yet."""

    def __init__(self, session_id: str) -> None:
        super().__init__(
            f"pitch_context is empty for session '{session_id}'. "
            "Submit a pitch via POST /api/pitch first.",
        )
        self.session_id = session_id
