import os
import firebase_admin
from firebase_admin import credentials, firestore, storage
from google import genai
from google.genai import types
import google.auth
import logging
from datetime import datetime
import sys

logging.basicConfig(
    level=logging.DEBUG,
    stream=sys.stdout,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
# ignore websocket debug logs
logging.getLogger("websockets").setLevel(logging.INFO)
logger = logging.getLogger()
credentials, PROJECT_ID = google.auth.default()

# Initialize Firebase Admin
# Defaults to using GOOGLE_APPLICATION_CREDENTIALS or Compute Engine environment
firebase_app = firebase_admin.initialize_app()
db = firestore.client()
# Note: storage.bucket() requires a default bucket name configured or passed explicitly,
# We will use the default bucket initialization here.
bucket = storage.bucket(f"{PROJECT_ID}.firebasestorage.app")

# Initialize Google GenAI (Vertex AI) client
# Project: prj-devpost-athon-adf
project_id = os.environ.get("GOOGLE_CLOUD_PROJECT", "prj-devpost-athon-adf")
location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")

IMAGE_MODEL = "gemini-2.5-flash-image"
MODEL = "gemini-3.1-pro-preview"
LIVE_MODEL = "gemini-live-2.5-flash-native-audio"

ai_client = genai.Client(vertexai=True, project=project_id, location=location)


def get_current_time_and_date() -> str:
    """
    Returns the current day of the week, month, day, and year.
    Use this when the user asks for the current date or time.
    """
    # Example format: "Monday, March 01, 2026"
    logger.info("TOOL get_current_time_and_date called")
    print("TOOL get_current_time_and_date called", flush=True)
    return datetime.now().strftime("%A, %B %d, %Y")


def generate_image(prompt):
    try:
        response = ai_client.models.generate_content(
            model=IMAGE_MODEL,
            contents=[prompt],
            config=types.GenerateContentConfig(
                response_modalities=["Image"],
                temperature=2.0,
                image_config=types.ImageConfig(
                    aspect_ratio="1:1", person_generation="ALLOW_ADULT"
                ),
            ),
        )

        returned_image = None
        for part in response.parts or []:
            if part.text is not None:
                print(part.text)
            elif part.inline_data is not None:
                image = part.as_image()
                returned_image = image
        return returned_image
    except Exception as e:
        logger.error(f"Generate_Image: Error generating image: {e}")
        return None


def generate_storyboard_image(steps: list, theme: str):
    """Generate a single storyboard image with all steps as panels in one API call."""
    try:
        # Build panel descriptions
        panel_descriptions = []
        for idx, step in enumerate(steps):
            title = step.get("title", f"Step {idx + 1}")
            description = step.get("description", "")
            image_prompt = step.get("image_prompt", "")
            panel_descriptions.append(
                f'Panel {idx + 1} - "{title}": {description}. {image_prompt}'
            )

        panels_text = "\n".join(panel_descriptions)
        num_panels = len(steps)

        prompt = (
            f"A child-friendly, safe-for-all-ages {theme} style comic strip "
            f"illustration divided into {num_panels} sequential panels telling "
            f"a positive visual story:\n\n{panels_text}"
        )

        logger.info(f"Generating storyboard image with prompt: {prompt}")

        response = ai_client.models.generate_content(
            model=IMAGE_MODEL,
            contents=[prompt],
            config=types.GenerateContentConfig(
                response_modalities=["Text", "Image"],
                temperature=1.0,
                safety_settings=[
                    types.SafetySetting(
                        category=types.HarmCategory.HARM_CATEGORY_HARASSMENT,
                        threshold=types.HarmBlockThreshold.BLOCK_ONLY_HIGH,
                    ),
                    types.SafetySetting(
                        category=types.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                        threshold=types.HarmBlockThreshold.BLOCK_ONLY_HIGH,
                    ),
                    types.SafetySetting(
                        category=types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                        threshold=types.HarmBlockThreshold.BLOCK_ONLY_HIGH,
                    ),
                    types.SafetySetting(
                        category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                        threshold=types.HarmBlockThreshold.BLOCK_ONLY_HIGH,
                    ),
                ],
                image_config=types.ImageConfig(
                    aspect_ratio="1:1", person_generation="ALLOW_ALL"
                ),
            ),
        )

        # Diagnostic logging to understand empty responses
        logger.info(f"GEMINI response type: {type(response)}")
        if hasattr(response, "candidates") and response.candidates:
            for i, candidate in enumerate(response.candidates):
                logger.info(
                    f"GEMINI candidate[{i}] finish_reason: {getattr(candidate, 'finish_reason', 'N/A')}"
                )
                logger.info(
                    f"GEMINI candidate[{i}] safety_ratings: {getattr(candidate, 'safety_ratings', 'N/A')}"
                )
        else:
            logger.warning("GEMINI response has no candidates!")
        if hasattr(response, "prompt_feedback"):
            logger.info(f"GEMINI prompt_feedback: {response.prompt_feedback}")
        logger.info(f"GEMINI response.parts: {response.parts}")

        returned_image = None
        for part in response.parts or []:
            logger.info(f"GEMINI Received part: {part}")
            if part.text is not None:
                print(part.text)
            elif part.inline_data is not None:
                image = part.as_image()
                returned_image = image
        return returned_image
    except Exception as e:
        logger.error(
            f"generate_storyboard_image: Error generating storyboard image: {e}"
        )
        return None
