import time
from app.core.config import client, MODEL_NAME

MAX_RETRIES = 2
BASE_BACKOFF = 2.0


def ask_llm(system_prompt: str, user_prompt: str):
    start = time.perf_counter()

    for attempt in range(1 + MAX_RETRIES):
        try:
            stream = client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.2,
                max_completion_tokens=4096,
                reasoning_effort="medium",
                stream=True,
                stop=None,
            )

            raw_text = ""
            for chunk in stream:
                content = chunk.choices[0].delta.content or ""
                raw_text += content

            elapsed = round((time.perf_counter() - start) * 1000)

            print(f"[LLM] model={MODEL_NAME} attempt={attempt} "
                  f"elapsed={elapsed}ms "
                  f"raw_response={raw_text[:800]}", flush=True)

            if raw_text.strip():
                return {
                    "response": raw_text,
                    "processing_time_ms": elapsed,
                    "model": MODEL_NAME,
                }
        except Exception as e:
            print(f"[LLM] attempt {attempt} failed: {e}", flush=True)
            if attempt < MAX_RETRIES:
                time.sleep(BASE_BACKOFF * (attempt + 1))

    elapsed = round((time.perf_counter() - start) * 1000)
    print(f"[LLM] all {MAX_RETRIES + 1} attempts exhausted, returning empty", flush=True)
    return {
        "response": "",
        "processing_time_ms": elapsed,
        "model": MODEL_NAME,
    }
