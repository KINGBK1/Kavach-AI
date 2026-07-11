import os
from dotenv import load_dotenv
from groq import Groq

load_dotenv()

MODEL_NAME = "openai/gpt-oss-120b"

client = Groq(
    api_key=os.environ.get("GROQ_API_KEY"),
)