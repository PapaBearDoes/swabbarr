"""
============================================================================
Swabbarr — Media Library Pruning Engine
============================================================================

FastAPI application entry point.
Manages application lifespan (startup/shutdown), database initialization,
and router registration.

----------------------------------------------------------------------------
FILE VERSION: v1.1.0
LAST MODIFIED: 2026-04-01
COMPONENT: swabbarr-api
CLEAN ARCHITECTURE: Compliant
Repository: https://github.com/PapaBearDoes/swabbarr
============================================================================
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.managers.logging_config_manager import create_logging_config_manager
from src.managers.db_manager import create_db_manager, _read_secret
from src.clients.radarr_client import create_radarr_client
from src.clients.sonarr_client import create_sonarr_client
from src.clients.tautulli_client import create_tautulli_client
from src.clients.seerr_client import create_seerr_client


# ---------------------------------------------------------------------------
# Logging (initialized immediately — Rule #9)
# ---------------------------------------------------------------------------
log_manager = create_logging_config_manager(component="swabbarr-api")
log = log_manager.get_logger("main")


# ---------------------------------------------------------------------------
# Application lifespan (startup / shutdown)
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(application: FastAPI):
    """Manage startup and shutdown of shared resources."""

    # --- Startup ---
    log.info("Swabbarr API starting up")

    # Database
    db_manager = await create_db_manager(
        log=log_manager.get_logger("db_manager"),
    )
    application.state.db_manager = db_manager
    log.success("Database manager ready")

    # API Clients (Phase 2)
    clients = {}

    # Radarr
    radarr_url = os.environ.get("SWABBARR_RADARR_URL", "")
    if radarr_url:
        radarr_key = _read_secret("/run/secrets/swabbarr_radarr_api_key")
        clients["radarr"] = create_radarr_client(
            base_url=radarr_url, api_key=radarr_key,
            log=log_manager.get_logger("radarr_client"),
        )
        await clients["radarr"].health_check()

    # Sonarr
    sonarr_url = os.environ.get("SWABBARR_SONARR_URL", "")
    if sonarr_url:
        sonarr_key = _read_secret("/run/secrets/swabbarr_sonarr_api_key")
        clients["sonarr"] = create_sonarr_client(
            base_url=sonarr_url, api_key=sonarr_key,
            log=log_manager.get_logger("sonarr_client"),
            arr_source="sonarr",
        )
        await clients["sonarr"].health_check()

    # Sonarr-Anime
    sonarr_anime_url = os.environ.get("SWABBARR_SONARR_ANIME_URL", "")
    if sonarr_anime_url:
        sonarr_anime_key = _read_secret("/run/secrets/swabbarr_sonarr_anime_api_key")
        clients["sonarr_anime"] = create_sonarr_client(
            base_url=sonarr_anime_url, api_key=sonarr_anime_key,
            log=log_manager.get_logger("sonarr_anime_client"),
            arr_source="sonarr-anime",
        )
        await clients["sonarr_anime"].health_check()

    # Tautulli
    tautulli_url = os.environ.get("SWABBARR_TAUTULLI_URL", "")
    if tautulli_url:
        tautulli_key = _read_secret("/run/secrets/swabbarr_tautulli_api_key")
        clients["tautulli"] = create_tautulli_client(
            base_url=tautulli_url, api_key=tautulli_key,
            log=log_manager.get_logger("tautulli_client"),
        )
        await clients["tautulli"].health_check()

    # Seerr
    seerr_url = os.environ.get("SWABBARR_SEERR_URL", "")
    if seerr_url:
        seerr_key = _read_secret("/run/secrets/swabbarr_seerr_api_key")
        clients["seerr"] = create_seerr_client(
            base_url=seerr_url, api_key=seerr_key,
            log=log_manager.get_logger("seerr_client"),
        )
        await clients["seerr"].health_check()

    application.state.clients = clients
    log.success(f"API clients initialized: {list(clients.keys())}")

    # TODO Phase 3: Initialize scoring engine
    # TODO Phase 6: Initialize APScheduler

    log.success("Swabbarr API startup complete")

    yield

    # --- Shutdown ---
    log.info("Swabbarr API shutting down")
    for name, client in application.state.clients.items():
        await client.close()
    await db_manager.close()
    log.info("Swabbarr API shutdown complete")


# ---------------------------------------------------------------------------
# FastAPI application
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Swabbarr",
    description="Media Library Pruning Engine",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS middleware (dashboard needs to call the API)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",     # Next.js dev server
        "http://localhost:8484",     # API dev
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Health endpoint (always available, expanded in Phase 4)
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health_check():
    """Basic health check — returns 200 if the API is running."""
    return {
        "status": "healthy",
        "service": "swabbarr-api",
        "version": "0.1.0",
    }


# TODO Phase 4: Register routers
# from src.routers import scores, config, media, actions
# app.include_router(scores.router, prefix="/api/scores", tags=["scores"])
# app.include_router(config.router, prefix="/api/config", tags=["config"])
# app.include_router(media.router, prefix="/api/media", tags=["media"])
# app.include_router(actions.router, prefix="/api/actions", tags=["actions"])
