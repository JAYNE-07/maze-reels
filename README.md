# Maze Reels Generator

Produces 9:16 Instagram reels promoting the [maze book](https://jayne-07.github.io/maze-generator/).
Each 8 s reel: themed maze appears, mascot walks the solution path, CTA card
slides up. Every reel uses a different shape (from the same 165-keyword
dictionary as the book) and a different brand palette.

**Live site:** https://jayne-07.github.io/maze-reels/

## Run locally

```sh
npm install
npm run dev
```

## How it works

- Uses the maze-book's keyword pool (`themes.ts`) so the reels stay on-theme.
- Pollinations.ai fetches the silhouette and the start/end cartoons per reel.
- Canvas renders 1080×1920 frames at 30 fps; `MediaRecorder` captures the
  stream to MP4 (or WebM where MP4 isn't supported).
- Each reel downloads automatically as a video file ready to upload to
  Instagram. Recording is real-time, so 10 reels ≈ 80 s plus AI fetch time.

## Note

Instagram prefers MP4. Recent Chrome/Edge/Safari on macOS produce MP4
directly; Firefox falls back to WebM (drag into CloudConvert or QuickTime
to convert).
