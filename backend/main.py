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
        "Be sure to probe for words to avoid and whether or not the storyboard should contain people or just objects."
        "When enough details are gathered, you MUST call the `generate_storyboard` function with a list of steps, each containing a step_title, description, and image_prompt. "
        "When asked what day it is, use the `get_current_time_and_date` function to get the current date and time. "
    )

    def generate_storyboard(steps: list[StoryboardStep]) -> str:
        """Call this function when you have gathered enough details from the user to generate the storyboard. Pass the generated steps as arguments.

        Args:
            steps: A list of StoryboardStep objects, each MUST contain a
             - 'step_title'
             - 'description'
             - 'image_prompt'.
        The class definition is:
        class StoryboardStep(BaseModel):
            step_title: str
            description: str
            image_prompt: str

        Returns:
            A JSON string with "result": true if all steps are valid,
            or "result": false with "errors" describing what's wrong so you can retry.
        """
        required_fields = {"step_title", "description", "image_prompt"}
        errors = []

        for i, step in enumerate(steps):
            # Handle step as dict or Pydantic model
            step_data = (
                step
                if isinstance(step, dict)
                else (step.model_dump() if hasattr(step, "model_dump") else dict(step))
            )
            missing = required_fields - set(step_data.keys())
            empty = {
                f
                for f in required_fields
                if f in step_data and not str(step_data[f]).strip()
            }

            if missing:
                # Check for common field name mistakes
                if "step_title" in missing and "title" in step_data:
                    errors.append(
                        f"Step {i+1}: used 'title' instead of 'step_title'. Please use 'step_title' as the field name."
                    )
                    missing = missing - {"step_title"}
                if missing:
                    errors.append(
                        f"Step {i+1}: missing required fields: {', '.join(sorted(missing))}"
                    )
            if empty:
                errors.append(
                    f"Step {i+1}: empty required fields: {', '.join(sorted(empty))}"
                )

        if errors:
            logger.info(f"generate_storyboard validation FAILED: {errors}")
            return json.dumps({"result": False, "errors": errors})

        logger.info(f"generate_storyboard validation PASSED with {len(steps)} steps")
        return json.dumps({"result": True, "steps": steps})

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
                                for fc in response.tool_call.function_calls or []:
                                    logger.info(
                                        f"DEBUG: Tool call for function {fc.name} with args {fc.args}"
                                    )
                                    if fc.name == "generate_storyboard" and fc.args:
                                        # Normalize steps: ensure each is a proper dict
                                        raw_steps = fc.args.get("steps", [])
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

                                        # Validate steps using the function
                                        validation_result_str = generate_storyboard(
                                            normalized_steps
                                        )
                                        validation_result = json.loads(
                                            validation_result_str
                                        )

                                        # Send the validation result back to Gemini
                                        function_response = types.FunctionResponse(
                                            id=fc.id,
                                            name=fc.name,
                                            response=validation_result,
                                        )
                                        function_responses.append(function_response)

                                        if validation_result.get("result") is True:
                                            logger.info(
                                                f"DEBUG: Validation passed, sending {len(normalized_steps)} steps to frontend"
                                            )
                                            storyboard_data = {
                                                "type": "storyboard_steps",
                                                "payload": normalized_steps,
                                            }
                                            loop = asyncio.get_event_loop()
                                            loop.create_task(
                                                websocket.send_json(storyboard_data)
                                            )
                                        else:
                                            logger.info(
                                                f"DEBUG: Validation failed, asking Gemini to retry: {validation_result.get('errors')}"
                                            )
                                    else:
                                        # For other tool calls (e.g. get_current_time_and_date), use simple ok response
                                        function_response = types.FunctionResponse(
                                            id=fc.id,
                                            name=fc.name,
                                            response={"result": "ok"},
                                        )
                                        function_responses.append(function_response)

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
