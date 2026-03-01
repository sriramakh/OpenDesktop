"""OpenAI API wrapper with structured JSON output and retry logic."""

from __future__ import annotations

import json
import sys
import time
from typing import Any

from openai import OpenAI

from pptmaster.config import get_settings


class OpenAIClient:
    """Thin wrapper around OpenAI API for structured JSON generation."""

    def __init__(self, api_key: str | None = None, model: str | None = None):
        settings = get_settings()
        self._api_key = api_key or settings.openai_api_key
        self._model = model or settings.model
        self._max_retries = settings.max_retries
        self._max_tokens = settings.max_tokens
        self._client = OpenAI(api_key=self._api_key)

    def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int | None = None,
        temperature: float = 0.7,
    ) -> dict[str, Any]:
        """Generate structured JSON output.

        Uses JSON mode and retries up to max_retries times on failure.
        If response is truncated (finish_reason=length), retries with higher tokens.
        """
        tokens = max_tokens or self._max_tokens
        last_error: Exception | None = None

        for attempt in range(self._max_retries):
            try:
                response = self._client.chat.completions.create(
                    model=self._model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    response_format={"type": "json_object"},
                    max_tokens=tokens,
                    temperature=temperature,
                )

                choice = response.choices[0]
                content = choice.message.content

                if not content:
                    raise ValueError("Empty response from OpenAI")

                # Check for truncation
                if choice.finish_reason == "length":
                    print(f"  [warn] Response truncated at {tokens} tokens, retrying with more...", file=sys.stderr)
                    tokens = min(tokens + 4096, 16384)
                    # Try to salvage partial JSON
                    result = _try_parse_partial_json(content)
                    if result and "slides" in result and len(result.get("slides", [])) >= 5:
                        return result
                    continue

                return json.loads(content)

            except json.JSONDecodeError as e:
                last_error = e
                # Try to salvage
                if content:
                    result = _try_parse_partial_json(content)
                    if result:
                        return result
                if attempt < self._max_retries - 1:
                    time.sleep(2 ** attempt)

            except Exception as e:
                last_error = e
                if attempt < self._max_retries - 1:
                    time.sleep(2 ** attempt)

        raise RuntimeError(
            f"OpenAI generation failed after {self._max_retries} attempts: {last_error}"
        )

    def generate_text(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int | None = None,
        temperature: float = 0.7,
    ) -> str:
        """Generate plain text output."""
        tokens = max_tokens or self._max_tokens
        last_error: Exception | None = None

        for attempt in range(self._max_retries):
            try:
                response = self._client.chat.completions.create(
                    model=self._model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    max_tokens=tokens,
                    temperature=temperature,
                )

                content = response.choices[0].message.content
                if not content:
                    raise ValueError("Empty response from OpenAI")

                return content

            except Exception as e:
                last_error = e
                if attempt < self._max_retries - 1:
                    time.sleep(2 ** attempt)

        raise RuntimeError(
            f"OpenAI generation failed after {self._max_retries} attempts: {last_error}"
        )


def _try_parse_partial_json(text: str) -> dict[str, Any] | None:
    """Try to parse truncated JSON by closing open brackets."""
    text = text.strip()

    # Try as-is first
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Try closing brackets/braces
    for suffix in ["]}", "]}}", "]}}]}", "]}]}}"]:
        try:
            return json.loads(text + suffix)
        except json.JSONDecodeError:
            continue

    # Try trimming to last complete slide object
    close_suffixes = ["]}",  "]}}", "]}}"]
    last_brace = text.rfind("}")
    if last_brace > 0:
        for end_pos in range(last_brace, max(last_brace - 500, 0), -1):
            candidate = text[:end_pos + 1]
            for suffix in close_suffixes:
                try:
                    return json.loads(candidate + suffix)
                except json.JSONDecodeError:
                    continue

    return None
