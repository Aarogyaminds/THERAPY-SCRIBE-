"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (res.ok) {
      router.push("/");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Something went wrong");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#FAF6EF]">
      <form onSubmit={submit} className="w-full max-w-sm px-6">
        <h1 className="text-2xl text-[#26314F] mb-1" style={{ fontFamily: "Fraunces, serif" }}>Aarogya Minds</h1>
        <p className="text-sm text-[#26314F]/55 mb-6">Enter the workspace password.</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border border-[#26314F]/20 rounded-sm px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#26314F]/50"
          placeholder="Password"
        />
        {error && <p className="text-sm text-[#B96B72] mt-2">{error}</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="mt-4 w-full bg-[#26314F] text-[#FAF6EF] text-sm px-4 py-2 rounded-sm hover:bg-[#26314F]/90 disabled:opacity-40"
        >
          {loading ? "Checking..." : "Enter"}
        </button>
      </form>
    </div>
  );
}
