"""Application settings loaded from environment variables."""

from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """PPT Master configuration."""

    model_config = {"env_prefix": "PPTMASTER_", "extra": "ignore"}

    openai_api_key: str = ""
    model: str = "gpt-4o"
    cache_dir: Path = Path("data/cache")
    profiles_dir: Path = Path("data/profiles")
    icons_dir: Path = Path("data/icons")
    max_retries: int = 3
    default_num_slides: int = 10
    max_tokens: int = 8192
    temperature: float = 0.7

    # MiniMax / provider-agnostic LLM settings
    minimax_api_key: str = ""
    minimax_model: str = "MiniMax-M2.5"
    minimax_base_url: str = "https://api.minimax.io/v1/"
    llm_provider: str = "minimax"
    builder_max_tokens: int = 12000


    def ensure_dirs(self) -> None:
        """Create data directories if they don't exist."""
        for d in (self.cache_dir, self.profiles_dir, self.icons_dir):
            d.mkdir(parents=True, exist_ok=True)


def get_settings() -> Settings:
    """Load settings (reads .env automatically via pydantic-settings)."""
    return Settings(_env_file=".env", _env_file_encoding="utf-8")
