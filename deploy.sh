#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh — Automated Cloud Deployment Script
# 
# This script automates the entire deployment pipeline:
#   1. Builds the Docker image using Google Cloud Build
#   2. Pushes the image to Google Artifact Registry
#   3. Deploys the image to Google Cloud Run
#
# Usage:
#   ./deploy.sh [project-id] [region] [service-name]
#
# Example:
#   ./deploy.sh dayzero-hackathon us-central1 dayzero
#
# Environment variables (optional):
#   GCP_PROJECT       — GCP project ID (defaults to arg 1)
#   GCP_REGION        — GCP region (defaults to arg 2 or us-central1)
#   SERVICE_NAME      — Cloud Run service name (defaults to arg 3 or dayzero)
#   GOOGLE_API_KEY    — Gemini API key (required for runtime)
#   LLM_PROVIDER      — LLM provider (defaults to 'google')
# ─────────────────────────────────────────────────────────────────────────────

set -e  # Exit on error

# ── Configuration ──────────────────────────────────────────────────────────

PROJECT_ID="${1:-${GCP_PROJECT:-dayzero-hackathon}}"
REGION="${2:-${GCP_REGION:-us-central1}}"
SERVICE_NAME="${3:-${SERVICE_NAME:-dayzero}}"
REPOSITORY="dayzero"
IMAGE_NAME="app"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# ── Functions ──────────────────────────────────────────────────────────────

log_info() {
    echo -e "${BLUE}ℹ  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✓  $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠  $1${NC}"
}

log_error() {
    echo -e "${RED}✗  $1${NC}"
    exit 1
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed. Install it from: https://cloud.google.com/sdk/docs/install"
    fi
    
    if ! command -v docker &> /dev/null; then
        log_warning "docker is not installed (optional — Cloud Build can handle this)"
    fi
    
    log_success "Prerequisites OK"
}

set_gcp_project() {
    log_info "Setting GCP project to: $PROJECT_ID"
    gcloud config set project "$PROJECT_ID"
    log_success "GCP project set"
}

build_image() {
    log_info "Building image with Google Cloud Build..."
    log_info "This may take 3-5 minutes on first build"
    
    gcloud builds submit \
        --region="$REGION" \
        --tag="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:latest" \
        .
    
    if [ $? -eq 0 ]; then
        log_success "Image built and pushed to Artifact Registry"
    else
        log_error "Cloud Build failed"
    fi
}

deploy_to_cloud_run() {
    log_info "Deploying to Cloud Run..."
    
    # Check if GOOGLE_API_KEY is set
    if [ -z "$GOOGLE_API_KEY" ]; then
        log_warning "GOOGLE_API_KEY is not set. Reading from .env file..."
        if [ -f .env ]; then
            GOOGLE_API_KEY=$(grep -E "^GOOGLE_API_KEY=" .env | cut -d '=' -f2 | tr -d '"' | tr -d "'" | xargs)
        fi
    fi
    
    if [ -z "$GOOGLE_API_KEY" ]; then
        log_error "GOOGLE_API_KEY is required. Set it in .env or as env var"
    fi
    
    LLM_PROVIDER="${LLM_PROVIDER:-google}"
    
    gcloud run deploy "$SERVICE_NAME" \
        --image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:latest" \
        --region="$REGION" \
        --memory=1Gi \
        --cpu=1 \
        --min-instances=0 \
        --max-instances=1 \
        --timeout=600 \
        --concurrency=10 \
        --session-affinity \
        --allow-unauthenticated \
        --set-env-vars="GOOGLE_API_KEY=${GOOGLE_API_KEY},LLM_PROVIDER=${LLM_PROVIDER},ENABLE_LIVE_INTERVIEW=true,GOOGLE_CLOUD_PROJECT=${PROJECT_ID}"
    
    if [ $? -eq 0 ]; then
        log_success "Service deployed to Cloud Run"
    else
        log_error "Cloud Run deployment failed"
    fi
}

display_service_url() {
    log_info "Fetching service URL..."
    
    SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
        --region="$REGION" \
        --format='value(status.url)')
    
    if [ -n "$SERVICE_URL" ]; then
        log_success "Service is live at: $SERVICE_URL"
        echo ""
        echo "📱 Open the app: $SERVICE_URL"
    else
        log_warning "Could not retrieve service URL. Check Cloud Run console."
    fi
}

# ── Main Execution ────────────────────────────────────────────────────────

main() {
    echo "═══════════════════════════════════════════════════════════════════"
    echo "  DayZero — Automated Cloud Deployment"
    echo "═══════════════════════════════════════════════════════════════════"
    echo ""
    echo "Configuration:"
    echo "  GCP Project:    $PROJECT_ID"
    echo "  Region:         $REGION"
    echo "  Service Name:   $SERVICE_NAME"
    echo "  Image:          ${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:latest"
    echo ""
    
    check_prerequisites
    set_gcp_project
    build_image
    echo ""
    deploy_to_cloud_run
    echo ""
    display_service_url
    
    echo ""
    echo "═══════════════════════════════════════════════════════════════════"
    log_success "Deployment complete!"
    echo "═══════════════════════════════════════════════════════════════════"
}

main "$@"
