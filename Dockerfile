# ─────────────────────────────────────────────────────────────────────────────
# DayZero Dockerfile
#
# Python 3.11 FastAPI backend with:
# - pdf2image support (poppler-utils)
# - PPTX native rendering via python-pptx + Pillow (no LibreOffice)
# - Google ADK + Gemini SDK
# - WebSocket audio streaming
#
# Build: docker build -t dayzero .
# Run:   docker run -p 8080:8080 --env-file .env dayzero
# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.11-slim AS base

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    # pdf2image dependencies
    poppler-utils \
    # Fonts for native PPTX renderer (python-pptx + Pillow text rendering)
    fonts-liberation \
    fonts-dejavu-core \
    # Cleanup
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements first for layer caching
COPY backend/requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Copy frontend
COPY frontend/ ./frontend/

# Expose port
EXPOSE 8080

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PORT=8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health').read()"

# Run the application
CMD ["python", "-m", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8080"]
