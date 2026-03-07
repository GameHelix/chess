import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-[#080c14] px-4 py-10 relative overflow-hidden">

      {/* Ambient background blobs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-violet-600/10 blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-emerald-600/8 blur-[100px]" />
        <div className="absolute bottom-0 right-0 w-[300px] h-[300px] rounded-full bg-blue-600/6 blur-[100px]" />
      </div>

      {/* Grid texture overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative w-full max-w-md">

        {/* Crown logo */}
        <div className="animate-fade-up flex flex-col items-center mb-10">
          <div className="relative mb-5">
            <div className="text-[80px] sm:text-[96px] leading-none select-none filter drop-shadow-[0_0_24px_rgba(167,139,250,0.5)]">
              ♛
            </div>
          </div>

          <h1 className="text-5xl sm:text-6xl font-black tracking-tight text-white leading-none mb-2">
            Chess
          </h1>
          <p className="text-slate-400 text-base sm:text-lg font-light">
            Play instantly — no account needed
          </p>
        </div>

        {/* Mode cards */}
        <div className="flex flex-col gap-3 stagger">

          {/* Human vs Human */}
          <Link
            href="/game?mode=hvh"
            className="animate-fade-up group relative rounded-2xl overflow-hidden transition-transform duration-200 active:scale-[0.98]"
          >
            {/* Gradient border trick */}
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500/40 via-emerald-700/20 to-transparent group-hover:from-emerald-400/60 group-hover:via-emerald-600/30 transition-all duration-300" />
            <div className="relative m-[1px] rounded-2xl bg-gradient-to-br from-[#0d1f14] via-[#0b1a10] to-[#080c14] p-5 sm:p-6">
              <div className="flex items-center gap-4">
                <div className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-emerald-500/15 border border-emerald-500/20 flex items-center justify-center text-2xl sm:text-3xl group-hover:scale-105 transition-transform duration-300">
                  👥
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base sm:text-lg font-bold text-white mb-0.5">
                    Human vs Human
                  </div>
                  <div className="text-emerald-400/70 text-xs sm:text-sm">
                    Pass &amp; play with a friend on this device
                  </div>
                </div>
                <div className="shrink-0 w-7 h-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-sm opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                  →
                </div>
              </div>
            </div>
          </Link>

          {/* Human vs AI */}
          <Link
            href="/game?mode=hvai"
            className="animate-fade-up group relative rounded-2xl overflow-hidden transition-transform duration-200 active:scale-[0.98]"
          >
            <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-500/40 via-violet-700/20 to-transparent group-hover:from-violet-400/60 group-hover:via-violet-600/30 transition-all duration-300" />
            <div className="relative m-[1px] rounded-2xl bg-gradient-to-br from-[#13102a] via-[#0f0d20] to-[#080c14] p-5 sm:p-6">
              <div className="flex items-center gap-4">
                <div className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center text-2xl sm:text-3xl group-hover:scale-105 transition-transform duration-300">
                  🤖
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-base sm:text-lg font-bold text-white mb-0.5">
                    Human vs AI
                  </div>
                  <div className="text-violet-400/70 text-xs sm:text-sm">
                    Challenge Stockfish 16 — Easy, Medium, Hard
                  </div>
                </div>
                <div className="shrink-0 w-7 h-7 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400 text-sm opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                  →
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Decorative board row */}
        <div className="animate-fade-up mt-12 flex justify-center gap-3 sm:gap-5 select-none" style={{ animationDelay: "0.3s" }}>
          {["♜","♞","♝","♛","♚","♝","♞","♜"].map((p, i) => (
            <span key={i} className="text-lg sm:text-2xl text-slate-700 hover:text-slate-500 transition-colors duration-200 cursor-default">
              {p}
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}
