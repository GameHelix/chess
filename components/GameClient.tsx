"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import Link from "next/link";

/* ── Types ──────────────────────────────────────────────────── */
type GameMode    = "hvh" | "hvai";
type Difficulty  = "easy" | "medium" | "hard";
type PlayerColor = "white" | "black";
type StatusType  = "normal" | "check" | "checkmate" | "draw" | "resigned";

/* ── Constants ──────────────────────────────────────────────── */
const DEPTH: Record<Difficulty, number> = { easy: 1, medium: 5, hard: 14 };

const DIFF: Record<Difficulty, { label: string; emoji: string; desc: string; cls: string }> = {
  easy:   { label: "Easy",   emoji: "🌱", desc: "Beginner friendly",       cls: "bg-emerald-600 border-emerald-500 text-white" },
  medium: { label: "Medium", emoji: "⚡", desc: "Intermediate challenge",  cls: "bg-amber-500   border-amber-400   text-white" },
  hard:   { label: "Hard",   emoji: "💀", desc: "Full Stockfish 16 power", cls: "bg-red-600     border-red-500     text-white" },
};

const PIECES: Record<string, string> = { p:"♟", n:"♞", b:"♝", r:"♜", q:"♛" };

/* ── Main component ─────────────────────────────────────────── */
export default function GameClient() {
  const params = useSearchParams();
  const mode   = (params.get("mode") as GameMode) || "hvh";

  const [game,          setGame]          = useState(() => new Chess());
  const [fen,           setFen]           = useState<string>("start");
  const [status,        setStatus]        = useState("");
  const [statusType,    setStatusType]    = useState<StatusType>("normal");
  const [difficulty,    setDifficulty]    = useState<Difficulty>("medium");
  const [playerColor,   setPlayerColor]   = useState<PlayerColor>("white");
  const [started,       setStarted]       = useState(false);
  const [isThinking,    setIsThinking]    = useState(false);
  const [moves,         setMoves]         = useState<string[]>([]);
  const [capW,          setCapW]          = useState<string[]>([]);
  const [capB,          setCapB]          = useState<string[]>([]);
  const [boardPx,       setBoardPx]       = useState(360);
  const [lastMove,      setLastMove]      = useState<{from:string;to:string}|null>(null);
  const [overlay,       setOverlay]       = useState(false);
  const [resigned,      setResigned]      = useState(false);
  const [resignConfirm, setResignConfirm] = useState(false);
  const [histOpen,      setHistOpen]      = useState(false);

  const sfRef      = useRef<Worker|null>(null);
  const gameRef    = useRef(game);
  const histRef    = useRef<HTMLDivElement>(null);

  gameRef.current = game;
  const isOver = game.isGameOver() || resigned;

  /* ── Board size ──────────────────────────────────────────── */
  useEffect(() => {
    const calc = () => {
      const vw = window.innerWidth, vh = window.innerHeight;
      let px: number;
      if (vw >= 1024)      px = Math.min(vw - 340, vh - 80,  480);
      else if (vw >= 640)  px = Math.min(vw - 48,  vh - 220, 460);
      else                 px = Math.min(vw - 12,  vh - 185, 420);
      setBoardPx(Math.max(px, 260));
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);

  /* ── Stockfish ───────────────────────────────────────────── */
  useEffect(() => {
    if (mode !== "hvai") return;
    try {
      const w = new Worker("/stockfish/stockfish-nnue-16-single.js");
      w.postMessage("uci");
      w.postMessage("setoption name Use NNUE value false");
      w.postMessage("isready");
      sfRef.current = w;
    } catch (e) { console.warn("Stockfish unavailable", e); }
    return () => { sfRef.current?.terminate(); };
  }, [mode]);

  /* ── Status helpers ──────────────────────────────────────── */
  const calcStatus = useCallback((g: Chess): [string, StatusType] => {
    if (g.isCheckmate()) return [`${g.turn()==="w"?"Black":"White"} wins by checkmate`, "checkmate"];
    if (g.isDraw()) {
      if (g.isStalemate())            return ["Draw — stalemate",            "draw"];
      if (g.isThreefoldRepetition())  return ["Draw — threefold repetition", "draw"];
      if (g.isInsufficientMaterial()) return ["Draw — insufficient material","draw"];
      return ["Draw — 50-move rule", "draw"];
    }
    if (g.isCheck()) return [`${g.turn()==="w"?"White":"Black"} is in check!`, "check"];
    return [`${g.turn()==="w"?"White":"Black"}'s turn`, "normal"];
  }, []);

  const calcCaptured = useCallback((g: Chess) => {
    const start: Record<string,number> = {p:8,n:2,b:2,r:2,q:1};
    const rem:   Record<string,number> = {};
    g.board().flat().forEach(sq => { if (sq) rem[sq.color+sq.type] = (rem[sq.color+sq.type]||0)+1; });
    const cW: string[]=[], cB: string[]=[];
    Object.entries(start).forEach(([t,n]) => {
      for (let i=(rem["w"+t]||0); i<n; i++) cB.push(PIECES[t]);
      for (let i=(rem["b"+t]||0); i<n; i++) cW.push(PIECES[t]);
    });
    setCapW(cW); setCapB(cB);
  }, []);

  const syncGame = useCallback((g: Chess) => {
    setFen(g.fen());
    const [msg, type] = calcStatus(g);
    setStatus(msg); setStatusType(type);
    setMoves(g.history());
    calcCaptured(g);
    if (g.isGameOver()) setTimeout(() => setOverlay(true), 500);
    setTimeout(() => { if (histRef.current) histRef.current.scrollTop = histRef.current.scrollHeight; }, 50);
  }, [calcStatus, calcCaptured]);

  /* ── AI move ─────────────────────────────────────────────── */
  const makeAIMove = useCallback(() => {
    const g = gameRef.current;
    if (g.isGameOver() || resigned) return;
    setIsThinking(true);

    if (!sfRef.current) {
      setTimeout(() => {
        const ms = g.moves();
        if (!ms.length) { setIsThinking(false); return; }
        const ng = new Chess(g.fen());
        ng.move(ms[Math.floor(Math.random()*ms.length)]);
        setGame(ng); gameRef.current = ng; syncGame(ng); setIsThinking(false);
      }, 500);
      return;
    }

    const sf = sfRef.current;
    const handler = (e: MessageEvent) => {
      if (typeof e.data !== "string" || !e.data.startsWith("bestmove")) return;
      sf.removeEventListener("message", handler);
      const bm = e.data.split(" ")[1];
      if (!bm || bm === "(none)") { setIsThinking(false); return; }
      const ng = new Chess(g.fen());
      try {
        ng.move({ from: bm.slice(0,2), to: bm.slice(2,4), promotion: bm[4]??undefined });
        setLastMove({ from: bm.slice(0,2), to: bm.slice(2,4) });
        setGame(ng); gameRef.current = ng; syncGame(ng);
      } catch {
        const ms = ng.moves();
        if (ms.length) { ng.move(ms[Math.floor(Math.random()*ms.length)]); setGame(ng); gameRef.current=ng; syncGame(ng); }
      }
      setIsThinking(false);
    };
    sf.addEventListener("message", handler);
    sf.postMessage(`position fen ${g.fen()}`);
    sf.postMessage(`go depth ${DEPTH[difficulty]}`);
  }, [difficulty, syncGame, resigned]);

  /* ── Resign ──────────────────────────────────────────────── */
  const handleResign = useCallback(() => {
    if (!resignConfirm) { setResignConfirm(true); return; }
    // Determine who resigned
    const loser  = mode === "hvai" ? "You" : (game.turn()==="w" ? "White" : "Black");
    const winner = mode === "hvai" ? "Stockfish" : (game.turn()==="w" ? "Black" : "White");
    setStatus(`${loser} resigned — ${winner} wins`);
    setStatusType("resigned");
    setResigned(true);
    setResignConfirm(false);
    setTimeout(() => setOverlay(true), 300);
  }, [resignConfirm, game, mode]);

  // Cancel resign confirm on outside interaction
  useEffect(() => {
    if (!resignConfirm) return;
    const cancel = () => setResignConfirm(false);
    const t = setTimeout(cancel, 4000); // auto-cancel after 4s
    return () => clearTimeout(t);
  }, [resignConfirm]);

  /* ── Start / reset ───────────────────────────────────────── */
  const startGame = useCallback(() => {
    const ng = new Chess();
    gameRef.current = ng;
    setGame(ng); setFen("start"); setMoves([]); setCapW([]); setCapB([]);
    setLastMove(null); setIsThinking(false); setStarted(true); setOverlay(false);
    setResigned(false); setResignConfirm(false);
    const [msg, type] = calcStatus(ng);
    setStatus(msg); setStatusType(type);
    if (mode==="hvai" && playerColor==="black") setTimeout(() => makeAIMove(), 400);
  }, [calcStatus, makeAIMove, mode, playerColor]);

  const goMenu = () => {
    setStarted(false); setOverlay(false); setResigned(false); setResignConfirm(false);
    const ng = new Chess();
    setGame(ng); gameRef.current = ng;
    setFen("start"); setMoves([]); setCapW([]); setCapB([]);
    setLastMove(null); setIsThinking(false); setStatus(""); setStatusType("normal");
  };

  /* ── Drop handler ────────────────────────────────────────── */
  function onDrop(src: string, tgt: string, piece: string) {
    const g = gameRef.current;
    if (isOver || isThinking) return false;
    if (mode==="hvai") {
      if (playerColor==="white" && g.turn()!=="w") return false;
      if (playerColor==="black" && g.turn()!=="b") return false;
    }
    const promo = piece[1]?.toLowerCase()==="p" &&
      ((piece[0]==="w" && tgt[1]==="8") || (piece[0]==="b" && tgt[1]==="1"));
    try {
      const ng = new Chess(g.fen());
      if (!ng.move({from:src, to:tgt, promotion: promo?"q":undefined})) return false;
      setLastMove({from:src, to:tgt});
      setGame(ng); gameRef.current=ng; syncGame(ng);
      if (mode==="hvai" && !ng.isGameOver()) setTimeout(()=>makeAIMove(), 250);
      return true;
    } catch { return false; }
  }

  /* ── Derived values ──────────────────────────────────────── */
  const orient = mode==="hvai" && playerColor==="black" ? "black" : "white";
  const turn   = game.turn();

  const topP    = orient==="white"
    ? { sym:"♚", name: mode==="hvai"?"Stockfish AI":"Black", cap:capB, color:"b" }
    : { sym:"♔", name: mode==="hvai"?"Stockfish AI":"White", cap:capW, color:"w" };
  const botP    = orient==="white"
    ? { sym:"♔", name: mode==="hvai"?"You":"White", cap:capW, color:"w" }
    : { sym:"♚", name: mode==="hvai"?"You":"Black", cap:capB, color:"b" };

  const sqStyles: Record<string,React.CSSProperties> = {};
  if (lastMove) {
    sqStyles[lastMove.from] = { backgroundColor:"rgba(252,211,77,0.28)" };
    sqStyles[lastMove.to]   = { backgroundColor:"rgba(252,211,77,0.48)" };
  }

  const statusCls: Record<StatusType,string> = {
    normal:    "bg-white/[0.04] border-white/8   text-slate-300",
    check:     "bg-red-950/70   border-red-500/30  text-red-300",
    checkmate: "bg-amber-950/70 border-amber-500/30 text-amber-300",
    draw:      "bg-slate-800/60 border-white/8    text-slate-400",
    resigned:  "bg-amber-950/70 border-amber-500/30 text-amber-300",
  };

  /* ══════════════════════════════════════════════════════════
     SETUP SCREEN
  ══════════════════════════════════════════════════════════ */
  if (!started) {
    const isAI = mode === "hvai";
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-[#080c14] px-4 py-8 relative overflow-hidden">
        <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[400px] rounded-full bg-violet-600/8 blur-[80px]" />

        <div className="relative w-full max-w-xs animate-scale-in">
          <Link href="/" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-300 text-sm mb-7 transition-colors group">
            <span className="group-hover:-translate-x-0.5 transition-transform">←</span> Back
          </Link>

          <div className="mb-7">
            <div className="text-3xl mb-2 select-none">{isAI ? "🤖" : "👥"}</div>
            <h2 className="text-2xl font-bold text-white mb-0.5">
              {isAI ? "Human vs AI" : "Human vs Human"}
            </h2>
            <p className="text-slate-500 text-sm">Set up your game</p>
          </div>

          {isAI && (
            <>
              <div className="mb-5">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2.5">Difficulty</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["easy","medium","hard"] as Difficulty[]).map(d => (
                    <button key={d} onClick={() => setDifficulty(d)}
                      className={`py-2.5 rounded-xl text-xs font-semibold border transition-all ${
                        difficulty===d ? DIFF[d].cls : "bg-white/[0.04] border-white/8 text-slate-400 hover:bg-white/[0.07] hover:text-white"
                      }`}>
                      <span className="block text-sm mb-0.5">{DIFF[d].emoji}</span>
                      {DIFF[d].label}
                    </button>
                  ))}
                </div>
                <p className="text-slate-600 text-xs mt-1.5 pl-0.5">{DIFF[difficulty].desc}</p>
              </div>

              <div className="mb-7">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 mb-2.5">Play as</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {(["white","black"] as PlayerColor[]).map(c => (
                    <button key={c} onClick={() => setPlayerColor(c)}
                      className={`py-3 rounded-xl text-sm font-semibold border flex items-center justify-center gap-2 transition-all ${
                        playerColor===c
                          ? "bg-white border-transparent text-slate-900 shadow-md"
                          : "bg-white/[0.04] border-white/8 text-slate-400 hover:bg-white/[0.07] hover:text-white"
                      }`}>
                      <span>{c==="white"?"♔":"♚"}</span>
                      {c==="white"?"White":"Black"}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {!isAI && <div className="mb-8" />}

          <button onClick={startGame}
            className={`w-full py-3.5 rounded-xl font-bold text-sm text-white shadow-lg transition-all active:scale-[0.98] ${
              isAI ? "shimmer-btn shadow-violet-900/20" : "shimmer-btn-green shadow-emerald-900/20"
            }`}>
            Start Game →
          </button>
        </div>
      </main>
    );
  }

  /* ══════════════════════════════════════════════════════════
     GAME SCREEN
  ══════════════════════════════════════════════════════════ */
  const modeTag = mode==="hvh" ? "vs Human" : `vs AI · ${DIFF[difficulty].label}`;

  return (
    <main className="h-screen bg-[#080c14] flex flex-col overflow-hidden">

      {/* ── Nav ───────────────────────────────────────────── */}
      <header className="shrink-0 flex items-center gap-2 px-3 h-11 border-b border-white/5 bg-[#080c14]/95 backdrop-blur-sm z-10">
        <button onClick={goMenu}
          className="flex items-center gap-1 text-slate-500 hover:text-white text-sm transition-colors py-2 pr-2">
          ← <span className="hidden sm:inline text-xs">Menu</span>
        </button>

        <div className="flex-1 flex justify-center">
          <span className="text-xs text-slate-500 bg-white/[0.05] border border-white/8 rounded-full px-3 py-1 font-medium">
            {modeTag}
          </span>
        </div>

        <button onClick={startGame}
          className="text-slate-500 hover:text-white text-xs transition-colors py-2 pl-2">
          Restart
        </button>
      </header>

      {/* ── Body ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col lg:flex-row items-center lg:items-center justify-center gap-2 sm:gap-4 px-2 sm:px-4 py-2 sm:py-3 min-h-0 overflow-hidden">

        {/* Board column */}
        <div className="flex flex-col items-center gap-1.5 shrink-0">

          {/* Top player */}
          <PlayerBar sym={topP.sym} name={topP.name} cap={topP.cap} active={!isThinking&&!isOver&&turn===topP.color} thinking={isThinking && topP.name==="Stockfish AI"} width={boardPx} />

          {/* Board */}
          <div className="rounded-lg overflow-hidden ring-1 ring-white/10 shadow-[0_8px_40px_rgba(0,0,0,0.7)]" style={{width:boardPx}}>
            <Chessboard
              id="board"
              position={fen}
              onPieceDrop={onDrop}
              boardWidth={boardPx}
              boardOrientation={orient}
              customSquareStyles={sqStyles}
              customBoardStyle={{ borderRadius:0, boxShadow:"none" }}
              customDarkSquareStyle={{ backgroundColor:"#4a7c59" }}
              customLightSquareStyle={{ backgroundColor:"#eedcb1" }}
              areArrowsAllowed
            />
          </div>

          {/* Bottom player */}
          <PlayerBar sym={botP.sym} name={botP.name} cap={botP.cap} active={!isThinking&&!isOver&&turn===botP.color} thinking={false} width={boardPx} />

          {/* ── Mobile controls (below board) ── */}
          <div className="lg:hidden flex flex-col gap-1.5 w-full" style={{maxWidth:boardPx}}>

            {/* Status row */}
            <div className={`rounded-lg border px-3 py-2 text-xs font-semibold text-center transition-all ${isThinking ? "bg-violet-950/60 border-violet-500/20 text-violet-300" : statusCls[statusType]}`}>
              {isThinking
                ? <span className="flex items-center justify-center gap-2">Thinking <ThinkDots /></span>
                : status || "White's turn"
              }
            </div>

            {/* Action row */}
            <div className="flex gap-1.5">
              {/* History toggle */}
              <button onClick={()=>setHistOpen(o=>!o)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/8 text-slate-400 text-xs font-medium hover:text-white transition-colors flex-1">
                <span>📋</span> Moves ({moves.length})
                <span className="ml-auto" style={{transform:histOpen?"rotate(180deg)":"none", transition:"transform 0.2s"}}>▾</span>
              </button>

              {/* Resign */}
              {!isOver && (
                <button onClick={handleResign}
                  className={`px-3 py-2 rounded-lg border text-xs font-semibold transition-all flex items-center gap-1 ${
                    resignConfirm
                      ? "bg-red-600 border-red-500 text-white animate-pulse"
                      : "bg-white/[0.04] border-white/8 text-slate-400 hover:border-red-500/50 hover:text-red-400"
                  }`}>
                  {resignConfirm ? "Confirm?" : "Resign"}
                </button>
              )}

              {/* New game (after over) */}
              {isOver && (
                <button onClick={startGame}
                  className="flex-1 py-2 rounded-lg shimmer-btn-green text-white text-xs font-bold">
                  Play Again
                </button>
              )}
            </div>

            {/* Collapsible history */}
            {histOpen && (
              <div className="rounded-lg bg-[#0f1623] border border-white/8 animate-fade-in max-h-36 overflow-hidden">
                <MoveList moves={moves} ref={histRef} />
              </div>
            )}
          </div>
        </div>

        {/* ── Desktop side panel ──────────────────────────── */}
        <aside className="hidden lg:flex flex-col gap-2 shrink-0" style={{width:220}}>

          {/* Status */}
          <div className={`rounded-xl border px-3 py-2.5 text-xs font-semibold text-center transition-all ${
            isThinking ? "bg-violet-950/60 border-violet-500/20 text-violet-300" : statusCls[statusType]
          }`}>
            {isThinking
              ? <span className="flex items-center justify-center gap-2">Thinking <ThinkDots /></span>
              : status || "White's turn"
            }
          </div>

          {/* Resign button */}
          {!isOver && (
            <button onClick={handleResign}
              className={`w-full py-2 rounded-xl border text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                resignConfirm
                  ? "bg-red-600 border-red-500 text-white"
                  : "bg-white/[0.04] border-white/8 text-slate-400 hover:border-red-500/40 hover:text-red-400 hover:bg-red-500/5"
              }`}>
              🏳️ {resignConfirm ? "Tap again to confirm" : "Resign"}
            </button>
          )}

          {/* Move history */}
          <div className="flex-1 flex flex-col bg-[#0f1623] border border-white/8 rounded-xl overflow-hidden min-h-0">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 shrink-0">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Moves</span>
              <span className="text-[10px] text-slate-600 tabular-nums">{moves.length}</span>
            </div>
            <MoveList moves={moves} ref={histRef} className="flex-1 max-h-64 xl:max-h-80" />
          </div>

          {/* Bottom buttons */}
          <div className="flex gap-1.5">
            <button onClick={goMenu}
              className="flex-1 py-2 rounded-xl bg-white/[0.04] border border-white/8 text-slate-400 text-xs font-medium hover:text-white hover:bg-white/[0.07] transition-all">
              ← Menu
            </button>
            {isOver && (
              <button onClick={startGame}
                className="flex-1 py-2 rounded-xl shimmer-btn-green text-white text-xs font-bold shadow-md shadow-emerald-900/20">
                Play Again
              </button>
            )}
          </div>
        </aside>
      </div>

      {/* ── Game-over overlay ─────────────────────────────── */}
      {overlay && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={()=>setOverlay(false)}>
          <div className="w-full max-w-xs bg-[#111827] border border-white/10 rounded-2xl p-6 text-center shadow-2xl animate-scale-in" onClick={e=>e.stopPropagation()}>
            <div className="text-4xl mb-3 select-none">
              {statusType==="draw" ? "🤝" : "🏆"}
            </div>
            <h2 className="text-lg font-bold text-white mb-1">
              {statusType==="draw" ? "It's a Draw" : statusType==="resigned" ? "Game Resigned" : "Checkmate!"}
            </h2>
            <p className="text-slate-400 text-sm mb-5">{status}</p>
            <div className="flex gap-2">
              <button onClick={goMenu} className="flex-1 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-slate-300 text-sm transition-colors hover:bg-white/10">
                Menu
              </button>
              <button onClick={startGame} className="flex-1 py-2.5 rounded-xl shimmer-btn-green text-white text-sm font-bold shadow-lg shadow-emerald-900/20">
                Play Again
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

/* ── Sub-components ─────────────────────────────────────────── */

function PlayerBar({ sym, name, cap, active, thinking, width }: {
  sym: string; name: string; cap: string[]; active: boolean; thinking: boolean; width: number;
}) {
  return (
    <div className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2 border transition-all duration-200 ${
      active ? "bg-white/[0.07] border-white/12" : "bg-white/[0.03] border-white/6"
    }`} style={{width}}>
      {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-emerald-400" />}

      {/* Avatar */}
      <div className={`relative w-7 h-7 rounded-md flex items-center justify-center text-base shrink-0 ${active?"bg-white/10":"bg-white/[0.04]"}`}>
        {sym}
        {active && !thinking && (
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-emerald-400 rounded-full ring-1 ring-[#080c14]" />
        )}
      </div>

      {/* Name + thinking dots */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className={`text-xs font-semibold truncate ${active?"text-white":"text-slate-500"}`}>{name}</span>
        {thinking && <ThinkDots />}
      </div>

      {/* Captured */}
      <div className="flex flex-wrap gap-px justify-end max-w-[45%]">
        {cap.map((p,i) => <span key={i} className="text-slate-600 text-[10px] leading-none">{p}</span>)}
      </div>
    </div>
  );
}

function ThinkDots() {
  return (
    <span className="flex gap-0.5 items-center">
      {[0,1,2].map(i => <span key={i} className="dot w-1 h-1 bg-violet-400 rounded-full inline-block" />)}
    </span>
  );
}

const MoveList = forwardRef<HTMLDivElement, { moves: string[]; className?: string }>(
  ({ moves, className="" }, ref) => (
    <div ref={ref} className={`overflow-y-auto p-2.5 ${className}`}>
      {moves.length === 0
        ? <p className="text-slate-700 text-[10px] text-center py-4 select-none">No moves yet</p>
        : (
          <div className="grid grid-cols-[20px_1fr_1fr] gap-x-1.5 gap-y-0.5">
            {Array.from({length: Math.ceil(moves.length/2)}, (_,i) => (
              <>
                <span key={`n${i}`} className="text-slate-700 text-[10px] pt-0.5 tabular-nums">{i+1}.</span>
                <span key={`w${i}`} className={`font-mono text-[10px] px-1 py-0.5 rounded ${moves.length-1===i*2?"bg-white/10 text-white font-bold":"text-slate-400"}`}>
                  {moves[i*2]}
                </span>
                <span key={`b${i}`} className={`font-mono text-[10px] px-1 py-0.5 rounded ${moves.length-1===i*2+1?"bg-white/10 text-white font-bold":"text-slate-600"}`}>
                  {moves[i*2+1]||""}
                </span>
              </>
            ))}
          </div>
        )
      }
    </div>
  )
);
MoveList.displayName = "MoveList";
