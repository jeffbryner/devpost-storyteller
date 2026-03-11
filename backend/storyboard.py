from typing import cast

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from google.cloud.firestore_v1.base_document import DocumentSnapshot
from models import StoryboardRequest, StoryboardResponse, StoryboardStep
import uuid
import datetime
import json
from services import (
    db,
    bucket,
    generate_storyboard_image,
    get_grid_dimensions,
    logger,
)

router = APIRouter()


@router.post("/api/storyboard")
async def create_storyboard(request: StoryboardRequest):
    storyboard_id = str(uuid.uuid4())
    logger.info(f"StoryBoard Request received {request}")

    # Convert steps to dicts for the prompt builder
    steps_as_dicts = [
        step.model_dump() if hasattr(step, "model_dump") else step.dict()
        for step in request.steps
    ]

    async def event_stream():
        storyboard_image_url = None
        try:
            for item in generate_storyboard_image(steps_as_dicts, request.theme):
                if item["type"] == "text":
                    # yield the text chunk immediately
                    data_str = json.dumps({"type": "text", "content": item["content"]})
                    yield f"data: {data_str}\n\n"

                elif item["type"] == "error":
                    data_str = json.dumps({"type": "error", "message": item["content"]})
                    yield f"data: {data_str}\n\n"
                    return

                elif item["type"] == "image":
                    generated_image = item["content"]
                    image_bytes = generated_image.image_bytes  # type: ignore[union-attr]

                    # Upload to Cloud Storage
                    image_filename = f"storyboards/{storyboard_id}/storyboard.jpg"
                    blob = bucket.blob(image_filename)
                    blob.upload_from_string(image_bytes, content_type="image/jpeg")

                    storyboard_image_url = blob.public_url
                    logger.info(f"Storyboard image uploaded to {storyboard_image_url}")

            # Compute consistent grid layout for overlay alignment
            grid_cols, grid_rows = get_grid_dimensions(len(steps_as_dicts))

            storyboard_data = {
                "theme": request.theme,
                "storyboard_image_url": storyboard_image_url,
                "steps": steps_as_dicts,
                "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "grid_cols": grid_cols,
                "grid_rows": grid_rows,
            }

            # Save to Firestore
            try:
                db.collection("storyboards").document(storyboard_id).set(
                    storyboard_data
                )
            except Exception as e:
                logger.error(f"Error saving to Firestore: {e}")
                data_str = json.dumps(
                    {"type": "error", "message": "Failed to save storyboard."}
                )
                yield f"data: {data_str}\n\n"
                return

            # Yield the final completion with full data
            data_str = json.dumps(
                {"type": "complete", "id": storyboard_id, "data": storyboard_data}
            )
            yield f"data: {data_str}\n\n"

        except Exception as e:
            logger.error(f"Error in storyboard stream: {e}")
            data_str = json.dumps({"type": "error", "message": str(e)})
            yield f"data: {data_str}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/api/storyboard/{storyboard_id}", response_model=StoryboardResponse)
def get_storyboard(storyboard_id: str):
    try:
        doc_snapshot = cast(
            DocumentSnapshot,
            db.collection("storyboards").document(storyboard_id).get(),
        )
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
