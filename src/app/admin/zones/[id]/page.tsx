"use client";

import { useEffect, useState } from "react";
import {
  useParams,
  useRouter,
} from "next/navigation";

import {
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";

import {
  ArrowLeft,
  Save,
} from "lucide-react";

import Link from "next/link";

import { db } from "@/firebase/firebase";

interface Zone {
  id?: number;
  name: string;
  region: string;
}

const regions = [
  "후포면",
  "평해면",
  "온정면",
  "기성면",
  "영해면",
  "병곡면",
  "창수면",
  "축산면",
];

export default function AdminZoneEditPage() {
  const params = useParams();
  const router = useRouter();

  const id = params.id as string;

  const [zone, setZone] = useState<Zone | null>(null);

  const [name, setName] = useState("");
  const [region, setRegion] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchZone() {
      try {
        const docRef = doc(db, "zones", id);

        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data() as Zone;

          setZone(data);

          setName(data.name || "");
          setRegion(data.region || "");
        }
      } catch (error) {
        console.error("구역 조회 에러:", error);
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      fetchZone();
    }
  }, [id]);

  async function handleSave() {
    if (!zone) return;

    try {
      setSaving(true);

      const docRef = doc(db, "zones", id);

      await updateDoc(docRef, {
        name,
        region,
      });

      alert("구역 정보가 저장되었습니다!");

      router.push("/admin");
    } catch (error) {
      console.error("구역 저장 에러:", error);

      alert("저장 실패");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-3xl rounded-3xl bg-white p-8 shadow">
          불러오는 중...
        </div>
      </main>
    );
  }

  if (!zone) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-3xl rounded-3xl bg-white p-8 shadow">
          구역 정보를 찾을 수 없습니다.
        </div>
      </main>
    );
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
            관리자 구역 수정
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            {zone.id}번 구역 수정
          </h1>

          <div className="mt-8 space-y-6">

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
                  <option
                    key={regionItem}
                    value={regionItem}
                  >
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
              <Save size={18} />

              {saving ? "저장 중..." : "구역 정보 저장"}
            </button>

          </div>
        </section>
      </div>
    </main>
  );
}