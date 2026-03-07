import { Suspense } from "react";
import GameClient from "@/components/GameClient";

export default function GamePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>}>
      <GameClient />
    </Suspense>
  );
}
