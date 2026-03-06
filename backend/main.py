import asyncio
import os
import json
from dotenv import load_dotenv
from google import genai
from google.genai import types
from storyboard import router as storyboard_router
from services import MODEL, LIVE_MODEL, ai_client, logger, get_current_time_and_date
from models import StoryboardRequest, StoryboardResponse, StoryboardStep
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI(title="Autism Event Storyboard API")

# Setup CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(storyboard_router)


@app.get("/")
def read_root():
    return {"message": "Welcome to the Autism Event Storyboard API"}


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.websocket("/ws/ideate")
async def websocket_ideate(websocket: WebSocket):
    await websocket.accept()

    system_instruction = (
        "You are an assistant helping a parent storyboard an upcoming event for an autistic child. "
        "Interactively ask about the event, what the child might find challenging, and gather necessary details. "
        "When enough details are gathered, you MUST call the `generate_storyboard` function with a list of steps, each containing a title, description, and image_prompt. "
        "When asked what day it is, use the `get_current_time_and_date` function to get the current date and time. "
    )

    def generate_storyboard(steps: list[StoryboardStep]) -> str:
        """Call this function when you have gathered enough details from the user to generate the storyboard. Pass the generated steps as arguments.

        Args:
            steps: A list of StoryboardStep objects, each must contain a 'title', 'description', and 'image_prompt'.
        The class definition is:
        class StoryboardStep(BaseModel):
            title: str
            description: str
            image_prompt: str

        """
        json_str = json.dumps({"steps": steps})
        # logger doesn't work in this function since it's called synchronously by the Gemini response generator
        logger.info(f"DEBUG: generate_storyboard called with {len(steps)} steps")
        # # Schedule the websocket send (doesn't work to do it directly in this function since it's called synchronously by the Gemini response generator, but we need to send the data asynchronously)
        # loop = asyncio.get_event_loop()
        # loop.create_task(websocket.send_text(f"```json\n{json_str}\n```"))
        return json_str

    # TODO: occasional malformed function call in logs, might need to declare it explicitly
    # fn_decl = types.FunctionDeclaration.from_callable(
    #     callable=generate_storyboard,
    #     client=ai_client,
    #     behavior=types.Behavior.NON_BLOCKING,
    # )

    config = types.LiveConnectConfig(
        response_modalities=[types.Modality.AUDIO],
        system_instruction=system_instruction,
        tools=[generate_storyboard, get_current_time_and_date],
    )

    try:
        async with ai_client.aio.live.connect(
            model=LIVE_MODEL, config=config
        ) as session:

            async def receive_from_client():
                try:
                    while True:
                        # We expect JSON indicating start/stop, or raw bytes for audio
                        message = await websocket.receive()
                        if "bytes" in message:
                            data = message["bytes"]
                            await session.send(
                                input={"data": data, "mime_type": "audio/pcm"},
                                end_of_turn=False,
                            )
                        elif "text" in message:
                            # Might be control messages or text input
                            text_data = message["text"]
                            logger.info(
                                f"DEBUG: Received text from client: {text_data}"
                            )
                            await session.send(input=text_data, end_of_turn=True)
                except WebSocketDisconnect:
                    pass
                except Exception as e:
                    logger.error(f"Error receiving from frontend: {e}")

            async def receive_from_gemini():
                try:
                    while True:
                        async for response in session.receive():
                            server_content = response.server_content
                            if server_content is not None:
                                # --- ADDED LOGS FOR DEBUGGING BARGE-IN ---
                                if getattr(server_content, "interrupted", False):
                                    logger.info(
                                        "DEBUG: Gemini response was INTERRUPTED by user audio (barge-in)"
                                    )
                                if getattr(server_content, "turn_complete", False):
                                    logger.info(
                                        f"DEBUG: Gemini response turn COMPLETE {server_content}"
                                    )
                                    # logger.info(
                                    #     f"DEBUG: Full response content: {response}"
                                    # )
                                # ---------------------------------------

                                model_turn = server_content.model_turn
                                if (
                                    model_turn is not None
                                    and model_turn.parts is not None
                                ):
                                    for part in model_turn.parts:
                                        # logger.info(
                                        #     f"DEBUG: Received part. text: {bool(part.text)}, inline_data: {bool(part.inline_data)}, function_call: {bool(part.function_call)}"
                                        # )
                                        if part.inline_data and part.inline_data.data:
                                            await websocket.send_bytes(
                                                part.inline_data.data
                                            )
                                        if part.text:
                                            logger.info(
                                                f"DEBUG: Text content: {part.text}"
                                            )
                                            await websocket.send_text(part.text)

                            if response.tool_call:
                                logger.info("TOOLS were called")
                                loop = asyncio.get_event_loop()
                                loop.create_task(
                                    websocket.send_text(
                                        f"TOOLS CALLED: {response.tool_call}"
                                    )
                                )
                                function_responses = []
                                for fc in response.tool_call.function_calls:
                                    function_response = types.FunctionResponse(
                                        id=fc.id,
                                        name=fc.name,
                                        response={
                                            "result": "ok"
                                        },  # simple, hard-coded function response
                                    )
                                    function_responses.append(function_response)
                                    logger.info(
                                        f"DEBUG: Tool call for function {fc.name} with args {fc.args}"
                                    )
                                    if fc.name == "generate_storyboard" and fc.args:
                                        # Normalize steps: ensure each is a proper dict
                                        raw_steps = fc.args["steps"]
                                        normalized_steps = []
                                        for s in raw_steps:
                                            if isinstance(s, str):
                                                if s.endswith(","):
                                                    s = s[:-1]
                                                normalized_steps.append(json.loads(s))
                                            elif isinstance(s, dict):
                                                normalized_steps.append(s)
                                            else:
                                                normalized_steps.append(dict(s))
                                        logger.info(
                                            f"DEBUG: Normalized {len(normalized_steps)} steps for storyboard"
                                        )
                                        storyboard_data = {
                                            "type": "storyboard_steps",
                                            "payload": normalized_steps,
                                        }
                                        # Use send_json to send the Python dict directly.
                                        # FastAPI will serialize it to JSON.
                                        loop = asyncio.get_event_loop()
                                        loop.create_task(
                                            websocket.send_json(storyboard_data)
                                        )

                                await session.send_tool_response(
                                    function_responses=function_responses
                                )
                        # If the generator exits but the connection should stay open, we loop back.
                        await asyncio.sleep(0.1)
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    logger.error(f"Error receiving from Gemini: {e}")

            client_task = asyncio.create_task(receive_from_client())
            gemini_task = asyncio.create_task(receive_from_gemini())

            done, pending = await asyncio.wait(
                [client_task, gemini_task], return_when=asyncio.FIRST_COMPLETED
            )

            for task in pending:
                task.cancel()

    except Exception as e:
        logger.error(f"Error connecting to Gemini: {e}")
        try:
            await websocket.close()
        except Exception:
            pass
