"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  deleteDoc,
  writeBatch,
} from "firebase/firestore";

import {
  ArrowLeft,
  Clock3,
  MapPin,
  Trash2,
  ClipboardList,
  ChevronDown,
  ChevronUp,
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openZone, setOpenZone] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);

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

        setVisitLogs(logs);
      } catch (error) {
        console.error("방문 기록 조회 에러:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchVisitLogs();
  }, []);

  const groupedLogs = useMemo(() => {
    const map = new Map<string, VisitLog[]>();

    visitLogs.forEach((log) => {
      const key = log.zoneName || log.zoneId || log.id;

      if (!map.has(key)) {
        map.set(key, []);
      }

      map.get(key)?.push(log);
    });

    return Array.from(map.entries()).map(([zoneName, logs]) => ({
      zoneName,
      logs,
      latestLog: logs[0],
    }));
  }, [visitLogs]);

  async function handleDeleteLog(log: VisitLog) {
    const ok = confirm(
      `${log.zoneName} 방문 기록 1개를 삭제할까요?`
    );

    if (!ok) return;

    try {
      setDeletingId(log.id);

      await deleteDoc(doc(db, "visitLogs", log.id));

      setVisitLogs((prev) =>
        prev.filter((item) => item.id !== log.id)
      );
    } catch (error) {
      console.error("방문 기록 삭제 에러:", error);
      alert("삭제 실패");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteAll() {
    const ok = confirm(
      "전체 방문 기록을 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다."
    );

    if (!ok) return;

    try {
      setDeletingAll(true);

      const batch = writeBatch(db);

      visitLogs.forEach((log) => {
        batch.delete(doc(db, "visitLogs", log.id));
      });

      await batch.commit();

      setVisitLogs([]);
      setOpenZone(null);

      alert("전체 방문 기록이 삭제되었습니다.");
    } catch (error) {
      console.error("전체 삭제 에러:", error);
      alert("전체 삭제 실패");
    } finally {
      setDeletingAll(false);
    }
  }

  function formatDate(createdAt: any) {
    if (!createdAt?.seconds) return "시간 없음";

    return new Date(createdAt.seconds * 1000).toLocaleString();
  }

  return (
    <main className="min-h-screen bg-slate-100 p-3">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/admin"
          className="mb-3 inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-medium shadow"
        >
          <ArrowLeft size={16} />
          관리자 페이지로 돌아가기
        </Link>

        <div className="mb-4 rounded-2xl bg-slate-900 p-5 text-white shadow">
          <div className="flex items-center gap-2 text-slate-300">
            <ClipboardList size={18} />
            <p className="text-sm">전자구역 방문 관리</p>
          </div>

          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">
                방문 기록 관리
              </h1>

              <p className="mt-1 text-sm text-slate-300">
                총 {visitLogs.length}개 기록 / {groupedLogs.length}개 구역
              </p>
            </div>

            {visitLogs.length > 0 && (
              <button
                onClick={handleDeleteAll}
                disabled={deletingAll}
                className="rounded-xl bg-red-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {deletingAll ? "삭제 중..." : "전체 삭제"}
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-white p-6 shadow">
            불러오는 중...
          </div>
        ) : groupedLogs.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center text-slate-400 shadow">
            방문 기록이 없습니다.
          </div>
        ) : (
          <div className="space-y-2">
            {groupedLogs.map(({ zoneName, logs, latestLog }) => {
              const isOpen = openZone === zoneName;

              return (
                <div
                  key={zoneName}
                  className="overflow-hidden rounded-2xl bg-white shadow"
                >
                  <button
                    onClick={() =>
                      setOpenZone(isOpen ? null : zoneName)
                    }
                    className="flex w-full items-center justify-between gap-3 p-4 text-left"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-slate-900 px-2 py-1 text-xs font-semibold text-white">
                          {latestLog.zoneNumber ?? latestLog.zoneId}.
                        </span>

                        <span className="truncate text-base font-bold text-slate-900">
                          {latestLog.zoneName}
                        </span>

                        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">
                          {logs.length}개
                        </span>
                      </div>

                      <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <MapPin size={13} />
                          {latestLog.region}
                        </span>

                        <span className="flex items-center gap-1">
                          <Clock3 size={13} />
                          {formatDate(latestLog.createdAt)}
                        </span>
                      </div>
                    </div>

                    {isOpen ? (
                      <ChevronUp size={20} />
                    ) : (
                      <ChevronDown size={20} />
                    )}
                  </button>

                  {isOpen && (
                    <div className="border-t border-slate-100 bg-slate-50 p-3">
                      <div className="space-y-2">
                        {logs.map((log) => (
                          <div
                            key={log.id}
                            className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2"
                          >
                            <div className="min-w-0 text-sm">
                              <div className="flex items-center gap-1 text-slate-500">
                                <Clock3 size={14} />
                                {formatDate(log.createdAt)}
                              </div>
                            </div>

                            <button
                              onClick={() => handleDeleteLog(log)}
                              disabled={deletingId === log.id}
                              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-red-500 px-2 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                            >
                              <Trash2 size={13} />
                              {deletingId === log.id ? "삭제 중" : "삭제"}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}