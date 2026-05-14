"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { doc, getDoc, setDoc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";

import {
  ArrowLeft,
  Clock3,
  LogOut,
  Save,
  Settings,
  User,
} from "lucide-react";

import { db, auth } from "@/firebase/firebase";
import { Input } from "@/components/ui/input";

export default function AdminSettingsPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [role, setRole] = useState<"admin" | "leader" | null>(null);

  const [loading, setLoading] = useState(true);
  const [bulkVisitorName, setBulkVisitorName] = useState("관리자");
  const [visitLockMonths, setVisitLockMonths] = useState("3");
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    async function fetchSettings() {
      try {
        const settingsRef = doc(db, "settings", "global");
        const settingsSnap = await getDoc(settingsRef);

        if (settingsSnap.exists()) {
          const data = settingsSnap.data();

          setBulkVisitorName(data.bulkVisitorName || "관리자");
          setVisitLockMonths(String(data.visitLockMonths ?? 3));
        } else {
          await setDoc(settingsRef, {
            bulkVisitorName: "관리자",
            visitLockMonths: 3,
          });

          setBulkVisitorName("관리자");
          setVisitLockMonths("3");
        }
      } catch (error) {
        console.error("설정 불러오기 에러:", error);
        alert("설정을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    }

    if (!checkingAuth && role === "admin") {
      fetchSettings();
    }
  }, [checkingAuth, role]);

  async function handleSave() {
    const trimmedName = bulkVisitorName.trim();

    if (!trimmedName) {
      alert("방문완료 기본 이름을 입력해주세요.");
      return;
    }

    const months = Number(visitLockMonths);

    if (!Number.isInteger(months) || months < 0 || months > 24) {
      alert("방문완료 제한 기간은 0개월부터 24개월까지 입력할 수 있습니다.");
      return;
    }

    try {
      setSaving(true);

      await setDoc(
        doc(db, "settings", "global"),
        {
          bulkVisitorName: trimmedName,
          visitLockMonths: months,
        },
        {
          merge: true,
        }
      );

      setBulkVisitorName(trimmedName);
      setVisitLockMonths(String(months));

      alert("설정이 저장되었습니다.");
    } catch (error) {
      console.error("설정 저장 에러:", error);
      alert("설정 저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    try {
      await signOut(auth);
      router.push("/login");
    } catch (error) {
      console.error("로그아웃 에러:", error);
      alert("로그아웃 실패");
    }
  }

  if (checkingAuth || loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-3xl rounded-3xl bg-white p-8 shadow">
          설정 불러오는 중...
        </div>
      </main>
    );
  }

  if (role === "leader") return null;

  return (
    <main className="min-h-screen bg-slate-100 p-3 sm:p-4">
      <div className="mx-auto max-w-3xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-medium shadow"
          >
            <ArrowLeft size={17} />
            관리자 페이지
          </Link>

          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow"
          >
            <LogOut size={16} />
            로그아웃
          </button>
        </div>

        <section className="mb-4 rounded-3xl bg-slate-900 p-5 text-white shadow sm:p-6">
          <div className="flex items-center gap-2 text-slate-300">
            <Settings size={18} />
            <span className="text-sm">전자구역 관리자</span>
          </div>

          <h1 className="mt-3 text-2xl font-bold sm:text-3xl">설정</h1>

          <p className="mt-2 text-sm text-slate-300">
            관리자 기능에 필요한 기본값을 관리합니다.
          </p>
        </section>

        <section className="mb-4 rounded-3xl bg-white p-5 shadow">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100">
              <Clock3 size={22} />
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900">
                방문완료 제한 기간
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                방문완료 후 다시 방문완료를 누를 수 없게 막는 기간입니다.
                메인 화면의 방문할 곳 정렬에도 같이 적용됩니다.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">
              제한 기간
            </label>

            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={24}
                value={visitLockMonths}
                onChange={(e) => setVisitLockMonths(e.target.value)}
                placeholder="예: 3"
                className="h-11 max-w-32 rounded-xl bg-slate-50 text-base"
              />

              <span className="text-sm font-semibold text-slate-700">
                개월
              </span>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              현재 설정:{" "}
              <span className="font-bold text-slate-900">
                {visitLockMonths || "0"}개월
              </span>
              {Number(visitLockMonths) === 0
                ? " · 방문완료 제한 없음"
                : " · 이 기간이 지나야 다시 완료 가능"}
            </div>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100">
              <User size={22} />
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900">
                방문완료 기본 이름
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                구역 관리에서 여러 구역을 선택 방문완료 처리할 때 저장될
                방문자 이름입니다.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">
              기본 방문자 이름
            </label>

            <Input
              value={bulkVisitorName}
              onChange={(e) => setBulkVisitorName(e.target.value)}
              placeholder="예: 관리자"
              className="h-11 rounded-xl bg-slate-50 text-base"
            />

            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              현재 저장될 이름:{" "}
              <span className="font-bold text-slate-900">
                {bulkVisitorName.trim() || "입력 필요"}
              </span>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow disabled:opacity-50 sm:w-auto"
            >
              <Save size={17} />
              {saving ? "저장 중..." : "설정 저장"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}