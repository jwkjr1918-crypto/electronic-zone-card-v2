"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  collection,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";

import {
  ArrowLeft,
  Clock3,
  MapPin,
} from "lucide-react";

import { db } from "@/firebase/firebase";

interface VisitLog {
  id: string;
  zoneId?: string;
  zoneNumber?: number;
  zoneName: string;
  region: string;
  createdAt?: any;
}

export default function VisitsPage() {
  const [visitLogs, setVisitLogs] = useState<VisitLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchVisitLogs() {
      try {
        const q = query(
          collection(db, "visitLogs"),
          orderBy("createdAt", "desc")
        );

        const querySnapshot = await getDocs(q);

        const logs = querySnapshot.docs.map((doc) => ({
  id: doc.id,
  ...doc.data(),
})) as VisitLog[];

// 구역별 최신 기록만 남기기
const latestLogsMap = new Map<string, VisitLog>();

logs.forEach((log) => {
  if (!latestLogsMap.has(log.zoneName)) {
    latestLogsMap.set(log.zoneName, log);
  }
});

const latestLogs = Array.from(latestLogsMap.values());

setVisitLogs(latestLogs);
      } catch (error) {
        console.error("방문 기록 조회 에러:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchVisitLogs();
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-4xl">

        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium shadow"
        >
          <ArrowLeft size={18} />
          메인으로 돌아가기
        </Link>

        <div className="mb-6 rounded-3xl bg-slate-900 p-6 text-white shadow">
          <p className="text-sm text-slate-300">
            전자구역 방문 관리
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            전체 방문 기록
          </h1>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-white p-8 shadow">
            불러오는 중...
          </div>
        ) : (
          <div className="space-y-4">
            {visitLogs.length === 0 ? (
              <div className="rounded-2xl bg-white p-8 text-center text-slate-400 shadow">
                방문 기록이 없습니다.
              </div>
            ) : (
              visitLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-2xl bg-white p-5 shadow"
                >
                  <div className="mb-3 flex items-center gap-2 text-sm text-slate-400">
                    <Clock3 size={16} />

                    {log.createdAt?.seconds
                      ? new Date(
                          log.createdAt.seconds * 1000
                        ).toLocaleString()
                      : "시간 없음"}
                  </div>

                        <div className="flex items-center gap-2">
                        <div className="rounded-full bg-slate-900 px-2 py-1 text-xs font-semibold text-white">
                            {log.zoneNumber ?? log.zoneId}.
                        </div>

                        <div className="text-xl font-bold text-slate-900">
                            {log.zoneName}
                        </div>
                        </div>

                  <div className="mt-2 flex items-center gap-2 text-sm text-slate-500">
                    <MapPin size={15} />
                    {log.region}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </main>
  );
}