"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { doc, getDoc } from "firebase/firestore";

import {
  onAuthStateChanged,
  signOut,
} from "firebase/auth";

import {
  ArrowLeft,
  MapPinned,
  ClipboardList,
  Settings,
  LogOut,
  Shield,
} from "lucide-react";

import { db, auth } from "@/firebase/firebase";

export default function AdminPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] =
    useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        if (!user) {
          router.push("/login");
          return;
        }

        try {
          const userRef = doc(
            db,
            "users",
            user.uid
          );

          const userSnap = await getDoc(
            userRef
          );

          if (!userSnap.exists()) {
            alert("권한 정보가 없습니다.");

            await signOut(auth);

            router.push("/login");

            return;
          }

          const role =
            userSnap.data().role;

          if (role !== "admin") {
            alert(
              "관리자만 접근 가능합니다."
            );

            router.push("/");

            return;
          }

          setCheckingAuth(false);
        } catch (error) {
          console.error(
            "권한 확인 에러:",
            error
          );

          alert("권한 확인 실패");

          router.push("/");
        }
      }
    );

    return () => unsubscribe();
  }, [router]);

  async function handleLogout() {
    try {
      await signOut(auth);

      router.push("/login");
    } catch (error) {
      console.error(
        "로그아웃 에러:",
        error
      );

      alert("로그아웃 실패");
    }
  }

  if (checkingAuth) {
    return (
      <main className="min-h-screen bg-slate-100 p-4">
        <div className="mx-auto max-w-4xl rounded-3xl bg-white p-8 shadow">
          로그인 확인 중...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-3 sm:p-4">
      <div className="mx-auto max-w-5xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-medium shadow"
          >
            <ArrowLeft size={17} />
            메인화면
          </Link>

          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow"
          >
            <LogOut size={16} />
            로그아웃
          </button>
        </div>

        <section className="rounded-3xl bg-slate-900 p-5 text-white shadow sm:p-6">
          <div className="flex items-center gap-2 text-slate-300">
            <Shield size={18} />

            <span className="text-sm">
              전자구역 관리자
            </span>
          </div>

          <h1 className="mt-3 text-2xl font-bold sm:text-3xl">
            관리자 페이지
          </h1>

          <p className="mt-2 text-sm text-slate-300">
            전자구역 관리 기능에 접근할 수
            있습니다.
          </p>
        </section>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Link
            href="/admin/zones"
            className="rounded-3xl bg-white p-5 shadow transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="flex items-center gap-2 text-slate-500">
              <MapPinned size={20} />

              <span className="text-sm font-medium">
                구역관리
              </span>
            </div>

            <h2 className="mt-3 text-xl font-bold text-slate-900">
              구역 관리
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              구역 추가, 수정, 삭제 및
              방문완료 관리
            </p>
          </Link>

          <Link
            href="/visits"
            className="rounded-3xl bg-white p-5 shadow transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="flex items-center gap-2 text-slate-500">
              <ClipboardList size={20} />

              <span className="text-sm font-medium">
                방문기록
              </span>
            </div>

            <h2 className="mt-3 text-xl font-bold text-slate-900">
              방문기록
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              전체 방문 기록 조회 및 관리
            </p>
          </Link>

          <Link
            href="/admin/settings"
            className="rounded-3xl bg-white p-5 shadow transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="flex items-center gap-2 text-slate-500">
              <Settings size={20} />

              <span className="text-sm font-medium">
                설정
              </span>
            </div>

            <h2 className="mt-3 text-xl font-bold text-slate-900">
              설정
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              관리자 설정 및 시스템 관리
            </p>
          </Link>
        </div>
      </div>
    </main>
  );
}