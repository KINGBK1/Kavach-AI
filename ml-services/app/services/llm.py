# import time

# from app.core.config import client, MODEL_NAME


# def ask_llm(system_prompt: str, user_prompt: str):
#     start = time.perf_counter()

#     response = client.chat(
#         model=MODEL_NAME,
#         messages=[
#             {
#                 "role": "system",
#                 "content": system_prompt,
#             },
#             {
#                 "role": "user",
#                 "content": user_prompt,
#             },
#         ],
#     )

#     elapsed = round((time.perf_counter() - start) * 1000)

#     return {
#         "response": response.message.content,
#         "processing_time_ms": elapsed,
#         "model": MODEL_NAME,
#     }

# services/llm.py
import time
from app.core.config import client, MODEL_NAME


def ask_llm(system_prompt: str, user_prompt: str):
    start = time.perf_counter()

    response = client.models.generate_content(
        model=MODEL_NAME,
        contents=user_prompt,
        config={
            "system_instruction": system_prompt,
            "temperature": 0.2,
            "response_mime_type": "application/json",
        }
    )

    elapsed = round((time.perf_counter() - start) * 1000)

    return {
        "response": response.text,
        "processing_time_ms": elapsed,
        "model": MODEL_NAME,
    }