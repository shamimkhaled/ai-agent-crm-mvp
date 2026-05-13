# -*- coding: utf-8 -*-
"""
Colab / local Python — test the same *voice agent brain* as crm-mvp Twilio Gather.

Codebase references:
  - System prompt: src/lib/twilio/voiceSystemPrompt.ts  →  buildVoiceInboundSystemPrompt()
  - Gemini call:    src/services/gemini.ts             →  generateGeminiResponse()
  - Voice gather:   src/app/api/webhooks/voice/gather/route.py
  - Truncate:       src/lib/twilio/twiml.ts              →  truncateForVoice()

Colab usage:
  1. Runtime → Change runtime type → GPU optional (not required).
  2. Add secret GEMINI_API_KEY (or paste in a variable below — never commit real keys).
  3. Run cells in order, or:  !python docs/examples/colab_voice_gemini_agent_test.py

Optional: set NEXT_PUBLIC_BASE_URL to your ngrok/Vercel URL and enable
TWILIO_SKIP_SIGNATURE_VERIFY=true on the server to POST a fake Gather to /api/webhooks/voice/gather.
"""

from __future__ import annotations

import json
import os
import sys
from typing import Literal, Optional

# -----------------------------------------------------------------------------
# 0) Colab: install once
# -----------------------------------------------------------------------------
# !pip install -q google-genai requests

# -----------------------------------------------------------------------------
# 1) Config (Colab: use userdata, or os.environ)
# -----------------------------------------------------------------------------
GEMINI_API_KEY = os.environ.get("GOOGLE_GEMINI_API_KEY") or os.environ.get("GEMINI_API_KEY") or ""
try:
    from google.colab import userdata  # type: ignore

    GEMINI_API_KEY = GEMINI_API_KEY or userdata.get("GOOGLE_GEMINI_API_KEY")
except ImportError:
    pass

GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

# Optional: your deployed / tunneled Next app (no trailing slash)
NEXT_BASE_URL = os.environ.get("NEXT_BASE_URL", "").rstrip("/")  # e.g. https://abc.ngrok-free.app

# Simulated caller (Bangladesh example — change freely)
CALLER_E164 = os.environ.get("TEST_CALLER_PHONE", "+8801900000000")


def build_voice_inbound_system_prompt(
    crm_context: Optional[str] = None,
    ivr_language: Optional[Literal["en", "bn"]] = None,
) -> str:
    """Mirror of buildVoiceInboundSystemPrompt() in src/lib/twilio/voiceSystemPrompt.ts"""
    base = """You are a helpful AI CRM voice assistant for a business in Bangladesh (e.g. garments, ISP, distributor).
You are on a live phone call. Reply in short, speakable sentences (avoid bullet lists and markdown).
Mix Bangla and English naturally when helpful.
If you lack data, say you will note it and a human can follow up — do not invent order or payment facts."""

    if ivr_language == "bn":
        ivr = "\nThe caller selected **Bangla** in the phone menu — prefer বাংলা unless they clearly switch to English."
    elif ivr_language == "en":
        ivr = "\nThe caller selected **English** in the phone menu — prefer clear English."
    else:
        ivr = ""

    body = base + ivr
    if crm_context and crm_context.strip():
        body += f"""

--- CRM / product context (may be empty) ---
{crm_context.strip()}"""
    return body


def truncate_for_voice(text: str, max_len: int = 450) -> str:
    """Mirror of truncateForVoice() in src/lib/twilio/twiml.ts (TwiML Say length guard)."""
    t = " ".join(text.strip().split())
    if len(t) <= max_len:
        return t
    return t[: max_len - 3] + "..."


def voice_turn_gemini(user_speech: str, *, crm_context: str = "", ivr_lang: Optional[str] = None) -> dict:
    """
    One Gather-equivalent turn: single user message + voice system prompt → model text.
    Uses google-genai (aligns with @google/genai in the Next.js app).
    """
    if not GEMINI_API_KEY:
        return {
            "ok": False,
            "error": "Set GOOGLE_GEMINI_API_KEY or GEMINI_API_KEY in the environment (Colab: Secrets).",
        }

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        return {
            "ok": False,
            "error": "Run: pip install google-genai",
        }

    ivr: Optional[Literal["en", "bn"]] = None
    if ivr_lang in ("en", "bn"):
        ivr = ivr_lang  # type: ignore[assignment]

    system_instruction = build_voice_inbound_system_prompt(
        crm_context or None,
        ivr,
    )

    client = genai.Client(api_key=GEMINI_API_KEY)
    resp = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=user_speech,
        config=types.GenerateContentConfig(system_instruction=system_instruction),
    )
    raw = (resp.text or "").strip()
    spoken = truncate_for_voice(raw)
    return {"ok": True, "model": GEMINI_MODEL, "raw_text": raw, "twilio_say_text": spoken}


def optional_post_next_chat(messages: list, crm_context: str = "") -> dict:
    """Hit your app's /api/chat (same Gemini service on server, different system prompt than voice)."""
    if not NEXT_BASE_URL:
        return {"skipped": True, "reason": "Set NEXT_BASE_URL to call /api/chat"}
    import urllib.request

    url = f"{NEXT_BASE_URL}/api/chat"
    body = json.dumps({"messages": messages, "crmContext": crm_context}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def optional_post_gather_twilio_form(
    speech: str,
    *,
    lang: str = "",
    call_sid: str = "CAcolab_test_001",
) -> dict:
    """
    POST application/x-www-form-urlencoded like Twilio Gather.
    Server must accept unsigned requests OR you must send a valid X-Twilio-Signature
    (see Twilio docs + TWILIO_SKIP_SIGNATURE_VERIFY=true only in dev).
    """
    if not NEXT_BASE_URL:
        return {"skipped": True, "reason": "Set NEXT_BASE_URL"}

    try:
        import urllib.parse
        import urllib.request
    except ImportError:
        return {"ok": False, "error": "urllib missing"}

    path = f"{NEXT_BASE_URL}/api/webhooks/voice/gather"
    if lang in ("en", "bn"):
        path += f"?lang={lang}"

    form = {
        "CallSid": call_sid,
        "SpeechResult": speech,
        "From": CALLER_E164,
        "To": "+10000000000",
        "AccountSid": "ACcolab",
        "CallStatus": "in-progress",
    }
    data = urllib.parse.urlencode(form).encode("utf-8")
    req = urllib.request.Request(
        path,
        data=data,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            body = r.read().decode("utf-8", errors="replace")
            return {"ok": True, "status": r.status, "twiml_preview": body[:800]}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}


def _demo_cli() -> None:
    samples = [
        "হ্যালো, আমার লাস্ট অর্ডারের স্ট্যাটাস জানতে চাই।",
        "Hi, I need help with my order.",
        "goodbye",
    ]
    for s in samples:
        print("\n=== Caller:", s, "===\n")
        out = voice_turn_gemini(s, crm_context="", ivr_lang=None)
        if not out.get("ok"):
            print("ERROR:", out.get("error"))
            sys.exit(1)
        print("Model:", out["model"])
        print("Reply (as Twilio would Say, truncated):\n", out["twilio_say_text"])

    if NEXT_BASE_URL:
        print("\n=== Optional: POST /api/webhooks/voice/gather (unsigned; needs skip-verify on server) ===\n")
        g = optional_post_gather_twilio_form(samples[0])
        print(json.dumps(g, indent=2)[:1200])


if __name__ == "__main__":
    _demo_cli()
