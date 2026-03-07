"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import Link from "next/link";

/* ── Types ────────────────────────────────────────────────────────── */
type GameMode    = "hvh" | "hvai";
type Difficulty  = "easy" | "medium" | "hard";
type PlayerColor = "white" | "black";
type StatusType  = "normal" | "check" | "checkmate" | "draw" | "thinking";

/* ── Constants ────────────────────────────────────────────────────── */
const DEPTH: Record<Difficulty, number> = { easy: 1, medium: 5, hard: 14 };

const DIFF_INFO: Record<Difficulty, { label: string; emoji: string; desc: string; active: string; ring: string }> = {
  easy:   { label: "Easy",   emoji: "🌱", desc: "Beginner friendly",      active: "bg-emerald-500 text-white border-emerald-400",       ring: "shadow-emerald-500/30" },
  medium: { label: "Medium", emoji: "⚡", desc: "Intermediate challenge", active: "bg-amber-500   text-white border-amber-400",          ring: "shadow-amber-500/30"   },
  hard:   { label: "Hard",   emoji: "💀", desc: "Full Stockfish 16 power", active: "bg-red-600     text-white border-red-500",            ring: "shadow-red-600/30"     },
};

const PIECES: Record<string, string> = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛" };

/* ── Component ────────────────────────────────────────────────────── */
export default function GameClient() {
  const params = useSearchParams();
  const mode   = (params.get("mode") as GameMode) || "hvh";

  /* state */
  const [game,          setGame]          = useState(() => new Chess());
  const [fen,           setFen]           = useState<string>("start");
  const [status,        setStatus]        = useState("");
  const [statusType,    setStatusType]    = useState<StatusType>("normal");
  const [difficulty,    setDifficulty]    = useState<Difficulty>("medium");
  const [playerColor,   setPlayerColor]   = useState<PlayerColor>("white");
  const [gameStarted,   setGameStarted]   = useState(false);
  const [isThinking,    setIsThinking]    = useState(false);
  const [moveHistory,   setMoveHistory]   = useState<string[]>([]);
  const [capWhite,      setCapWhite]      = useState<string[]>([]);
  const [capBlack,      setCapBlack]      = useState<string[]>([]);
  const [boardWidth,    setBoardWidth]    = useState(360);
  const [lastMove,      setLastMove]      = useState<{ from: string; to: string } | null>(null);
  const [historyOpen,   setHistoryOpen]   = useState(false);
  const [showOverlay,   setShowOverlay]   = useState(false);

  /* refs */
  const sfRef      = useRef<Worker | null>(null);
  const gameRef    = useRef(game);
  const historyRef = useRef<HTMLDivElement>(null);

  gameRef.current = game;

  /* ── Board width (responsive) ─────────────────────────────────── */
  useEffect(() => {
    const calc = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let size: number;
      if (vw >= 1024) {
        // desktop: board + side panel side-by-side; leave 340px for panel + gaps
        size = Math.min(vw - 380, vh - 100, 680);
      } else if (vw >= 640) {
        // tablet
        size = Math.min(vw - 48, vh - 280, 560);
      } else {
        // mobile: full-width board, minus small padding, leave room for bars
        size = Math.min(vw - 16, vh - 230);
      }
      setBoardWidth(Math.max(size, 260));
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  /* ── Stockfish ────────────────────────────────────────────────── */
  useEffect(() => {
    if (mode !== "hvai") return;
    try {
      const w = new Worker("/stockfish/stockfish-nnue-16-single.js");
      w.postMessage("uci");
      w.postMessage("setoption name Use NNUE value false");
      w.postMessage("isready");
      sfRef.current = w;
    } catch (e) {
      console.warn("Stockfish unavailable, using random AI", e);
    }
    return () => { sfRef.current?.terminate(); };
  }, [mode]);

  /* ── Helpers ──────────────────────────────────────────────────── */
  const computeStatus = useCallback((g: Chess): [string, StatusType] => {
    if (g.isCheckmate()) {
      const w = g.turn() === "w" ? "Black" : "White";
      return [`${w} wins by checkmate`, "checkmate"];
    }
    if (g.isDraw()) {
      if (g.isStalemate())           return ["Draw — stalemate",            "draw"];
      if (g.isThreefoldRepetition()) return ["Draw — threefold repetition", "draw"];
      if (g.isInsufficientMaterial())return ["Draw — insufficient material","draw"];
      return ["Draw — 50-move rule", "draw"];
    }
    if (g.isCheck()) return [`${g.turn() === "w" ? "White" : "Black"} is in check!`, "check"];
    return [`${g.turn() === "w" ? "White" : "Black"}'s turn`, "normal"];
  }, []);

  const computeCaptured = useCallback((g: Chess) => {
    const start: Record<string, number> = { p:8, n:2, b:2, r:2, q:1 };
    const rem:   Record<string, number> = {};
    g.board().flat().forEach(sq => {
      if (sq) rem[sq.color + sq.type] = (rem[sq.color + sq.type] || 0) + 1;
    });
    const cW: string[] = [], cB: string[] = [];
    Object.entries(start).forEach(([t, n]) => {
      for (let i = (rem["w"+t]||0); i < n; i++) cB.push(PIECES[t]);
      for (let i = (rem["b"+t]||0); i < n; i++) cW.push(PIECES[t]);
    });
    setCapWhite(cW);
    setCapBlack(cB);
  }, []);

  const syncGame = useCallback((g: Chess) => {
    setFen(g.fen());
    const [msg, type] = computeStatus(g);
    setStatus(msg);
    setStatusType(type);
    setMoveHistory(g.history());
    computeCaptured(g);
    if (g.isGameOver()) setTimeout(() => setShowOverlay(true), 600);
    setTimeout(() => {
      if (historyRef.current)
        historyRef.current.scrollTop = historyRef.current.scrollHeight;
    }, 50);
  }, [computeStatus, computeCaptured]);

  /* ── AI move ──────────────────────────────────────────────────── */
  const makeAIMove = useCallback(() => {
    const g = gameRef.current;
    if (g.isGameOver()) return;
    setIsThinking(true);

    if (!sfRef.current) {
      // random fallback
      setTimeout(() => {
        const moves = g.moves();
        if (!moves.length) { setIsThinking(false); return; }
        const ng = new Chess(g.fen());
        ng.move(moves[Math.floor(Math.random() * moves.length)]);
        setGame(ng); gameRef.current = ng; syncGame(ng); setIsThinking(false);
      }, 500);
      return;
    }

    const sf = sfRef.current;
    const depth = DEPTH[difficulty];
    const handler = (e: MessageEvent) => {
      if (typeof e.data !== "string" || !e.data.startsWith("bestmove")) return;
      sf.removeEventListener("message", handler);
      const bm = e.data.split(" ")[1];
      if (!bm || bm === "(none)") { setIsThinking(false); return; }
      const ng = new Chess(g.fen());
      try {
        ng.move({ from: bm.slice(0,2), to: bm.slice(2,4), promotion: bm[4] ?? undefined });
        setLastMove({ from: bm.slice(0,2), to: bm.slice(2,4) });
        setGame(ng); gameRef.current = ng; syncGame(ng);
      } catch {
        const moves = ng.moves();
        if (moves.length) { ng.move(moves[Math.floor(Math.random() * moves.length)]); setGame(ng); gameRef.current = ng; syncGame(ng); }
      }
      setIsThinking(false);
    };
    sf.addEventListener("message", handler);
    sf.postMessage(`position fen ${g.fen()}`);
    sf.postMessage(`go depth ${depth}`);
  }, [difficulty, syncGame]);

  /* ── Start / Reset ────────────────────────────────────────────── */
  const startGame = useCallback(() => {
    const ng = new Chess();
    gameRef.current = ng;
    setGame(ng); setFen("start"); setMoveHistory([]); setCapWhite([]); setCapBlack([]);
    setLastMove(null); setIsThinking(false); setGameStarted(true); setShowOverlay(false);
    const [msg, type] = computeStatus(ng);
    setStatus(msg); setStatusType(type);
    if (mode === "hvai" && playerColor === "black") setTimeout(() => makeAIMove(), 400);
  }, [computeStatus, makeAIMove, mode, playerColor]);

  const resetToMenu = () => {
    setGameStarted(false); setShowOverlay(false);
    const ng = new Chess();
    setGame(ng); gameRef.current = ng;
    setFen("start"); setMoveHistory([]); setCapWhite([]); setCapBlack([]);
    setLastMove(null); setIsThinking(false); setStatus(""); setStatusType("normal");
  };

  /* ── Piece drop ───────────────────────────────────────────────── */
  function onDrop(src: string, tgt: string, piece: string) {
    const g = gameRef.current;
    if (g.isGameOver() || isThinking) return false;
    if (mode === "hvai") {
      if (playerColor === "white" && g.turn() !== "w") return false;
      if (playerColor === "black" && g.turn() !== "b") return false;
    }
    const promo =
      piece[1]?.toLowerCase() === "p" &&
      ((piece[0] === "w" && tgt[1] === "8") || (piece[0] === "b" && tgt[1] === "1"));
    try {
      const ng = new Chess(g.fen());
      const mv = ng.move({ from: src, to: tgt, promotion: promo ? "q" : undefined });
      if (!mv) return false;
      setLastMove({ from: src, to: tgt });
      setGame(ng); gameRef.current = ng; syncGame(ng);
      if (mode === "hvai" && !ng.isGameOver()) setTimeout(() => makeAIMove(), 250);
      return true;
    } catch { return false; }
  }

  /* ── Derived ──────────────────────────────────────────────────── */
  const orientation  = mode === "hvai" && playerColor === "black" ? "black" : "white";
  const isOver       = game.isGameOver();
  const activeTurn   = game.turn();

  const topPlayer    = orientation === "white"
    ? { symbol: "♚", label: mode==="hvai" ? "Stockfish AI" : "Black",  captured: capBlack, color: "b" }
    : { symbol: "♔", label: mode==="hvai" ? "Stockfish AI" : "White",  captured: capWhite, color: "w" };
  const bottomPlayer = orientation === "white"
    ? { symbol: "♔", label: mode==="hvai" ? "You"          : "White",  captured: capWhite, color: "w" }
    : { symbol: "♚", label: mode==="hvai" ? "You"          : "Black",  captured: capBlack, color: "b" };

  const sqStyles: Record<string, React.CSSProperties> = {};
  if (lastMove) {
    sqStyles[lastMove.from] = { backgroundColor: "rgba(252,211,77,0.3)" };
    sqStyles[lastMove.to]   = { backgroundColor: "rgba(252,211,77,0.5)" };
  }

  const statusStyle: Record<StatusType, string> = {
    normal:    "bg-[#111827] border-white/8   text-slate-300",
    check:     "bg-red-950/60  border-red-500/30  text-red-300",
    checkmate: "bg-amber-950/60 border-amber-400/30 text-amber-300",
    draw:      "bg-slate-800/60 border-white/10   text-slate-400",
    thinking:  "bg-violet-950/60 border-violet-500/20 text-violet-300",
  };

  /* ═══════════════════════════════════════════════════════════════
     SETUP SCREEN
  ═══════════════════════════════════════════════════════════════ */
  if (!gameStarted) {
    const isAI = mode === "hvai";
    return (
      <main className="min-h-screen flex flex-col bg-[#080c14] relative overflow-hidden">

        {/* ambient */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full bg-violet-600/8 blur-[100px]" />
        </div>

        <div className="relative flex-1 flex flex-col items-center justify-center px-4 py-8">
          <div className="w-full max-w-sm animate-scale-in">

            {/* Back */}
            <Link href="/" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-300 text-sm mb-8 transition-colors group">
              <span className="group-hover:-translate-x-0.5 transition-transform">←</span> Back to menu
            </Link>

            {/* Header */}
            <div className="mb-8">
              <div className="text-4xl mb-3 select-none">{isAI ? "🤖" : "👥"}</div>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-1">
                {isAI ? "Human vs AI" : "Human vs Human"}
              </h2>
              <p className="text-slate-500 text-sm">Configure your game</p>
            </div>

            {isAI && (
              <>
                {/* Difficulty */}
                <div className="mb-6">
                  <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-3">
                    Difficulty
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(["easy","medium","hard"] as Difficulty[]).map(d => (
                      <button
                        key={d}
                        onClick={() => setDifficulty(d)}
                        className={`relative py-3 rounded-xl text-sm font-semibold border transition-all duration-200 shadow-lg ${
                          difficulty === d
                            ? DIFF_INFO[d].active + " " + DIFF_INFO[d].ring
                            : "bg-white/[0.04] border-white/8 text-slate-400 hover:bg-white/[0.07] hover:text-slate-200"
                        }`}
                      >
                        <span className="block text-base mb-0.5">{DIFF_INFO[d].emoji}</span>
                        {DIFF_INFO[d].label}
                      </button>
                    ))}
                  </div>
                  <p className="text-slate-600 text-xs mt-2">{DIFF_INFO[difficulty].desc}</p>
                </div>

                {/* Color */}
                <div className="mb-8">
                  <label className="block text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-3">
                    Play as
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["white","black"] as PlayerColor[]).map(c => (
                      <button
                        key={c}
                        onClick={() => setPlayerColor(c)}
                        className={`py-3.5 rounded-xl font-semibold text-sm border flex items-center justify-center gap-2 transition-all duration-200 ${
                          playerColor === c
                            ? "bg-white border-transparent text-slate-900 shadow-lg shadow-white/10"
                            : "bg-white/[0.04] border-white/8 text-slate-400 hover:bg-white/[0.07] hover:text-white"
                        }`}
                      >
                        <span className="text-lg">{c === "white" ? "♔" : "♚"}</span>
                        {c.charAt(0).toUpperCase() + c.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {!isAI && <div className="mb-10" />}

            <button
              onClick={startGame}
              className={`w-full py-4 rounded-2xl font-bold text-base text-white shadow-xl transition-all active:scale-[0.98] ${
                isAI
                  ? "shimmer-btn shadow-violet-900/30"
                  : "shimmer-btn-green shadow-emerald-900/30"
              }`}
            >
              Start Game →
            </button>
          </div>
        </div>
      </main>
    );
  }

  /* ═══════════════════════════════════════════════════════════════
     GAME SCREEN
  ═══════════════════════════════════════════════════════════════ */
  const modeLabel = mode === "hvh" ? "Human vs Human" : `AI · ${DIFF_INFO[difficulty].label}`;

  return (
    <main className="min-h-screen bg-[#080c14] flex flex-col">

      {/* ── Top nav bar ─────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center justify-between px-3 sm:px-5 h-12 sm:h-14 border-b border-white/5 bg-[#080c14]/90 backdrop-blur-sm sticky top-0 z-20">
        <button
          onClick={resetToMenu}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-200 text-sm transition-colors group min-w-[60px]"
        >
          <span className="group-hover:-translate-x-0.5 transition-transform">←</span>
          <span className="hidden sm:inline">Menu</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="text-slate-600 text-sm select-none hidden sm:inline">{mode === "hvh" ? "👥" : "🤖"}</span>
          <span className="text-xs sm:text-sm text-slate-400 font-medium">{modeLabel}</span>
        </div>

        <button
          onClick={startGame}
          className="text-slate-500 hover:text-slate-200 text-xs sm:text-sm transition-colors min-w-[60px] text-right"
        >
          Restart
        </button>
      </header>

      {/* ── Main content ────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row items-center lg:items-start justify-center gap-3 sm:gap-5 px-2 sm:px-4 py-3 sm:py-5 min-h-0">

        {/* ── Board column ──────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-2 w-full lg:w-auto">

          {/* Top player bar */}
          <PlayerBar
            symbol={topPlayer.symbol}
            name={topPlayer.label}
            captured={topPlayer.captured}
            isActive={!isThinking && !isOver && activeTurn === topPlayer.color}
            isThinking={isThinking && mode === "hvai" && topPlayer.label === "Stockfish AI"}
            width={boardWidth}
          />

          {/* Board */}
          <div
            className="rounded-xl overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.8)] ring-1 ring-white/8"
            style={{ width: boardWidth }}
          >
            <Chessboard
              id="chess"
              position={fen}
              onPieceDrop={onDrop}
              boardWidth={boardWidth}
              boardOrientation={orientation}
              customSquareStyles={sqStyles}
              customBoardStyle={{ borderRadius: 0, boxShadow: "none" }}
              customDarkSquareStyle={{ backgroundColor: "#4a7c59" }}
              customLightSquareStyle={{ backgroundColor: "#eedcb1" }}
              areArrowsAllowed
            />
          </div>

          {/* Bottom player bar */}
          <PlayerBar
            symbol={bottomPlayer.symbol}
            name={bottomPlayer.label}
            captured={bottomPlayer.captured}
            isActive={!isThinking && !isOver && activeTurn === bottomPlayer.color}
            isThinking={false}
            width={boardWidth}
          />

          {/* Mobile: status + history toggle below board */}
          <div className="lg:hidden w-full flex flex-col gap-2" style={{ maxWidth: boardWidth }}>
            <StatusBadge type={isThinking ? "thinking" : statusType} text={status} isThinking={isThinking} style={statusStyle} />

            {/* History toggle */}
            <button
              onClick={() => setHistoryOpen(o => !o)}
              className="flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/8 text-slate-400 text-xs font-medium transition-colors hover:text-slate-200 hover:bg-white/[0.06]"
            >
              <span>Move History</span>
              <span className="flex items-center gap-2">
                <span className="text-slate-600 tabular-nums">{moveHistory.length}</span>
                <span className="transition-transform duration-200" style={{ transform: historyOpen ? "rotate(180deg)" : "rotate(0)" }}>▾</span>
              </span>
            </button>

            {historyOpen && (
              <div className="rounded-xl bg-[#0f1623] border border-white/8 overflow-hidden animate-fade-in">
                <MoveList moves={moveHistory} ref={historyRef} />
              </div>
            )}

            {/* Mobile action buttons */}
            <div className="flex gap-2 pb-2">
              <button onClick={resetToMenu} className="flex-1 py-3 rounded-xl bg-white/[0.05] border border-white/8 text-slate-300 text-sm font-medium transition-colors hover:bg-white/10 active:scale-[0.97]">
                New Game
              </button>
              {isOver && (
                <button onClick={startGame} className="flex-1 py-3 rounded-xl shimmer-btn-green text-white text-sm font-bold shadow-lg shadow-emerald-900/20 active:scale-[0.97]">
                  Play Again
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── Side panel (desktop only) ──────────────────────────── */}
        <aside className="hidden lg:flex flex-col gap-3 w-72 xl:w-80 shrink-0 pt-0">
          <StatusBadge type={isThinking ? "thinking" : statusType} text={status} isThinking={isThinking} style={statusStyle} />

          {/* Move history */}
          <div className="flex-1 flex flex-col bg-[#0f1623] border border-white/8 rounded-2xl overflow-hidden min-h-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Move History</span>
              <span className="text-xs text-slate-600 tabular-nums">{moveHistory.length} moves</span>
            </div>
            <MoveList moves={moveHistory} ref={historyRef} className="max-h-[400px] xl:max-h-[520px]" />
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            <button onClick={resetToMenu} className="flex-1 py-3 rounded-xl bg-white/[0.05] border border-white/8 text-slate-300 text-sm font-medium transition-colors hover:bg-white/[0.08] hover:text-white active:scale-[0.97]">
              New Game
            </button>
            {isOver && (
              <button onClick={startGame} className="flex-1 py-3 rounded-xl shimmer-btn-green text-white text-sm font-bold shadow-lg shadow-emerald-900/20 active:scale-[0.97]">
                Play Again
              </button>
            )}
          </div>
        </aside>
      </div>

      {/* ── Game over overlay ──────────────────────────────────────── */}
      {showOverlay && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowOverlay(false)}>
          <div
            className="w-full max-w-sm bg-[#111827] border border-white/10 rounded-3xl p-7 text-center shadow-2xl animate-scale-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-5xl mb-4 select-none">
              {statusType === "checkmate" ? "🏆" : statusType === "draw" ? "🤝" : "🎲"}
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              {statusType === "checkmate" ? "Checkmate!" : statusType === "draw" ? "It's a Draw" : "Game Over"}
            </h2>
            <p className="text-slate-400 text-sm mb-7">{status}</p>
            <div className="flex flex-col gap-2">
              <button onClick={startGame} className="w-full py-3.5 rounded-2xl shimmer-btn-green text-white font-bold text-base shadow-lg shadow-emerald-900/20 active:scale-[0.97]">
                Play Again
              </button>
              <button onClick={resetToMenu} className="w-full py-3 rounded-2xl text-slate-400 hover:text-white text-sm transition-colors">
                Back to Menu
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ── Sub-components ──────────────────────────────────────────────── */

function PlayerBar({
  symbol, name, captured, isActive, isThinking, width,
}: {
  symbol: string; name: string; captured: string[]; isActive: boolean; isThinking: boolean; width: number;
}) {
  return (
    <div
      className={`relative flex items-center justify-between rounded-xl px-3 sm:px-4 py-2.5 border transition-all duration-300 ${
        isActive
          ? "bg-white/[0.07] border-white/12"
          : "bg-white/[0.03] border-white/6"
      }`}
      style={{ width }}
    >
      {/* Active indicator */}
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-px w-0.5 h-6 rounded-full bg-emerald-400" />
      )}

      <div className="flex items-center gap-2.5 min-w-0">
        <div className={`relative flex items-center justify-center w-8 h-8 rounded-lg text-lg shrink-0 transition-all duration-300 ${
          isActive ? "bg-white/10" : "bg-white/[0.04]"
        }`}>
          {symbol}
          {isActive && !isThinking && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-emerald-400 rounded-full ring-2 ring-[#080c14]" />
          )}
        </div>
        <span className={`text-sm font-semibold truncate transition-colors duration-300 ${isActive ? "text-white" : "text-slate-400"}`}>
          {name}
        </span>
        {isThinking && (
          <span className="flex gap-0.5 items-center">
            {[0,1,2].map(i => <span key={i} className="dot w-1 h-1 bg-violet-400 rounded-full inline-block" />)}
          </span>
        )}
      </div>

      {/* Captured pieces */}
      <div className="flex gap-px flex-wrap justify-end max-w-[55%]">
        {captured.map((p, i) => (
          <span key={i} className="text-slate-500 text-xs leading-none">{p}</span>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({
  type, text, isThinking, style,
}: {
  type: StatusType; text: string; isThinking: boolean; style: Record<StatusType, string>;
}) {
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm font-semibold text-center transition-all duration-300 ${style[type]}`}>
      {isThinking ? (
        <span className="flex items-center justify-center gap-2.5">
          <span className="text-violet-400">Stockfish is thinking</span>
          <span className="flex gap-1">
            {[0,1,2].map(i => <span key={i} className="dot w-1.5 h-1.5 bg-violet-400 rounded-full inline-block" />)}
          </span>
        </span>
      ) : (
        text || "White's turn"
      )}
    </div>
  );
}

import { forwardRef } from "react";
const MoveList = forwardRef<HTMLDivElement, { moves: string[]; className?: string }>(
  ({ moves, className = "" }, ref) => (
    <div ref={ref} className={`overflow-y-auto p-3 sm:p-4 ${className}`}>
      {moves.length === 0 ? (
        <p className="text-slate-600 text-xs text-center py-6 select-none">No moves yet</p>
      ) : (
        <div className="grid grid-cols-[24px_1fr_1fr] gap-x-2 gap-y-0.5 text-sm">
          {Array.from({ length: Math.ceil(moves.length / 2) }, (_, i) => (
            <>
              <span key={`n${i}`} className="text-slate-700 text-[11px] pt-1 tabular-nums">{i+1}.</span>
              <span key={`w${i}`} className={`font-mono text-xs px-1.5 py-1 rounded transition-colors ${
                moves.length - 1 === i*2 ? "bg-white/10 text-white font-bold" : "text-slate-300"
              }`}>
                {moves[i*2]}
              </span>
              <span key={`b${i}`} className={`font-mono text-xs px-1.5 py-1 rounded transition-colors ${
                moves.length - 1 === i*2+1 ? "bg-white/10 text-white font-bold" : "text-slate-500"
              }`}>
                {moves[i*2+1] || ""}
              </span>
            </>
          ))}
        </div>
      )}
    </div>
  )
);
MoveList.displayName = "MoveList";
