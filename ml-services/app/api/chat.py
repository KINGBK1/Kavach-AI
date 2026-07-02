from fastapi import APIRouter
from pydantic import BaseModel
from app.services.chat import answer_question

router = APIRouter(
    prefix="/chat",
    tags=["Chat"]
)

class ChatRequest(BaseModel):
    question: str

@router.post("")
def chat(request: ChatRequest):
    return answer_question(request.question)