## Troubleshooting: Front end env setting for the backend URL ##
Solution for making the backend API URL configurable for deployment into frontend/backend cloudrun containers:

1. __`frontend/src/config.ts`__ — Central config that reads `window.__ENV__` with localhost fallback
2. __`frontend/config.js.template`__ — Template with `${API_BASE_URL}` placeholder
3. __`frontend/entrypoint.sh`__ — Runs via `/docker-entrypoint.d/` to generate `config.js` at container startup
4. __`frontend/nginx.conf.template`__ — No-cache headers for `config.js`
5. __`frontend/vite.config.ts`__ — PWA service worker exclusions for `config.js` (this was the tricky one!)
6. __Updated App.tsx, LiveChat.tsx, StoryboardView.tsx__ — Use `API_BASE_URL`/`WS_BASE_URL` from config

The PWA service worker intercepting `/config.js` and serving the cached `index.html` was the sneaky root cause. For future reference — any runtime-generated files need to be excluded from the service worker's navigation fallback and caching strategies.


## Gemini Live API function calling: backend/frontend coordination
Exposing functions to the Gemini live API that should interface to a front end requires a bit of trickery. 

Gemini will happily call the function, but you must intercept it if you'd like the call to influence the front end. We do this in this project to have Gemini generate a storyboard, present it to the user and have a conversation about revisions. Without a synch the backend would create and never show it to the user, or show revisions. 

Compounding this challenge is the occasional malformed function call request, or a call that does not include required fields. ( You can see our solution to this portion of the challenge in the main.py ```receive_from_gemini``` function. )

As for the frontend coordination, after performing a series of validation steps, if the function call is valid we send the call up to the frontend via the websocket connection: 


```python
    if validation_result.get("result") is True:
        # send the steps to the frontend to display, and ask for user feedback on them
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
        logger.error(
            f"ERROR: Validation failed, asking Gemini to retry: {validation_result.get('errors')}"
        )
```
Where the frontend captures it as a signal that it's time to move on to revisions. 


## Audio setup
We purposefully used a React PWA to be able to use native javascript audio capabilities. There are some niuances for the Gemini Live api. 

```javascript
            const audioConstraints = {
                sampleRate: 16000, // Gemini expects 16kHz audio
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            };
            const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
            streamRef.current = stream;

            // Use Gemini's expected sample rate of 16kHz for better compatibility and performance
            const audioContext = new window.AudioContext({
                latencyHint: "interactive",
                sampleRate: 16000
            });
```
Gemini expects 16kHz audio while browsers will usually default to higher resolution like 44.1 or even 48kHz. A mismatch can cause unexpected glitching if the user enables/disables the microphone while Gemini is speaking, so it's best to set the resolution for capture/playback to match. 

However Gemini outputs at 24k. Important to consider this in the conversion from pcm16. 

```javascript
        // Gemini outputs at 24k
        const audioBuffer = audioContextRef.current.createBuffer(1, pcm16.length, 24000);
        const channelData = audioBuffer.getChannelData(0);

        for (let i = 0; i < pcm16.length; i++) {
            channelData[i] = pcm16[i] / 0x8000;
        }

        const source = audioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioContextRef.current.destination);
```


## API KEY vs Vertex/Project
There are significant differences between using the google-genai library with an API key from aistudio.google.com and using Vertex. 

Some parameters aren't allowed when using an API Key. In particular the image configuration has limits for person_generation and for the output mime type. 
```
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
```

A vertex enabled call to create an image via gemini 3 pro/nano bananna looks like this: 
```
2026-03-15 07:39:22,607 - INFO - HTTP Request: POST https://aiplatform.googleapis.com/v1beta1/projects/prj-something-or-other/locations/global/publishers/google/models/gemini-3-pro-image-preview:streamGenerateContent?alt=sse "HTTP/1.1 200 OK"
```

An api key call looks like this: 
```
2026-03-15 17:29:36,740 - INFO - HTTP Request: POST https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:streamGenerateContent?alt=sse "HTTP/1.1 200 OK"

```

Though it appears both can encounter 429: resource exhaustion errors it appears the API Key calls encounter this obstacle less frequently than calls that don't use an API Key and use vertex natively. I found better success by setting the HTTP retry options in either case. Calls were more resilient to encountering 429s and continuing to retry. 