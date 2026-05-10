"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  where,
  orderBy,
} from "firebase/firestore";
import { ArrowLeft, MapPin, Hash, ClipboardList } from "lucide-react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { db, auth } from "@/firebase/firebase";


interface Zone {
  firestoreId: string;
  id?: number;
  name: string;
  region: string;
  lastVisitedAt?: any;
}
interface VisitLog {
  id: string;
  zoneName: string;
  region: string;
  createdAt?: any;
}

export default function ZoneDetailPage() {
  const params = useParams();
  const router = useRouter();

  const id = params.id as string;

  const [zone, setZone] = useState<Zone | null>(null);
  const [visitLogs, setVisitLogs] = useState<VisitLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function handleVisitLog() {
  if (!zone) return;

  try {
      await addDoc(collection(db, "visitLogs"), {
        zoneId: id,
        zoneNumber: zone.id,
        zoneName: zone.name,
        region: zone.region,
        createdAt: serverTimestamp(),
      });

    alert("방문 기록이 저장되었습니다!");
  } catch (error) {
    console.error("방문 기록 저장 에러:", error);

    alert("저장 실패");
  }
}
    async function fetchZone() {
      try {
        const docRef = doc(db, "zones", id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setZone(docSnap.data() as Zone);
        } else {
          setZone(null);
        }
      } catch (error) {
        console.error("상세페이지 Firebase 에러:", error);
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      fetchZone();
      fetchVisitLogs();
}
  }, [id]);
async function handleVisitLog() {
  if (!zone) return;

  try {
    await addDoc(collection(db, "visitLogs"), {
      zoneId: id,
      zoneNumber: zone.id,
      zoneName: zone.name,
      region: zone.region,
      createdAt: serverTimestamp(),
    });

    await fetchVisitLogs();
    alert("방문 기록이 저장되었습니다!");
  } catch (error) {
    console.error("방문 기록 저장 에러:", error);
    alert("저장 실패");
  }
}

async function fetchVisitLogs() {
  try {
    const q = query(
  collection(db, "visitLogs"),
  where("zoneId", "==", id)
);

    const querySnapshot = await getDocs(q);

    const logs = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as VisitLog[];

    setVisitLogs(logs);
  } catch (error) {
    console.error("방문 기록 조회 에러:", error);
  }
}

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow">
          불러오는 중...
        </div>
      </main>
    );
  }

  if (!zone) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow">
          <h1 className="text-2xl font-bold">
            구역 정보를 찾을 수 없습니다.
          </h1>

          <button
            onClick={() => router.back()}
            className="mt-6 rounded-xl bg-slate-900 px-4 py-2 text-white"
          >
            뒤로가기
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-3xl">
        <button
          onClick={() => router.back()}
          className="mb-4 flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium shadow"
        >
          <ArrowLeft size={18} />
          목록으로 돌아가기
        </button>

        <section className="overflow-hidden rounded-3xl bg-white shadow">
          <div className="bg-slate-900 p-6 text-white">
            <p className="text-sm text-slate-300">
              전자구역 상세정보
            </p>

            <h1 className="mt-3 text-4xl font-bold">
              {zone.name}
            </h1>

            <div className="mt-5 flex flex-wrap gap-2">
              <div className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-sm">
                <MapPin size={15} />
                {zone.region}
              </div>

              <div className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-sm">
                <Hash size={15} />
                구역번호 {zone.id}
              </div>
            </div>
          </div>

          <div className="space-y-4 p-6">
            <div className="rounded-2xl bg-slate-50 p-5">
              <div className="mb-2 flex items-center gap-2 font-semibold">
                <ClipboardList size={18} />
                방문 관리
              </div>

              <p className="text-sm text-slate-500">
                이 구역의 방문 기록과 세부 정보를 관리할 수 있습니다.
              </p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-5">
  <h2 className="mb-4 text-lg font-bold">
    최근 방문 기록
  </h2>

  <div className="space-y-3">
    {visitLogs.length === 0 ? (
      <p className="text-sm text-slate-400">
        방문 기록이 없습니다.
      </p>
    ) : (
      visitLogs.slice(0, 1).map((log) => (
        <div
  key={log.id}
  className="rounded-xl bg-white p-4 shadow-sm"
>
  <div className="mb-2 text-xs text-slate-400">
    {log.createdAt?.seconds
      ? new Date(
          log.createdAt.seconds * 1000
        ).toLocaleString()
      : "시간 없음"}
  </div>

  <div className="font-medium">
    {log.zoneName}
  </div>

  <div className="text-sm text-slate-500">
    {log.region}
  </div>
</div>
      ))
    )}
  </div>
</div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
  onClick={handleVisitLog}
  className="rounded-2xl bg-slate-900 p-4 text-left text-white shadow"
>
                <div className="text-sm text-slate-300">
                  다음 작업
                </div>
                <div className="mt-1 text-lg font-bold">
                  구역 완료
                </div>
              </button>

              <button className="rounded-2xl bg-white p-4 text-left shadow ring-1 ring-slate-200">
                <div className="text-sm text-slate-400">
                  관리
                </div>
                <div className="mt-1 text-lg font-bold">
                  구역 정보 수정
                </div>
              </button>
            </div>
            
          </div>
        </section>
      </div>
    </main>
  );
}