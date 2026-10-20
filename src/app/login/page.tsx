"use client";

import { useState } from "react";
import { Logo } from "@/components/Logo";

export default function Login() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    // recarga completa para que el proxy vea la cookie nueva
    if (res.ok) window.location.replace("/");
    else setError(true);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6">
      <Logo className="self-center text-4xl" />
      <p className="mt-6 text-center text-mute">Stock del taller</p>
      <form onSubmit={entrar} className="mt-8 space-y-4">
        <input
          type="password"
          inputMode="numeric"
          autoFocus
          value={pin}
          onChange={(e) => { setPin(e.target.value); setError(false); }}
          placeholder="PIN"
          className="w-full rounded-xl border border-line bg-surface px-4 py-4 text-center text-2xl tracking-[0.5em] focus:border-brand focus:outline-none"
        />
        {error && <p className="text-center text-sm text-red-300">PIN incorrecto</p>}
        <button className="w-full rounded-xl bg-brand py-4 text-lg font-bold text-ink">Entrar</button>
      </form>
    </main>
  );
}
