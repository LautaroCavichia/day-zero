"""
core/middleware.py — FastAPI middleware for DayZero.

RequestIdMiddleware:
    Assigns a UUID ``X-Request-ID`` to every inbound HTTP request (or
    reads the one supplied by the client / load balancer).  The ID is:
      - Stored in the ``request_id_var`` ContextVar so all log records
        emitted during the request automatically carry it.
      - Returned in the ``X-Request-ID`` response header so callers can
        correlate logs with their own request traces.
"""

from __future__ import annotations

import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from backend.core.logging_config import request_id_var


class RequestIdMiddleware(BaseHTTPMiddleware):
    """
    Assign a correlation ID to every HTTP request.

    Reads ``X-Request-ID`` from the inbound request headers; generates a
    fresh UUID v4 if the header is absent.  The value is injected into the
    ``request_id_var`` ContextVar and echoed back in the response.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        token = request_id_var.set(req_id)
        try:
            response: Response = await call_next(request)
            response.headers["X-Request-ID"] = req_id
            return response
        finally:
            request_id_var.reset(token)
