"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { ArrowRight, Clock3, MapPinned, Search } from "lucide-react";

import { db } from "@/firebase/firebase";
import { Input } from "@/components/ui/input";

interface Zone {
  firestoreId: string;
  id?: number;
  name?: string;
  region?: string;
}

export default function EvangelistPage() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [zoneNumber, setZoneNumber] = useState("");
  const [lastNumber] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("lastEvangelistZoneNumber") || "";
  });

  const [recentNumbers] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];

    try {
      const saved = localStorage.getItem("recentEvangelistNumbers");
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      return [];
    }
  });

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 150);

    return () => clearTimeout(timer);
  }, []);

  async function handleMove(customNumber?: string) {
    const targetNumber = (customNumber || zoneNumber).trim();

    if (!targetNumber) {
      alert("구역 번호를 입력해주세요.");
      return;
    }

    try {
      setLoading(true);

      const querySnapshot = await getDocs(collection(db, "zones"));

      const zones = querySnapshot.docs.map((zoneDoc) => ({
        firestoreId: zoneDoc.id,
        ...zoneDoc.data(),
      })) as Zone[];

      const matchedZone = zones.find(
        (zone) => String(zone.id) === targetNumber
      );

      if (!matchedZone) {
        alert(`${targetNumber}번 구역을 찾을 수 없습니다.`);

        setTimeout(() => {
          inputRef.current?.focus();
        }, 100);

        return;
      }

      localStorage.setItem("lastEvangelistZoneNumber", targetNumber);

      const updatedRecentNumbers = [
        targetNumber,
        ...recentNumbers.filter((number) => number !== targetNumber),
      ].slice(0, 5);

      localStorage.setItem(
        "recentEvangelistNumbers",
        JSON.stringify(updatedRecentNumbers)
      );

      sessionStorage.setItem("zoneEntryFrom", "evangelist");

      router.push(`/zone/${matchedZone.firestoreId}?from=evangelist`);
    } catch (error) {
      console.error("구역 이동 에러:", error);
      alert("구역을 찾는 중 문제가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#e2e8f0,_#f8fafc_45%,_#eef2f7)] px-4 py-8">
      <section className="w-full max-w-md overflow-hidden rounded-[2rem] border border-white/70 bg-white/85 shadow-2xl backdrop-blur">
        <div className="bg-slate-950 px-6 py-7 text-white">
          <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10">
            <MapPinned size={25} />
          </div>

          <p className="text-sm font-medium text-slate-300">
            전자구역 바로가기
          </p>

          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            구역 번호 입력
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-300">
            배정받은 구역 번호를 입력하면 해당 구역 카드로 바로 이동합니다.
          </p>
        </div>

        <div className="space-y-4 p-6">
          <div>
            <label className="mb-2 block text-sm font-semibold text-slate-700">
              구역 번호
            </label>

            <div className="relative">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />

              <Input
                ref={inputRef}
                value={zoneNumber}
                onChange={(e) => setZoneNumber(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleMove();
                  }
                }}
                inputMode="numeric"
                placeholder="예: 15"
                className="h-16 rounded-2xl border-slate-200 bg-slate-50 pl-11 text-2xl font-bold shadow-inner"
              />
            </div>
          </div>

          {lastNumber && (
            <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
              이전 입력 번호:{" "}
              <span className="font-bold text-slate-900">{lastNumber}번</span>
            </div>
          )}

          {recentNumbers.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-600">
                <Clock3 size={15} />
                최근 번호
              </div>

              <div className="flex flex-wrap gap-2">
                {recentNumbers.map((number) => (
                  <button
                    key={number}
                    onClick={() => {
                      setZoneNumber(number);
                      handleMove(number);
                    }}
                    className="rounded-2xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-800 transition active:scale-95"
                  >
                    {number}번
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => handleMove()}
            disabled={loading}
            className="flex h-16 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 text-lg font-bold text-white shadow-lg transition active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? "찾는 중..." : "구역 카드로 이동"}
            {!loading && <ArrowRight size={20} />}
          </button>

          <p className="text-center text-xs leading-5 text-slate-400">
            번호가 기억나지 않으면 관리자에게 구역 번호를 확인해주세요.
          </p>
        </div>
      </section>
    </main>
  );
}