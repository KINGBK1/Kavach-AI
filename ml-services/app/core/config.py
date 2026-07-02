# from ollama import Client

# OLLAMA_HOST = "http://localhost:11434"
# MODEL_NAME = "qwen3:1.7b"

# client = Client(host=OLLAMA_HOST , timeout=180)

import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

PROJECT_ID = os.getenv("GOOGLE_CLOUD_PROJECT", "bishalapac")
LOCATION = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
MODEL_NAME = "gemini-2.5-flash-lite"

client = genai.Client(
    vertexai=True,
    project=PROJECT_ID,
    location=LOCATION,
)