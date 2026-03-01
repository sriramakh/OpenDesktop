"""Provider-agnostic LLM client using OpenAI SDK's base_url parameter."""

from __future__ import annotations

import json
import re
import sys
import time
from typing import Any

from openai import OpenAI

from pptmaster.config import get_settings

# Provider presets: (base_url, default_model)
_PROVIDER_PRESETS: dict[str, tuple[str | None, str]] = {
    "minimax": ("https://api.minimax.io/v1/", "MiniMax-M2.5"),
    "openai": (None, "gpt-4o"),
}


class LLMClient:
    """Thin wrapper around OpenAI-compatible APIs for structured JSON generation."""

    def __init__(
        self,
        provider: str = "minimax",
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
    ):
        settings = get_settings()

        # Resolve provider defaults
        preset_url, preset_model = _PROVIDER_PRESETS.get(provider, (None, "gpt-4o"))

        if provider == "minimax":
            resolved_key = api_key or settings.minimax_api_key or settings.openai_api_key
            resolved_model = model or settings.minimax_model or preset_model
            resolved_url = base_url or settings.minimax_base_url or preset_url
        elif provider == "openai":
            resolved_key = api_key or settings.openai_api_key
            resolved_model = model or settings.model or preset_model
            resolved_url = base_url
        else:
            # Custom provider — use whatever is passed
            resolved_key = api_key or settings.openai_api_key
            resolved_model = model or "gpt-4o"
            resolved_url = base_url or preset_url

        self._model = resolved_model
        self._max_retries = settings.max_retries
        self._client = OpenAI(api_key=resolved_key, base_url=resolved_url)

    def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 8192,
        temperature: float = 0.7,
    ) -> dict[str, Any]:
        """Generate structured JSON output with retry and truncation recovery."""
        tokens = max_tokens
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
                    raise ValueError("Empty response from LLM")

                # Clean thinking tokens and code fences
                content = _clean_response(content)

                # Check for truncation
                if choice.finish_reason == "length":
                    print(
                        f"  [warn] Response truncated at {tokens} tokens, retrying with more...",
                        file=sys.stderr,
                    )
                    tokens = min(tokens + 4096, 16384)
                    result = _try_parse_partial_json(content)
                    if result:
                        return result
                    continue

                # Try parsing, repair common LLM JSON errors if needed
                try:
                    return json.loads(content)
                except json.JSONDecodeError:
                    repaired = _repair_json(content)
                    return json.loads(repaired)

            except json.JSONDecodeError as e:
                last_error = e
                if content:
                    result = _try_parse_partial_json(content)
                    if result:
                        return result
                if attempt < self._max_retries - 1:
                    time.sleep(2**attempt)

            except Exception as e:
                last_error = e
                if attempt < self._max_retries - 1:
                    time.sleep(2**attempt)

        raise RuntimeError(
            f"LLM generation failed after {self._max_retries} attempts: {last_error}"
        )

    def generate_text(
        self,
        system_prompt: str,
        user_prompt: str,
        max_tokens: int = 8192,
        temperature: float = 0.7,
    ) -> str:
        """Generate plain text output."""
        tokens = max_tokens
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
                    raise ValueError("Empty response from LLM")
                return content

            except Exception as e:
                last_error = e
                if attempt < self._max_retries - 1:
                    time.sleep(2**attempt)

        raise RuntimeError(
            f"LLM generation failed after {self._max_retries} attempts: {last_error}"
        )


def _clean_response(text: str) -> str:
    """Strip <think> blocks, markdown code fences, and whitespace from LLM output."""
    # Remove <think>...</think> blocks (MiniMax reasoning tokens)
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    # Remove markdown code fences
    text = re.sub(r"^```(?:json)?\s*\n?", "", text.strip(), flags=re.MULTILINE)
    text = re.sub(r"\n?```\s*$", "", text.strip(), flags=re.MULTILINE)
    return text.strip()


def _repair_json(text: str) -> str:
    """Fix common LLM JSON errors: unquoted values, trailing commas, etc.

    Uses a character-scanner to find unquoted tokens inside JSON arrays/objects
    and wrap them in double-quotes.
    """
    # Trailing commas before ] or }
    text = re.sub(r',\s*([\]}])', r'\1', text)
    # Single-quoted strings → double-quoted
    text = re.sub(r"(?<=[:\[,\{])\s*'([^']*?)'", r' "\1"', text)

    # Scan for unquoted values: any token that appears where a JSON value is
    # expected but isn't a string, number, bool, null, array, or object start.
    result = []
    i = 0
    in_string = False
    while i < len(text):
        ch = text[i]

        if ch == '"' and (i == 0 or text[i - 1] != '\\'):
            in_string = not in_string
            result.append(ch)
            i += 1
            continue

        if in_string:
            result.append(ch)
            i += 1
            continue

        # After : , or [ we expect a value
        if ch in ':,[' and i + 1 < len(text):
            result.append(ch)
            i += 1
            # Skip whitespace
            while i < len(text) and text[i] in ' \t\n\r':
                result.append(text[i])
                i += 1
            if i >= len(text):
                break
            next_ch = text[i]
            # Valid JSON value starters: " { [ digit - true false null
            if next_ch in '"{}[]tfn' or next_ch.isdigit() or next_ch == '-':
                continue
            # Unquoted value — collect until , ] } and wrap in quotes
            token_start = i
            while i < len(text) and text[i] not in ',]}\n':
                i += 1
            token = text[token_start:i].strip()
            if token:
                result.append(f'"{token}"')
            continue

        result.append(ch)
        i += 1

    return "".join(result)


def _try_parse_partial_json(text: str) -> dict[str, Any] | None:
    """Try to parse truncated JSON by closing open brackets."""
    text = _clean_response(text)
    text = _repair_json(text)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    for suffix in ["}", "]}", "]}}", "]}}]}", "]}]}}"]:
        try:
            return json.loads(text + suffix)
        except json.JSONDecodeError:
            continue

    last_brace = text.rfind("}")
    if last_brace > 0:
        for end_pos in range(last_brace, max(last_brace - 500, 0), -1):
            candidate = text[: end_pos + 1]
            for suffix in ["", "]}", "]}}"]:
                try:
                    return json.loads(candidate + suffix)
                except json.JSONDecodeError:
                    continue

    return None
