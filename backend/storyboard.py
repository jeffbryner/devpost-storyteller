from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import uuid
import datetime

from services import ai_client, db, bucket, generate_storyboard_image, logger

router = APIRouter()


class StoryboardStep(BaseModel):
    id: Optional[str] = None
    title: Optional[str] = None
    description: Optional[str] = None
    image_prompt: Optional[str] = None


class StoryboardRequest(BaseModel):
    steps: List[StoryboardStep]
    theme: str


class StoryboardResponse(BaseModel):
    id: str
    data: dict


@router.post("/api/storyboard", response_model=StoryboardResponse)
async def create_storyboard(request: StoryboardRequest):
    storyboard_id = str(uuid.uuid4())
    logger.info(f"StoryBoard Request received {request}")

    # Convert steps to dicts for the prompt builder
    steps_as_dicts = [
        step.model_dump() if hasattr(step, "model_dump") else step.dict()
        for step in request.steps
    ]

    # Generate a single storyboard image with all steps as panels
    storyboard_image_url = None
    try:
        generated_image = generate_storyboard_image(steps_as_dicts, request.theme)

        if generated_image:
            image_bytes = generated_image.image_bytes

            # Upload to Cloud Storage
            image_filename = f"storyboards/{storyboard_id}/storyboard.jpg"
            blob = bucket.blob(image_filename)
            blob.upload_from_string(image_bytes, content_type="image/jpeg")

            # Make the blob publicly viewable
            # blob.make_public()

            # storyboard_image_url = blob.generate_signed_url(
            #     version="v4",
            #     # This URL is valid for x days
            #     expiration=datetime.timedelta(days=7),
            #     # Allow GET requests using this URL.
            #     method="GET",
            # )
            storyboard_image_url = blob.public_url
            logger.info(f"Storyboard image uploaded to {storyboard_image_url}")

    except Exception as e:
        logger.error(f"Error generating or saving storyboard image: {e}")

    storyboard_data = {
        "theme": request.theme,
        "storyboard_image_url": storyboard_image_url,
        "steps": steps_as_dicts,
        "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }

    # Save to Firestore
    try:
        db.collection("storyboards").document(storyboard_id).set(storyboard_data)
    except Exception as e:
        logger.error(f"Error saving to Firestore: {e}")
        raise HTTPException(status_code=500, detail="Failed to save storyboard.")

    return StoryboardResponse(id=storyboard_id, data=storyboard_data)


@router.get("/api/storyboard/{storyboard_id}", response_model=StoryboardResponse)
def get_storyboard(storyboard_id: str):
    try:
        doc_snapshot = db.collection("storyboards").document(storyboard_id).get()
        if not doc_snapshot.exists:
            raise HTTPException(status_code=404, detail="Storyboard not found.")
        doc_data = doc_snapshot.to_dict()
        if doc_data is None:
            raise HTTPException(status_code=404, detail="Storyboard data is empty.")
        return StoryboardResponse(id=storyboard_id, data=doc_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching storyboard: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch storyboard.")
