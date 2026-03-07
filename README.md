# Chess

A beautiful, fully-featured chess game built with Next.js 16. Play against a friend or challenge Stockfish 16 AI — no account required.

## Features

- **Human vs Human** — pass-and-play on the same device
- **Human vs AI** — powered by Stockfish 16 (WASM, runs in the browser)
  - Easy / Medium / Hard difficulty
  - Choose to play as White or Black
- Mobile-first responsive design — works great on phones and tablets
- Last-move highlighting, captured pieces, move history
- Game-over overlay with play again option
- Zero backend — fully static, deployable anywhere

## Tech Stack

| | |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Chess logic | chess.js |
| Board UI | react-chessboard |
| AI engine | Stockfish 16 WASM (single-threaded) |

## Getting Started

```bash
npm install   # also copies Stockfish files to /public
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

1. Push this repo to GitHub
2. Import the repo at [vercel.com/new](https://vercel.com/new)
3. Click **Deploy** — zero configuration needed

The `postinstall` and `build` scripts automatically copy Stockfish WASM files to the `public/` folder on every build.

## Project Structure

```
app/
  page.tsx          # Home / mode selector
  game/page.tsx     # Game route (Suspense wrapper)
  layout.tsx        # Root layout + metadata
  globals.css       # Tailwind + custom animations
  favicon.svg       # SVG favicon (chess queen)

components/
  GameClient.tsx    # Full game logic + UI (board, AI, history)

scripts/
  copy-stockfish.js # Copies Stockfish WASM to /public on install

public/
  stockfish/        # stockfish-nnue-16-single.js + .wasm (~600 KB)
```
