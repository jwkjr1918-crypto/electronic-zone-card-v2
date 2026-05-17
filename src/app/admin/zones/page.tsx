"use client";

import type { MouseEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  collection,
  getDocs,
  doc,
  deleteDoc,
  addDoc,
  serverTimestamp,
  getDoc,
  query,
  orderBy,
  writeBatch,
  updateDoc,
  Timestamp,
} from "firebase/firestore";

import { onAuthStateChanged, signOut } from "firebase/auth";

import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Hash,
  LogOut,
  MapPinned,
  Plus,
  Trash2,
  TriangleAlert,
  Lock,
  ChevronDown,
  ChevronUp,
  Clock3,
  Pencil,
  Save,
  X,
  User,
} from "lucide-react";

import { db, auth } from "@/firebase/firebase";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const regions = [
  "전체",
  "후포면",
  "평해읍",
  "온정면",
  "기성면",
  "영해면",
  "병곡면",
  "창수면",
  "축산면",
];

const DEFAULT_VISIT_LOCK_MONTHS = 3;

function normalizeRegion(region?: string) {
  const normalized = String(region ?? "")
    .trim()
    .replace(/\s/g, "");

  if (normalized.includes("후포")) return "후포면";
  if (normalized.includes("평해")) return "평해읍";
  if (normalized.includes("온정")) return "온정면";
  if (normalized.includes("기성")) return "기성면";
  if (normalized.includes("영해")) return "영해면";
  if (normalized.includes("병곡")) return "병곡면";
  if (normalized.includes("창수")) return "창수면";
  if (normalized.includes("축산")) return "축산면";

  return normalized;
}

interface Zone {
  firestoreId: string;
  id?: number;
  name: string;
  region: string;
  lastVisitedAt?: Timestamp | null;
  lastVisitorName?: string;
}

interface VisitLog {
  id: string;
  zoneId?: string;
  zoneName?: string;
  zoneNumber?: number;
  visitorName?: string;
  createdAt?: Timestamp | null;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function isVisitLocked(
  createdAt: Timestamp | null | undefined,
  visitLockMonths: number
) {
  if (!createdAt?.seconds) return false;
  if (visitLockMonths <= 0) return false;

  const latestDate = new Date(createdAt.seconds * 1000);
  const nextAvailableDate = addMonths(latestDate, visitLockMonths);

  return new Date() < nextAvailableDate;
}

function formatNextAvailableDate(
  createdAt: Timestamp | null | undefined,
  visitLockMonths: number
) {
  if (!createdAt?.seconds) return "";

  return addMonths(
    new Date(createdAt.seconds * 1000),
    visitLockMonths
  ).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function sortVisitLogsDesc(logs: VisitLog[]) {
  return [...logs].sort((a, b) => {
    const aTime = a.createdAt?.seconds ?? 0;
    const bTime = b.createdAt?.seconds ?? 0;

    return bTime - aTime;
  });
}

function getZoneVisitLogs(zone: Zone, logs: VisitLog[]) {
  return sortVisitLogsDesc(
    logs.filter((log) => {
      if (log.zoneId && log.zoneId === zone.firestoreId) return true;
      if (
        typeof log.zoneNumber === "number" &&
        typeof zone.id === "number" &&
        log.zoneNumber === zone.id
      ) {
        return true;
      }
      if (log.zoneName && log.zoneName === zone.name) return true;

      return false;
    })
  );
}

function applyLatestVisitToZones(zones: Zone[], logs: VisitLog[]) {
  return zones
    .map((zone) => {
      const latestLog = getZoneVisitLogs(zone, logs)[0];

      return {
        ...zone,
        lastVisitedAt: latestLog?.createdAt || null,
        lastVisitorName: latestLog?.visitorName,
      };
    })
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
}

function toDateTimeLocalValue(createdAt?: Timestamp | null) {
  const date = createdAt?.seconds
    ? new Date(createdAt.seconds * 1000)
    : new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export default function AdminZonesPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [role, setRole] = useState<"admin" | "leader" | null>(null);

  const [zones, setZones] = useState<Zone[]>([]);
  const [visitLogs, setVisitLogs] = useState<VisitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState("전체");
  const [selectedZones, setSelectedZones] = useState<string[]>([]);
  const [lastSelectedZoneId, setLastSelectedZoneId] = useState<string | null>(
    null
  );
  const [openVisitZoneId, setOpenVisitZoneId] = useState<string | null>(null);
  const [editingVisitLogId, setEditingVisitLogId] = useState<string | null>(
    null
  );
  const [editingVisitorName, setEditingVisitorName] = useState("");
  const [editingDateValue, setEditingDateValue] = useState("");
  const [updatingVisitLogId, setUpdatingVisitLogId] = useState<string | null>(
    null
  );
  const [deletingVisitLogId, setDeletingVisitLogId] = useState<string | null>(
    null
  );

  const [bulkCompleting, setBulkCompleting] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkUpdatingNumbers, setBulkUpdatingNumbers] = useState(false);
  const [bulkVisitorName, setBulkVisitorName] = useState("관리자");
  const [visitLockMonths, setVisitLockMonths] = useState(
    DEFAULT_VISIT_LOCK_MONTHS
  );

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
          const months = Number(
            data.visitLockMonths ?? DEFAULT_VISIT_LOCK_MONTHS
          );

          setVisitLockMonths(
            Number.isFinite(months) && months >= 0
              ? months
              : DEFAULT_VISIT_LOCK_MONTHS
          );

          setBulkVisitorName(data.bulkVisitorName || "관리자");
        }
      } catch (error) {
        console.error("설정 조회 에러:", error);
      }
    }

    if (!checkingAuth && role === "admin") {
      fetchSettings();
    }
  }, [checkingAuth, role]);

  useEffect(() => {
    async function fetchZones() {
      try {
        const querySnapshot = await getDocs(collection(db, "zones"));

        const zoneData = querySnapshot.docs.map((zoneDoc) => ({
          firestoreId: zoneDoc.id,
          ...zoneDoc.data(),
        })) as Zone[];

        const visitQuery = query(
          collection(db, "visitLogs"),
          orderBy("createdAt", "desc")
        );

        const visitSnapshot = await getDocs(visitQuery);

        const allVisitLogs = visitSnapshot.docs.map((visitDoc) => ({
          id: visitDoc.id,
          ...visitDoc.data(),
        })) as VisitLog[];

        setVisitLogs(sortVisitLogsDesc(allVisitLogs));
        setZones(applyLatestVisitToZones(zoneData, allVisitLogs));
      } catch (error) {
        console.error("관리자 구역 조회 에러:", error);
      } finally {
        setLoading(false);
      }
    }

    if (!checkingAuth && role === "admin") {
      fetchZones();
    }
  }, [checkingAuth, role]);

  useEffect(() => {
    if (!loading && zones.length > 0) {
      const lastEditedZoneId = sessionStorage.getItem("lastEditedZoneId");

      if (!lastEditedZoneId) return;

      setTimeout(() => {
        const target = document.getElementById(`zone-${lastEditedZoneId}`);

        if (target) {
          target.scrollIntoView({
            behavior: "auto",
            block: "center",
          });
        }
      }, 300);
    }
  }, [loading, zones]);

  const duplicateZoneIds = useMemo(() => {
    const countMap = new Map<number, number>();

    zones.forEach((zone) => {
      if (typeof zone.id !== "number") return;
      countMap.set(zone.id, (countMap.get(zone.id) || 0) + 1);
    });

    return new Set(
      zones
        .filter(
          (zone) =>
            typeof zone.id === "number" && (countMap.get(zone.id) || 0) > 1
        )
        .map((zone) => zone.firestoreId)
    );
  }, [zones]);

  const duplicateCount = duplicateZoneIds.size;

  const lockedSelectedCount = zones.filter(
    (zone) =>
      selectedZones.includes(zone.firestoreId) &&
      isVisitLocked(zone.lastVisitedAt, visitLockMonths)
  ).length;

  const filteredZones = zones.filter((zone) => {
    return selectedRegion === "전체"
      ? true
      : normalizeRegion(zone.region) === normalizeRegion(selectedRegion);
  });

  const allFilteredSelected =
    filteredZones.length > 0 &&
    filteredZones.every((zone) => selectedZones.includes(zone.firestoreId));

  function formatDate(createdAt?: Timestamp | null) {
    if (!createdAt?.seconds) return "방문 기록 없음";

    return new Date(createdAt.seconds * 1000).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function startEditVisitLog(log: VisitLog) {
    setEditingVisitLogId(log.id);
    setEditingVisitorName(log.visitorName || "");
    setEditingDateValue(toDateTimeLocalValue(log.createdAt));
  }

  function cancelEditVisitLog() {
    setEditingVisitLogId(null);
    setEditingVisitorName("");
    setEditingDateValue("");
  }

  async function handleUpdateVisitLog(log: VisitLog) {
    if (!editingDateValue) {
      alert("수정할 방문 날짜를 선택해주세요.");
      return;
    }

    const nextDate = new Date(editingDateValue);
    const nextVisitorName = editingVisitorName.trim();

    if (Number.isNaN(nextDate.getTime())) {
      alert("올바른 날짜가 아닙니다.");
      return;
    }

    if (!nextVisitorName) {
      alert("방문자 이름을 입력해주세요.");
      return;
    }

    const ok = confirm(
      `방문기록을 수정할까요?\n\n방문자: ${nextVisitorName}\n날짜: ${nextDate.toLocaleString(
        "ko-KR",
        {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        }
      )}`
    );

    if (!ok) return;

    try {
      setUpdatingVisitLogId(log.id);

      const nextTimestamp = Timestamp.fromDate(nextDate);

      await updateDoc(doc(db, "visitLogs", log.id), {
        visitorName: nextVisitorName,
        createdAt: nextTimestamp,
      });

      setVisitLogs((prev) => {
        const nextLogs = sortVisitLogsDesc(
          prev.map((item) =>
            item.id === log.id
              ? {
                  ...item,
                  visitorName: nextVisitorName,
                  createdAt: nextTimestamp,
                }
              : item
          )
        );

        setZones((prevZones) => applyLatestVisitToZones(prevZones, nextLogs));

        return nextLogs;
      });

      cancelEditVisitLog();
      alert("방문기록이 수정되었습니다.");
    } catch (error) {
      console.error("방문기록 수정 에러:", error);
      alert("방문기록 수정 실패");
    } finally {
      setUpdatingVisitLogId(null);
    }
  }

  async function handleDeleteVisitLog(log: VisitLog) {
    const ok = confirm("이 방문기록을 삭제할까요?");

    if (!ok) return;

    try {
      setDeletingVisitLogId(log.id);

      await deleteDoc(doc(db, "visitLogs", log.id));

      setVisitLogs((prev) => {
        const nextLogs = prev.filter((item) => item.id !== log.id);

        setZones((prevZones) => applyLatestVisitToZones(prevZones, nextLogs));

        return nextLogs;
      });

      if (editingVisitLogId === log.id) {
        cancelEditVisitLog();
      }

      alert("방문기록이 삭제되었습니다.");
    } catch (error) {
      console.error("방문기록 삭제 에러:", error);
      alert("방문기록 삭제 실패");
    } finally {
      setDeletingVisitLogId(null);
    }
  }

  function handleZoneSelect(zoneId: string, shiftKey: boolean) {
    if (shiftKey && lastSelectedZoneId) {
      const lastIndex = filteredZones.findIndex(
        (zone) => zone.firestoreId === lastSelectedZoneId
      );

      const currentIndex = filteredZones.findIndex(
        (zone) => zone.firestoreId === zoneId
      );

      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);

        const rangeIds = filteredZones
          .slice(start, end + 1)
          .map((zone) => zone.firestoreId);

        setSelectedZones((prev) => {
          const next = new Set(prev);
          rangeIds.forEach((id) => next.add(id));
          return Array.from(next);
        });

        setLastSelectedZoneId(zoneId);
        return;
      }
    }

    setSelectedZones((prev) =>
      prev.includes(zoneId)
        ? prev.filter((id) => id !== zoneId)
        : [...prev, zoneId]
    );

    setLastSelectedZoneId(zoneId);
  }

  function toggleAllFilteredZones() {
    if (allFilteredSelected) {
      setSelectedZones((prev) =>
        prev.filter(
          (id) => !filteredZones.some((zone) => zone.firestoreId === id)
        )
      );
      setLastSelectedZoneId(null);
    } else {
      setSelectedZones((prev) => {
        const next = new Set(prev);
        filteredZones.forEach((zone) => next.add(zone.firestoreId));
        return Array.from(next);
      });

      setLastSelectedZoneId(
        filteredZones[filteredZones.length - 1]?.firestoreId ?? null
      );
    }
  }

  async function handleBulkVisitComplete() {
    if (selectedZones.length === 0) {
      alert("선택된 구역이 없습니다.");
      return;
    }

    const targetZones = zones.filter((zone) =>
      selectedZones.includes(zone.firestoreId)
    );

    const lockedZones = targetZones.filter((zone) =>
      isVisitLocked(zone.lastVisitedAt, visitLockMonths)
    );

    if (lockedZones.length > 0) {
      const preview = lockedZones
        .slice(0, 5)
        .map(
          (zone) =>
            `${zone.id}번 ${zone.name} - ${formatNextAvailableDate(
              zone.lastVisitedAt,
              visitLockMonths
            )} 이후 가능`
        )
        .join("\n");

      alert(
        `선택한 구역 중 ${lockedZones.length}개는 최근 방문완료 후 ${visitLockMonths}개월이 지나지 않았습니다.\n\n${preview}${
          lockedZones.length > 5 ? "\n..." : ""
        }`
      );

      return;
    }

    const ok = confirm(`${selectedZones.length}개 구역을 방문완료 처리할까요?`);

    if (!ok) return;

    try {
      setBulkCompleting(true);

      await Promise.all(
        targetZones.map((zone) =>
          addDoc(collection(db, "visitLogs"), {
            zoneId: zone.firestoreId,
            zoneName: zone.name,
            zoneNumber: zone.id,
            region: zone.region,
            visitorName: bulkVisitorName,
            createdAt: serverTimestamp(),
          })
        )
      );

      const nowPlaceholder = Timestamp.fromDate(new Date());

      setZones((prev) =>
        prev.map((zone) =>
          selectedZones.includes(zone.firestoreId)
            ? {
                ...zone,
                lastVisitedAt: nowPlaceholder,
                lastVisitorName: bulkVisitorName,
              }
            : zone
        )
      );

      alert("방문완료 처리되었습니다.");
      setSelectedZones([]);
      setLastSelectedZoneId(null);
    } catch (error) {
      console.error("다중 방문완료 에러:", error);
      alert("처리 실패");
    } finally {
      setBulkCompleting(false);
    }
  }

  async function handleBulkUpdateZoneNumbers() {
    if (selectedZones.length === 0) {
      alert("선택된 구역이 없습니다.");
      return;
    }

    const input = prompt(
      "변경할 번호 값을 입력하세요.\n\n예시:\n+3 입력 → 기존 번호에서 3 증가\n-2 입력 → 기존 번호에서 2 감소"
    );

    if (!input) return;

    const changeValue = Number(input.trim());

    if (!Number.isInteger(changeValue)) {
      alert("정수만 입력해주세요. 예: +3, -2, 10");
      return;
    }

    if (changeValue === 0) {
      alert("0은 변경할 수 없습니다.");
      return;
    }

    const targetZones = zones.filter((zone) =>
      selectedZones.includes(zone.firestoreId)
    );

    const invalidZone = targetZones.find(
      (zone) => typeof zone.id !== "number" || Number.isNaN(zone.id)
    );

    if (invalidZone) {
      alert(
        `번호가 없는 구역이 포함되어 있습니다.\n${invalidZone.name} 구역을 먼저 확인해주세요.`
      );
      return;
    }

    const previewText = targetZones
      .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
      .slice(0, 8)
      .map((zone) => `${zone.id}번 → ${(zone.id ?? 0) + changeValue}번`)
      .join("\n");

    const hasMore = targetZones.length > 8;

    const ok = confirm(
      `선택한 ${targetZones.length}개 구역 번호를 ${
        changeValue > 0 ? `+${changeValue}` : changeValue
      } 변경할까요?\n\n${previewText}${hasMore ? "\n..." : ""}`
    );

    if (!ok) return;

    try {
      setBulkUpdatingNumbers(true);

      const batch = writeBatch(db);

      targetZones.forEach((zone) => {
        batch.update(doc(db, "zones", zone.firestoreId), {
          id: (zone.id ?? 0) + changeValue,
        });
      });

      await batch.commit();

      const selectedSet = new Set(selectedZones);

      setZones((prev) =>
        [...prev]
          .map((zone) =>
            selectedSet.has(zone.firestoreId)
              ? {
                  ...zone,
                  id: (zone.id ?? 0) + changeValue,
                }
              : zone
          )
          .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
      );

      alert("구역 번호가 변경되었습니다.");
      setSelectedZones([]);
      setLastSelectedZoneId(null);
    } catch (error) {
      console.error("구역번호 일괄 변경 에러:", error);
      alert("구역번호 변경 실패");
    } finally {
      setBulkUpdatingNumbers(false);
    }
  }

  async function handleBulkDeleteZones() {
    if (selectedZones.length === 0) {
      alert("선택된 구역이 없습니다.");
      return;
    }

    const ok = confirm(
      `선택한 ${selectedZones.length}개 구역을 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`
    );

    if (!ok) return;

    try {
      setBulkDeleting(true);

      const batch = writeBatch(db);

      selectedZones.forEach((zoneId) => {
        batch.delete(doc(db, "zones", zoneId));
      });

      await batch.commit();

      setZones((prev) =>
        prev.filter((zone) => !selectedZones.includes(zone.firestoreId))
      );

      setSelectedZones([]);
      setLastSelectedZoneId(null);

      alert("선택한 구역이 삭제되었습니다.");
    } catch (error) {
      console.error("선택 구역 삭제 에러:", error);
      alert("선택 삭제 실패");
    } finally {
      setBulkDeleting(false);
    }
  }

  async function handleDeleteZone(zone: Zone) {
    const ok = confirm(`${zone.id}번 ${zone.name} 구역을 삭제할까요?`);

    if (!ok) return;

    try {
      await deleteDoc(doc(db, "zones", zone.firestoreId));

      alert("구역이 삭제되었습니다.");

      setZones((prev) =>
        prev.filter((item) => item.firestoreId !== zone.firestoreId)
      );

      setSelectedZones((prev) =>
        prev.filter((id) => id !== zone.firestoreId)
      );

      if (lastSelectedZoneId === zone.firestoreId) {
        setLastSelectedZoneId(null);
      }
    } catch (error) {
      console.error("구역 삭제 에러:", error);
      alert("삭제 실패");
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
    <main className="min-h-screen bg-slate-100 p-3 pb-28 sm:p-4 sm:pb-28">
      <div className="mx-auto max-w-5xl">
        <div className="sticky top-0 z-50 -mx-3 mb-4 bg-slate-100/95 px-3 pb-3 pt-2 backdrop-blur sm:-mx-4 sm:px-4">
          <section className="rounded-3xl bg-slate-900 p-4 text-white shadow sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-slate-300">
                  <MapPinned size={18} />
                  <span className="text-sm">전자구역 관리자</span>
                </div>

                <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
                  구역 관리
                </h1>

                <p className="mt-1 text-sm text-slate-300">
                  구역 목록을 확인하고 수정, 삭제, 방문완료 처리할 수 있습니다.
                </p>
              </div>

              <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                <Link
                  href="/admin"
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-white/95 px-3 py-2 text-xs font-bold text-slate-800 shadow transition hover:bg-white sm:text-sm"
                >
                  <ArrowLeft size={15} />
                  관리자
                </Link>

                <button
                  onClick={handleLogout}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-500 px-3 py-2 text-xs font-bold text-white shadow transition hover:bg-red-600 sm:text-sm"
                >
                  <LogOut size={15} />
                  로그아웃
                </button>
              </div>
            </div>
          </section>

          <section className="mt-3 rounded-3xl border border-slate-200 bg-white p-4 shadow sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <ClipboardList size={19} />
                  <h2 className="text-xl font-bold">구역 목록</h2>
                </div>

                <p className="mt-1 text-sm text-slate-500">
                  Firebase에 저장된 구역 데이터입니다. 방문완료 제한 기간은 현재 {visitLockMonths}개월입니다.
                </p>

                {duplicateCount > 0 && (
                  <div className="mt-3 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    <TriangleAlert size={17} />
                    <span className="font-bold">
                      중복 구역번호 {duplicateCount}개 발견
                    </span>
                  </div>
                )}

                {lockedSelectedCount > 0 && (
                  <div className="mt-2 flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                    <Lock size={17} />
                    <span className="font-bold">
                      선택 구역 중 {lockedSelectedCount}개는 {visitLockMonths}개월 미만으로
                      방문완료 불가
                    </span>
                  </div>
                )}

                <Tabs defaultValue="전체" className="mt-4">
                  <div className="overflow-x-auto pb-1">
                    <TabsList className="flex h-12 min-w-max gap-1 rounded-2xl bg-slate-100 p-1">
                      {regions.map((region) => (
                        <TabsTrigger
                          key={region}
                          value={region}
                          onClick={() => {
                            setSelectedRegion(region);
                            setSelectedZones([]);
                            setLastSelectedZoneId(null);
                          }}
                          className="shrink-0 rounded-xl px-4 text-sm font-semibold"
                        >
                          {region}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>
                </Tabs>
              </div>

              <div className="flex flex-wrap items-center gap-2 lg:max-w-[360px] lg:justify-end">
                <button
                  onClick={toggleAllFilteredZones}
                  disabled={filteredZones.length === 0}
                  className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm disabled:opacity-50"
                >
                  {allFilteredSelected ? "전체 해제" : "전체 선택"}
                </button>

                <button
                  onClick={handleBulkVisitComplete}
                  disabled={bulkCompleting || selectedZones.length === 0}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-50"
                >
                  <CheckCircle2 size={16} />
                  {bulkCompleting ? "처리 중..." : "선택 방문완료"}
                </button>

                <button
                  onClick={handleBulkDeleteZones}
                  disabled={bulkDeleting || selectedZones.length === 0}
                  className="flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-50"
                >
                  <Trash2 size={16} />
                  {bulkDeleting ? "삭제 중..." : "선택 삭제"}
                </button>

                <div className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-500">
                  선택 {selectedZones.length}개
                </div>

                <div className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-500">
                  총 {filteredZones.length}개
                </div>

                <Link
                  href="/admin/zones/new"
                  scroll={false}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow"
                >
                  <Plus size={16} />
                  구역 추가
                </Link>
              </div>
            </div>
          </section>
        </div>

        <section className="rounded-3xl bg-white p-4 shadow sm:p-5">
          {loading ? (
            <div className="rounded-2xl bg-slate-50 p-6 text-slate-500">
              불러오는 중...
            </div>
          ) : filteredZones.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 p-6 text-center text-slate-400">
              표시할 구역이 없습니다.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredZones.map((zone) => {
                const checked = selectedZones.includes(zone.firestoreId);
                const isDuplicate = duplicateZoneIds.has(zone.firestoreId);
                const locked = isVisitLocked(zone.lastVisitedAt, visitLockMonths);
                const zoneVisitLogs = getZoneVisitLogs(zone, visitLogs);
                const visitLogsOpen = openVisitZoneId === zone.firestoreId;

                return (
                  <div
                    key={zone.firestoreId}
                    id={`zone-${zone.firestoreId}`}
                    role="button"
                    tabIndex={0}
                    onClick={(event: MouseEvent<HTMLDivElement>) => {
                      handleZoneSelect(zone.firestoreId, event.shiftKey);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        handleZoneSelect(zone.firestoreId, event.shiftKey);
                      }
                    }}
                    className={`cursor-pointer rounded-2xl px-3 py-2.5 transition sm:px-4 ${
                      isDuplicate
                        ? checked
                          ? "bg-red-50 ring-2 ring-red-300"
                          : "bg-red-50 ring-1 ring-red-200 hover:bg-red-100"
                        : checked
                          ? "bg-emerald-50 ring-2 ring-emerald-200"
                          : "bg-slate-50 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 sm:gap-3">
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        readOnly
                        onClick={(event) => {
                          event.stopPropagation();
                          handleZoneSelect(zone.firestoreId, event.shiftKey);
                        }}
                        className="h-5 w-5 shrink-0 cursor-pointer accent-emerald-600"
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <div
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white ${
                              isDuplicate ? "bg-red-600" : "bg-slate-900"
                            }`}
                          >
                            {zone.id}번
                          </div>

                          <div
                            className={`max-w-full truncate text-sm font-bold sm:text-base ${
                              isDuplicate ? "text-red-900" : "text-slate-900"
                            }`}
                          >
                            {zone.name}
                          </div>

                          {isDuplicate && (
                            <div className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                              <TriangleAlert size={11} />
                              중복번호
                            </div>
                          )}

                          {locked && (
                            <div className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-white">
                              <Lock size={11} />
                              {formatNextAvailableDate(zone.lastVisitedAt, visitLockMonths)} 이후
                              완료 가능
                            </div>
                          )}

                          {zone.lastVisitedAt?.seconds ? (
                            <div className="text-[11px] text-slate-500 sm:text-xs">
                              최근: {zone.lastVisitorName || "이름 없음"} /{" "}
                              {formatDate(zone.lastVisitedAt)}
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-400 sm:text-xs">
                              최근 방문기록 없음
                            </div>
                          )}
                        </div>

                        <div className="mt-0.5 text-xs text-slate-500">
                          {zone.region}
                        </div>
                      </div>
                    </div>

                      <div
                        className="flex shrink-0 gap-1.5"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setOpenVisitZoneId(
                              visitLogsOpen ? null : zone.firestoreId
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white shadow sm:px-3 sm:py-2 sm:text-sm"
                        >
                          기록 {zoneVisitLogs.length}
                          {visitLogsOpen ? (
                            <ChevronUp size={13} />
                          ) : (
                            <ChevronDown size={13} />
                          )}
                        </button>

                        <Link
                          href={`/admin/zones/${zone.firestoreId}`}
                          scroll={false}
                          onClick={() => {
                            sessionStorage.setItem(
                              "lastEditedZoneId",
                              zone.firestoreId
                            );
                          }}
                          className="rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium shadow sm:px-3 sm:py-2 sm:text-sm"
                        >
                          수정
                        </Link>

                        <button
                          onClick={() => handleDeleteZone(zone)}
                          className="rounded-lg bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white shadow sm:px-3 sm:py-2 sm:text-sm"
                        >
                          삭제
                        </button>
                      </div>
                    </div>

                    {visitLogsOpen && (
                      <div
                        className="mt-3 rounded-2xl border border-slate-200 bg-white p-3"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="text-xs font-bold text-slate-700">
                            방문기록 {zoneVisitLogs.length}개
                          </div>
                          <div className="text-[11px] text-slate-400">
                            방문자 이름과 날짜를 수정할 수 있습니다.
                          </div>
                        </div>

                        {zoneVisitLogs.length === 0 ? (
                          <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-400">
                            방문기록이 없습니다.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {zoneVisitLogs.map((log) => {
                              const isEditing = editingVisitLogId === log.id;

                              return (
                                <div
                                  key={log.id}
                                  className="rounded-xl border border-slate-100 bg-slate-50 p-3"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 text-sm">
                                      <div className="flex items-center gap-1 font-semibold text-slate-900">
                                        <User size={14} />
                                        {log.visitorName || "이름 없음"}
                                      </div>

                                      <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                                        <Clock3 size={13} />
                                        {formatDate(log.createdAt)}
                                      </div>
                                    </div>

                                    <div className="flex shrink-0 gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => startEditVisitLog(log)}
                                        disabled={updatingVisitLogId === log.id}
                                        className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                                      >
                                        <Pencil size={13} />
                                        수정
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => handleDeleteVisitLog(log)}
                                        disabled={deletingVisitLogId === log.id}
                                        className="inline-flex items-center gap-1 rounded-lg bg-red-500 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                                      >
                                        <Trash2 size={13} />
                                        {deletingVisitLogId === log.id
                                          ? "삭제 중"
                                          : "삭제"}
                                      </button>
                                    </div>
                                  </div>

                                  {isEditing && (
                                    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
                                      <div className="mb-2 text-xs font-bold text-slate-600">
                                        방문 정보 수정
                                      </div>

                                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                        <input
                                          type="text"
                                          value={editingVisitorName}
                                          onChange={(event) =>
                                            setEditingVisitorName(
                                              event.target.value
                                            )
                                          }
                                          placeholder="방문자 이름"
                                          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-slate-400"
                                        />

                                        <input
                                          type="datetime-local"
                                          value={editingDateValue}
                                          onChange={(event) =>
                                            setEditingDateValue(
                                              event.target.value
                                            )
                                          }
                                          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-slate-400"
                                        />

                                        <div className="flex gap-2">
                                          <button
                                            type="button"
                                            onClick={() =>
                                              handleUpdateVisitLog(log)
                                            }
                                            disabled={
                                              updatingVisitLogId === log.id
                                            }
                                            className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white shadow disabled:opacity-50"
                                          >
                                            <Save size={15} />
                                            {updatingVisitLogId === log.id
                                              ? "저장 중"
                                              : "저장"}
                                          </button>

                                          <button
                                            type="button"
                                            onClick={cancelEditVisitLog}
                                            disabled={
                                              updatingVisitLogId === log.id
                                            }
                                            className="inline-flex items-center gap-1 rounded-xl bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600 shadow disabled:opacity-50"
                                          >
                                            <X size={15} />
                                            취소
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {selectedZones.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 px-3 py-3 shadow-2xl backdrop-blur sm:px-4">
          <div className="mx-auto flex max-w-5xl items-center gap-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-slate-900">
                선택 {selectedZones.length}개
              </div>
              <div className="truncate text-xs text-slate-500">
                Shift + 클릭으로 범위 선택할 수 있습니다.
              </div>
            </div>

            <button
              onClick={handleBulkUpdateZoneNumbers}
              disabled={bulkUpdatingNumbers}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow disabled:opacity-50"
            >
              <Hash size={16} />
              {bulkUpdatingNumbers ? "변경 중..." : "구역번호 변경"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}