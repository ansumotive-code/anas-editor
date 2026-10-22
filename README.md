# ANAS EDITOR v2

Audio-first video studio that runs fully in the browser (no backend needed).

## Features
- Person image: Left / Right / Free (drag anywhere), size slider, flip, rounded card.
- Captions: auto word-by-word from audio (Whisper in browser via transformers.js), or paste a script, or import SRT.
- Premium caption styles: color combos (white+yellow/red/green/cyan/pink/orange/purple), 6 looks, 10 animations. Drag the caption anywhere.
- Audio waves: 5 simple + 5 premium animated templates driven by the real audio. Drag anywhere, set color/size.
- Backgrounds: Pixabay API key -> search free videos/photos (nature, ocean, ...), build a playlist, or upload your own.
- Export: records canvas + audio to MP4 (if browser supports) or WebM.

## Run
`python -m http.server 8000` then open http://localhost:8000 (Chrome or Edge recommended).

## Notes
- Get a free Pixabay key at https://pixabay.com/api/docs/. It is stored only in your browser's localStorage (optional). Never commit it to a public repo.
- First caption generation downloads the Whisper model (~40-80 MB) from the internet; later runs use the browser cache.
- Export is real-time (a 60s audio takes 60s). Keep the tab visible.
- If a Pixabay clip is blank in export (CORS), download it and add it with "+ Apni video".
- For perfect-quality MP4 conversion, run the WebM through FFmpeg: `ffmpeg -i in.webm out.mp4`.
