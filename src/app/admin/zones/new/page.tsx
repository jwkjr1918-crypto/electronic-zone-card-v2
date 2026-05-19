"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { collection, addDoc } from "firebase/firestore";
import { ArrowLeft, Plus } from "lucide-react";
import Link from "next/link";

import { db } from "@/firebase/firebase";

const regions = [
  "후포면",
  "평해읍",
  "온정면",
  "기성면",
  "영해면",
  "병곡면",
  "창수면",
  "축산면",
];

export default function NewZonePage() {
  const router = useRouter();

  const [zoneNumber, setZoneNumber] = useState("");
  const [name, setName] = useState("");
  const [region, setRegion] = useState("후포면");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!zoneNumber || !name || !region) {
      alert("구역번호, 구역 이름, 지역을 모두 입력해주세요.");
      return;
    }

    try {
      setSaving(true);

      await addDoc(collection(db, "zones"), {
        id: Number(zoneNumber),
        name,
        region,
      });

      alert("새 구역이 추가되었습니다!");

      router.push("/admin/zones")
    } catch (error) {
      console.error("구역 추가 에러:", error);
      alert("추가 실패");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/admin"
          className="mb-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium shadow"
        >
          <ArrowLeft size={18} />
          관리자 페이지로 돌아가기
        </Link>

        <section className="rounded-3xl bg-white p-6 shadow">
          <p className="text-sm text-slate-400">
            관리자 구역 추가
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            새 구역 추가
          </h1>

          <div className="mt-8 space-y-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                구역번호
              </label>

              <input
                type="number"
                value={zoneNumber}
                onChange={(e) => setZoneNumber(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-slate-400"
                placeholder="예: 485"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                구역 이름
              </label>

              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-slate-400"
                placeholder="구역 이름 입력"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                지역
              </label>

              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none transition focus:border-slate-400"
              >
                {regions.map((regionItem) => (
                  <option key={regionItem} value={regionItem}>
                    {regionItem}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-4 text-white transition hover:bg-slate-800 disabled:opacity-50"
            >
              <Plus size={18} />
              {saving ? "추가 중..." : "새 구역 추가"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}