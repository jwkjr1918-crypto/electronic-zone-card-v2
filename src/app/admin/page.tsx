"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";

import {
  ArrowLeft,
  Settings,
  MapPinned,
  ClipboardList,
  ShieldCheck,
} from "lucide-react";

import { db, auth } from "@/firebase/firebase";

export default function AdminPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [role, setRole] = useState<"admin" | "leader" | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }

      try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          alert("권한 정보가 없습니다.");
          await signOut(auth);
          router.push("/login");
          return;
        }

        const userRole = userSnap.data().role;

        if (userRole !== "admin" && userRole !== "leader") {
          alert("허용되지 않은 권한입니다.");
          await signOut(auth);
          router.push("/login");
          return;
        }

        setRole(userRole);
        setCheckingAuth(false);
      } catch (error) {
        console.error("권한 확인 에러:", error);
        alert("권한 확인 실패");
        await signOut(auth);
        router.push("/login");
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    if (!checkingAuth && role === "leader") {
      router.push("/visits");
    }
  }, [checkingAuth, role, router]);

  async function handleLogout() {
    try {
      await signOut(auth);
      router.push("/login");
    } catch (error) {
      console.error("로그아웃 에러:", error);
      alert("로그아웃 실패");
    }
  }

  if (checkingAuth) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-3xl rounded-3xl bg-white p-8 shadow">
          로그인 확인 중...
        </div>
      </main>
    );
  }

  if (role === "leader") return null;

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium shadow"
        >
          <ArrowLeft size={18} />
          메인으로 돌아가기
        </Link>

        <section className="mb-6 rounded-3xl bg-slate-900 p-6 text-white shadow">
          <div className="flex items-center gap-2 text-slate-300">
            <ShieldCheck size={18} />
            <span className="text-sm">전자구역 관리자</span>
          </div>

          <h1 className="mt-3 text-3xl font-bold">관리자 페이지</h1>

          <p className="mt-2 text-sm text-slate-300">
            구역 정보와 방문 기록을 관리하는 화면입니다.
          </p>

          <button
            onClick={handleLogout}
            className="mt-5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900"
          >
            로그아웃
          </button>
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <Link
            href="/admin/zones"
            className="rounded-2xl bg-white p-5 shadow transition hover:-translate-y-1 hover:shadow-lg"
          >
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100">
              <MapPinned size={22} />
            </div>

            <h2 className="text-lg font-bold">구역 관리</h2>

            <p className="mt-2 text-sm text-slate-500">
              구역 목록을 확인하고 수정할 수 있습니다.
            </p>
          </Link>

          <Link
            href="/visits"
            className="rounded-2xl bg-white p-5 shadow transition hover:-translate-y-1 hover:shadow-lg"
          >
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100">
              <ClipboardList size={22} />
            </div>

            <h2 className="text-lg font-bold">방문 기록 관리</h2>

            <p className="mt-2 text-sm text-slate-500">
              저장된 방문 기록을 확인하고 관리할 수 있습니다.
            </p>
          </Link>

          <div className="rounded-2xl bg-white p-5 shadow">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100">
              <Settings size={22} />
            </div>

            <h2 className="text-lg font-bold">설정</h2>

            <p className="mt-2 text-sm text-slate-500">
              관리자 기능을 단계적으로 추가할 예정입니다.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}