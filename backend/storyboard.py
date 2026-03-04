from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import uuid
import datetime
from google.genai import types

from services import ai_client, db, bucket, generate_image, logger

router = APIRouter()


class StoryboardStep(BaseModel):
    id: Optional[str] = None
    title: Optional[str] = None
    description: str


class StoryboardRequest(BaseModel):
    steps: List[StoryboardStep]
    theme: str


class StoryboardResponse(BaseModel):
    id: str
    data: dict


@router.post("/api/storyboard", response_model=StoryboardResponse)
async def create_storyboard(request: StoryboardRequest):
    storyboard_id = str(uuid.uuid4())

    updated_steps = []

    for idx, step in enumerate(request.steps):
        # Generate image using Imagen
        prompt = f"A {request.theme} style illustration. {step.description}"
        image_url = None
        try:
            generated_image = generate_image(prompt)

            if generated_image:
                image_bytes = generated_image.image_bytes

                # Upload to Cloud Storage
                image_filename = f"storyboards/{storyboard_id}/step_{idx}.jpg"
                blob = bucket.blob(image_filename)
                blob.upload_from_string(image_bytes, content_type="image/jpeg")

                # Make the blob publicly viewable
                blob.make_public()
                image_url = blob.public_url

        except Exception as e:
            logger.error(f"Error generating or saving image for step {idx}: {e}")

        step_dict = step.model_dump() if hasattr(step, "model_dump") else step.dict()
        step_dict["image_url"] = image_url
        updated_steps.append(step_dict)

    storyboard_data = {
        "theme": request.theme,
        "steps": updated_steps,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }

    # Save to Firestore
    try:
        db.collection("storyboards").document(storyboard_id).set(storyboard_data)
    except Exception as e:
        logger.error(f"Error saving to Firestore: {e}")
        raise HTTPException(status_code=500, detail="Failed to save storyboard.")

    return StoryboardResponse(id=storyboard_id, data=storyboard_data)
