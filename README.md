# ANAS EDITOR — starter project

A premium dark UI starter for an audio-first, still-image-based video editor.

## Current prototype
- Upload voiceover audio (MP3/WAV) and play/scrub it.
- Upload a presenter image and multiple scene images.
- Preview three layouts: presenter left, presenter right, or presenter in a corner.
- Six caption presets and five waveform presets, with adjustable colors/sizes.
- Image-to-image transitions in preview: smooth crossfade, fade + gentle zoom, or hard cut; adjustable duration (0.4s, 0.7s, 1.2s).
- Switch preview canvas between 16:9 and 9:16.

## Important current limitations
This is a front-end starter/prototype, not a finished production editor:
- It does not yet transcribe audio automatically.
- It does not yet generate AI images from speech.
- The export button is a placeholder; it does not create an MP4 yet.
- Uploaded images are manually selected in this version.

## Recommended next implementation steps
1. Add a Python FastAPI or Node backend for secure API calls.
2. Transcribe uploaded audio using a speech-to-text API (for example Gemini audio input or a dedicated transcription service) and retain word/segment timestamps.
3. Have a language model summarize transcript segments into image prompts.
4. Generate still images using an image-generation model. The preview supports fade/crossfade and gentle-zoom transitions; implement the same transition timing in FFmpeg for final export. Do not use Veo if the requirement is still images only; Veo is for video generation and is priced per generated video second.
5. Render the final video with FFmpeg: scene stills + slow pan/zoom + presenter overlay + timed captions + voiceover + waveform + optional music.
6. Return a downloadable MP4 and show job progress.

## Deployment
- GitHub can store the repository for free. GitHub Pages can host static frontend files, but it is not a secure backend and must not hold private API keys.
- For AI APIs, use a backend service and store API keys as server-side environment secrets.
- API usage may cost money even if hosting or AI Studio prototyping is free. Check each provider's current quotas/pricing before generating lots of images.
- Never paste a private API key into a public repo or frontend JavaScript.

## Run locally
Open `index.html` in a modern browser. For best results, run a simple local static server:
`python -m http.server 8000`
Then open `http://localhost:8000`.

## Project name
ANAS EDITOR
