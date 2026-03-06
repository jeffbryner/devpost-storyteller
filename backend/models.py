from pydantic import BaseModel
from typing import Optional, List


class StoryboardStep(BaseModel):
    id: Optional[int] = None
    title: str = ""
    description: str = ""
    image_prompt: str = ""


class StoryboardRequest(BaseModel):
    steps: List[StoryboardStep]
    theme: str


class StoryboardResponse(BaseModel):
    id: str
    data: dict
