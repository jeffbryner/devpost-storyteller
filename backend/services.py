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
bucket = storage.bucket(f"{PROJECT_ID}.appspot.com")

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
    for part in response.parts:
        if part.text is not None:
            print(part.text)
        elif part.inline_data is not None:
            image = part.as_image()
            returned_image = image
    return returned_image
