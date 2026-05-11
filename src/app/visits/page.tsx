"use client";

import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { db, auth } from "@/firebase/firebase";

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
  getDoc,
} from "firebase/firestore";

import {
  ArrowLeft,
  Clock3,
  MapPin,
  Trash2,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  LogOut,
  User,
} from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const regions = [
  "전체",
  "후포면",
  "평해면",
  "온정면",
  "기성면",
  "영해면",
  "병곡면",
  "창수면",
  "축산면",
];

interface VisitLog {
  id: string;
  zoneId?: string;
  zoneNumber?: number;
  zoneName: string;
  region: string;
  visitorName?: string;
  createdAt?: any;
}

export default function VisitsPage() {
  const [visitLogs, setVisitLogs] = useState<VisitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openZone, setOpenZone] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [selectedLogs, setSelectedLogs] = useState<string[]>([]);

  const [checkingAuth, setCheckingAuth] = useState(true);

  const [role, setRole] = useState<"admin" | "leader" | null>(null);

  const [selectedRegion, setSelectedRegion] = useState("전체");

  const router = useRouter();

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
          await signOut(auth);

          router.push("/login");

          return;
        }

        const userRole = userSnap.data().role;

        setRole(userRole);

        setCheckingAuth(false);
      } catch (error) {
        console.error("권한 확인 에러:", error);

        router.push("/login");
      }
    });

    return () => unsubscribe();
  }, [router]);

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

  const filteredLogs = useMemo(() => {
    return visitLogs.filter((log) => {
      return selectedRegion === "전체"
        ? true
        : log.region === selectedRegion;
    });
  }, [visitLogs, selectedRegion]);

  const groupedLogs = useMemo(() => {
    const map = new Map<string, VisitLog[]>();

    filteredLogs.forEach((log) => {
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
  }, [filteredLogs]);

  const allFilteredSelected =
    filteredLogs.length > 0 &&
    filteredLogs.every((log) => selectedLogs.includes(log.id));

  function toggleLog(logId: string) {
    setSelectedLogs((prev) =>
      prev.includes(logId)
        ? prev.filter((id) => id !== logId)
        : [...prev, logId]
    );
  }

  function toggleAllFilteredLogs() {
    const filteredIds = filteredLogs.map((log) => log.id);

    if (allFilteredSelected) {
      setSelectedLogs((prev) =>
        prev.filter((id) => !filteredIds.includes(id))
      );
    } else {
      setSelectedLogs((prev) => {
        const next = new Set(prev);

        filteredIds.forEach((id) => {
          next.add(id);
        });

        return Array.from(next);
      });
    }
  }

  async function handleDeleteLog(log: VisitLog) {
    const ok = confirm(`${log.zoneName} 방문 기록 1개를 삭제할까요?`);

    if (!ok) return;

    try {
      setDeletingId(log.id);

      await deleteDoc(doc(db, "visitLogs", log.id));

      setVisitLogs((prev) => prev.filter((item) => item.id !== log.id));

      setSelectedLogs((prev) => prev.filter((id) => id !== log.id));
    } catch (error) {
      console.error("방문 기록 삭제 에러:", error);

      alert("삭제 실패");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteSelectedLogs() {
    if (selectedLogs.length === 0) {
      alert("선택된 방문 기록이 없습니다.");
      return;
    }

    const ok = confirm(
      `선택한 ${selectedLogs.length}개 방문 기록을 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`
    );

    if (!ok) return;

    try {
      setDeletingSelected(true);

      const batch = writeBatch(db);

      selectedLogs.forEach((logId) => {
        batch.delete(doc(db, "visitLogs", logId));
      });

      await batch.commit();

      setVisitLogs((prev) =>
        prev.filter((log) => !selectedLogs.includes(log.id))
      );

      setSelectedLogs([]);
      setOpenZone(null);

      alert("선택한 방문 기록이 삭제되었습니다.");
    } catch (error) {
      console.error("선택 방문 기록 삭제 에러:", error);

      alert("선택 삭제 실패");
    } finally {
      setDeletingSelected(false);
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

      setSelectedLogs([]);

      setOpenZone(null);

      alert("전체 방문 기록이 삭제되었습니다.");
    } catch (error) {
      console.error("전체 삭제 에러:", error);

      alert("전체 삭제 실패");
    } finally {
      setDeletingAll(false);
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

  function formatDate(createdAt: any) {
    if (!createdAt?.seconds) return "시간 없음";

    return new Date(createdAt.seconds * 1000).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
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

  return (
    <main className="min-h-screen bg-slate-100 p-3">
      <div className="mx-auto max-w-5xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          {role === "admin" ? (
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-medium shadow"
            >
              <ArrowLeft size={16} />
              관리자 페이지로 돌아가기
            </Link>
          ) : (
            <Link
              href="/"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-medium shadow"
            >
              <ArrowLeft size={16} />
              메인으로 돌아가기
            </Link>
          )}

          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow"
          >
            <LogOut size={16} />
            로그아웃
          </button>
        </div>

        <div className="mb-4 rounded-2xl bg-slate-900 p-5 text-white shadow">
          <div className="flex items-center gap-2 text-slate-300">
            <ClipboardList size={18} />

            <p className="text-sm">전자구역 방문 관리</p>
          </div>

          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold">방문 기록 관리</h1>

              <p className="mt-1 text-sm text-slate-300">
                총 {visitLogs.length}개 기록 / 현재 {filteredLogs.length}개 표시
                / {groupedLogs.length}개 구역
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
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
        </div>

        <Tabs defaultValue="전체" className="mb-3">
          <TabsList className="flex h-auto w-full justify-start gap-2 overflow-x-auto rounded-2xl bg-slate-200/70 p-2">
            {regions.map((region) => (
              <TabsTrigger
                key={region}
                value={region}
                onClick={() => {
                  setSelectedRegion(region);
                  setOpenZone(null);
                }}
                className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold"
              >
                {region}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            onClick={toggleAllFilteredLogs}
            disabled={filteredLogs.length === 0}
            className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow disabled:opacity-50"
          >
            {allFilteredSelected ? "전체 해제" : "전체 선택"}
          </button>

          <button
            onClick={handleDeleteSelectedLogs}
            disabled={deletingSelected || selectedLogs.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-50"
          >
            <Trash2 size={16} />
            {deletingSelected ? "삭제 중..." : "선택 삭제"}
          </button>

          <div className="rounded-full bg-white px-3 py-1 text-sm text-slate-500 shadow">
            선택 {selectedLogs.length}개
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-white p-6 shadow">불러오는 중...</div>
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
                    onClick={() => setOpenZone(isOpen ? null : zoneName)}
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

                      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1">
                          <MapPin size={13} />
                          {latestLog.region || "지역 정보 없음"}
                        </span>

                        {latestLog.visitorName && (
                          <span className="flex items-center gap-1 font-medium text-slate-700">
                            <User size={13} />
                            최근 방문자: {latestLog.visitorName}
                          </span>
                        )}

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
                        {logs.map((log) => {
                          const checked = selectedLogs.includes(log.id);

                          return (
                            <div
                              key={log.id}
                              className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${
                                checked
                                  ? "bg-red-50 ring-2 ring-red-100"
                                  : "bg-white"
                              }`}
                            >
                              <div className="flex min-w-0 items-center gap-3 text-sm">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleLog(log.id)}
                                  className="h-4 w-4 shrink-0 accent-red-500"
                                />

                                <div className="min-w-0">
                                  {log.visitorName && (
                                    <div className="mb-1 flex items-center gap-1 font-semibold text-slate-900">
                                      <User size={14} />
                                      방문자: {log.visitorName}
                                    </div>
                                  )}

                                  <div className="flex items-center gap-1 text-slate-500">
                                    <Clock3 size={14} />
                                    {formatDate(log.createdAt)}
                                  </div>
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
                          );
                        })}
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