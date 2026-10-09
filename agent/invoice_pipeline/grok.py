"""Grok 4.7 client. The API key is read from the environment, never from source."""

from __future__ import annotations

import json
import os
import re
from typing import Callable

from openai import OpenAI

from invoice_pipeline.config import grok_base_url, grok_model, reasoning_effort

JsonOverride = Callable[[str, str], dict]
_json_override: JsonOverride | None = None
_skip_reasoning_effort = False


class GrokError(RuntimeError):
    pass


def set_json_override(override: JsonOverride | None) -> None:
    global _json_override
    _json_override = override


def _client() -> OpenAI:
    api_key = os.getenv("XAI_API_KEY")
    if not api_key:
        raise GrokError("XAI_API_KEY is not set. Add it to .env in the project root.")
    return OpenAI(api_key=api_key, base_url=grok_base_url(), timeout=180)


def parse_json_content(text: str) -> dict:
    body = (text or "").strip()
    if body.startswith("```"):
        body = re.sub(r"^```(?:json)?", "", body, flags=re.IGNORECASE).strip()
        body = re.sub(r"```$", "", body).strip()
    start = body.find("{")
    end = body.rfind("}")
    if start < 0 or end < start:
        raise GrokError("Grok did not return a JSON object.")
    try:
        payload = json.loads(body[start : end + 1])
    except json.JSONDecodeError as exc:
        raise GrokError("Grok returned invalid JSON.") from exc
    if not isinstance(payload, dict):
        raise GrokError("Grok returned JSON that is not an object.")
    return payload


def complete_json(system: str, user: str, tools: list | None = None, dispatch: Callable | None = None) -> dict:
    if _json_override is not None:
        return _json_override(system, user)
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]
    for _ in range(4):
        message = _create(messages, tools)
        tool_calls = getattr(message, "tool_calls", None)
        if tool_calls and dispatch is not None:
            messages.append(message.model_dump(exclude_none=True))
            for call in tool_calls:
                arguments = json.loads(call.function.arguments or "{}")
                result = dispatch(call.function.name, arguments)
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.id,
                        "content": json.dumps(result),
                    }
                )
            continue
        return parse_json_content(message.content or "")
    raise GrokError("Grok kept calling tools without returning a decision.")


def _create(messages: list, tools: list | None):
    global _skip_reasoning_effort
    client = _client()
    kwargs = {"model": grok_model(), "messages": messages, "temperature": 0}
    if tools:
        kwargs["tools"] = tools
    else:
        kwargs["response_format"] = {"type": "json_object"}
    if not _skip_reasoning_effort:
        kwargs["extra_body"] = {"reasoning_effort": reasoning_effort()}

    last_error: Exception | None = None
    for _ in range(4):
        try:
            response = client.chat.completions.create(**kwargs)
            return response.choices[0].message
        except Exception as exc:
            last_error = exc
            text = str(exc).lower()
            changed = False
            if "extra_body" in kwargs and any(token in text for token in ("reasoning", "extra")):
                _skip_reasoning_effort = True
                kwargs.pop("extra_body", None)
                changed = True
            if "temperature" in kwargs and "temperature" in text:
                kwargs.pop("temperature", None)
                changed = True
            if "response_format" in kwargs and "response_format" in text:
                kwargs.pop("response_format", None)
                changed = True
            if not changed:
                break
    raise GrokError(f"Grok request failed: {last_error}") from last_error
