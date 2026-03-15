import sys
import os
import firebase_admin
from firebase_admin import firestore, storage
from google.cloud.firestore_v1.client import Client as FirestoreClient
from google import genai
from google.genai import types
import google.auth
from google.cloud import secretmanager
import google_crc32c
import logging
from datetime import datetime
from dotenv import load_dotenv

logging.basicConfig(
    level=logging.DEBUG,
    stream=sys.stdout,
    format="%(asctime)s - %(levelname)s - %(message)s",
)
# ignore websocket debug logs
logging.getLogger("websockets").setLevel(logging.INFO)
logger = logging.getLogger()

# to facilitate local development, load environment variables from .env file
load_dotenv()
credentials, PROJECT_ID = google.auth.default()

# Initialize Firebase Admin
# Defaults to using GOOGLE_APPLICATION_CREDENTIALS or Compute Engine environment
firebase_app = firebase_admin.initialize_app()
db: FirestoreClient = firestore.client()
# Note: storage.bucket() requires a default bucket name configured or passed explicitly,
# We will use the default bucket initialization here.
storage_bucket = storage.bucket(f"{PROJECT_ID}.firebasestorage.app")


def get_secret(project_id, secret_id, version_id="latest"):
    """
    Access the payload for the given secret version if one exists. The version
    can be a version number as a string (e.g. "5") or an alias (e.g. "latest").
    """
    secret_client = secretmanager.SecretManagerServiceClient()

    # Build the resource name of the secret version.
    name = f"projects/{project_id}/secrets/{secret_id}/versions/{version_id}"

    # Access the secret version.
    response = secret_client.access_secret_version(request={"name": name})

    # Verify payload checksum.
    crc32c = google_crc32c.Checksum()
    crc32c.update(response.payload.data)
    if response.payload.data_crc32c != int(crc32c.hexdigest(), 16):
        logger.error(f"Data corruption detected when retrieving secret {secret_id}.")
        return "error"
    payload = response.payload.data.decode("UTF-8")
    return f"{payload}"


# Settings
IMAGE_MODEL = "gemini-3-pro-image-preview"
MODEL = "gemini-3.1-pro-preview"
LIVE_MODEL = "gemini-live-2.5-flash-native-audio"
DEFAULT_AUDIO_TIMEOUT = int(os.getenv("DEFAULT_AUDIO_TIMEOUT", "15"))  # seconds
DEFAULT_ORIGIN = os.getenv("DEFAULT_ORIGIN", "http://localhost:5173")
GEMINI_IMAGE_API_KEY = os.getenv("GEMINI_IMAGE_API_KEY", None)
if not GEMINI_IMAGE_API_KEY:
    logger.info("Gathering GEMINI_IMAGE_API_KEY from secret manager")
    try:
        GEMINI_IMAGE_API_KEY = get_secret(PROJECT_ID, "gemini_image_api_key")
    except Exception as e:
        logger.error(f"Error retrieving GEMINI_IMAGE_API_KEY from Secret Manager: {e}")
        GEMINI_IMAGE_API_KEY = None


# Initialize Google GenAI (Vertex AI) client
location = os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1")
ai_client = genai.Client(vertexai=True, project=PROJECT_ID, location=location)


def get_current_time_and_date() -> str:
    """
    Returns the current day of the week, month, day, and year.
    Use this when the user asks for the current date or time.
    """
    # Example format: "Monday, March 01, 2026"
    return datetime.now().strftime("%A, %B %d, %Y")


def get_grid_dimensions(num_panels: int) -> tuple[int, int]:
    """Return (cols, rows) for a consistent 3-column grid layout."""
    import math

    cols = 3
    rows = math.ceil(num_panels / cols)
    return cols, rows


def generate_storyboard_image(steps: list, theme: str):
    """Generate a single storyboard image with all steps as panels in one API call."""
    try:
        # Build panel descriptions
        panel_descriptions = []
        for idx, step in enumerate(steps):
            title = step.get("step_title", f"Step {idx + 1}")
            description = step.get("description", "")
            image_prompt = step.get("image_prompt", "")
            panel_descriptions.append(
                f'Panel {idx + 1} - "{title}": {description}. {image_prompt}'
            )

        panels_text = "\n".join(panel_descriptions)
        num_panels = len(steps)
        grid_cols, grid_rows = get_grid_dimensions(num_panels)

        prompt = (
            f"A child-friendly, safe-for-all-ages {theme} style storyboard "
            f"illustration with exactly {num_panels} sequential panels arranged "
            f"in a strict {grid_cols}-column, {grid_rows}-row grid. "
            f"Panels are numbered left-to-right, top-to-bottom. "
            f"Each panel is exactly the same size with a clear visible border between panels. "
            f"Do not add any extra panels or empty cells. "
            f"The visual story:\n\n{panels_text}"
        )

        logger.info(f"Generating storyboard image with prompt: {prompt}")
        ai_image_client = None
        # create a default image configuration, which may be overridden if using API key auth,
        # which has different capabilities and limits.
        # Notably, person generation and output mime type settings are not currently allowed with API key auth,
        # likely due to safety settings, so we set the defaults to allow person generation but not specify an output mime type, which will default to image/png.
        image_configuration = (
            types.ImageConfig(
                # person_generation="ALLOW_ALL",
                image_size="1K",
                # output_mime_type="image/png",
            ),
        )
        if GEMINI_IMAGE_API_KEY:
            logger.info(
                "Using GEMINI_IMAGE_API_KEY for authentication with GenAI client."
            )
            ai_image_client = genai.Client(
                vertexai=False,
                api_key=GEMINI_IMAGE_API_KEY,
                http_options=types.HttpOptions(
                    retry_options=types.HttpRetryOptions(
                        initial_delay=1.2,
                        attempts=5,
                        exp_base=2,
                        max_delay=10,
                        jitter=0.5,
                        http_status_codes=[408, 429, 500, 502, 503, 504],
                    ),
                    timeout=120 * 1000,
                ),
            )
            image_configuration = types.ImageConfig(
                # person_generation="ALLOW_ALL",  # NOTE: person generation is currently not allowed with API key auth
                image_size="1K",
                # output_mime_type="image/png",   # NOTE: also not allowed with api auth
            )

        else:
            # use a project with quota
            logger.info("Using vertex authentication with GenAI client.")
            ai_image_client = genai.Client(
                vertexai=True,
                project=PROJECT_ID,
                credentials=credentials,
                http_options=types.HttpOptions(
                    retry_options=types.HttpRetryOptions(
                        initial_delay=1.2,
                        attempts=5,
                        exp_base=2,
                        max_delay=10,
                        jitter=0.5,
                        http_status_codes=[408, 429, 500, 502, 503, 504],
                    ),
                    timeout=120 * 1000,
                ),
            )
            image_configuration = types.ImageConfig(
                person_generation="ALLOW_ALL",  # person generation is allowed in vertex
                image_size="1K",
                output_mime_type="image/png",
            )
        response = ai_image_client.models.generate_content_stream(
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
                image_config=image_configuration,
            ),
        )

        returned_image = None
        for chunk in response:
            if hasattr(chunk, "parts") and chunk.parts:
                for part in chunk.parts:
                    if part.text is not None:
                        logger.debug(f"Received text chunk: {part.text}")
                        yield {"type": "text", "content": part.text}
                    elif part.inline_data is not None:
                        returned_image = part.as_image()

        if returned_image:
            yield {"type": "image", "content": returned_image}

    except Exception as e:
        logger.error(
            f"generate_storyboard_image: Error generating storyboard image: {e}"
        )
        yield {"type": "error", "content": str(e)}
