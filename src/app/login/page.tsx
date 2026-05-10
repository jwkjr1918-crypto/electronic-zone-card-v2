"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { Lock } from "lucide-react";

import { auth } from "@/firebase/firebase";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleLogin() {
    try {
      const loginEmail = `${email}@hupo.local`;

      await signInWithEmailAndPassword(auth, loginEmail, password);

      alert("로그인되었습니다.");

      router.push("/admin");
    } catch (error) {
      console.error("로그인 에러:", error);
      alert("로그인 실패. 아이디과 비밀번호를 확인해주세요.");
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <section className="w-full max-w-md rounded-3xl bg-white p-8 shadow">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
          <Lock size={24} />
        </div>

        <h1 className="text-3xl font-bold">관리자 로그인</h1>

        <p className="mt-2 text-sm text-slate-500">
          관리자 계정으로 로그인해주세요.
        </p>

        <div className="mt-8 space-y-4">
          <input
            type="email"
            placeholder="아이디"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none"
          />

          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none"
          />

          <button
            onClick={handleLogin}
            className="w-full rounded-2xl bg-slate-900 px-4 py-3 font-semibold text-white"
          >
            로그인
          </button>
        </div>
      </section>
    </main>
  );
}