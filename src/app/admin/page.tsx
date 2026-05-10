"use client";

import { useEffect, useState } from "react";
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
} from "firebase/firestore";

import {
  ArrowLeft,
  Settings,
  MapPinned,
  ClipboardList,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";

import { onAuthStateChanged, signOut } from "firebase/auth";

import { db, auth } from "@/firebase/firebase";
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

interface Zone {
  firestoreId: string;
  id?: number;
  name: string;
  region: string;
  lastVisitedAt?: any;
  lastVisitorName?: string;
}

interface VisitLog {
  id: string;
  zoneId?: string;
  zoneName?: string;
  zoneNumber?: number;
  visitorName?: string;
  createdAt?: any;
}

export default function AdminPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [role, setRole] = useState<"admin" | "leader" | null>(null);

  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState("전체");
  const [selectedZones, setSelectedZones] = useState<string[]>([]);
  const [bulkCompleting, setBulkCompleting] = useState(false);

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
    async function fetchZones() {
      try {
        const querySnapshot = await getDocs(collection(db, "zones"));

        const zoneData = querySnapshot.docs.map((doc) => ({
          firestoreId: doc.id,
          ...doc.data(),
        })) as Zone[];

        const visitQuery = query(
          collection(db, "visitLogs"),
          orderBy("createdAt", "desc")
        );

        const visitSnapshot = await getDocs(visitQuery);

        const latestVisitMap = new Map<
          string,
          {
            createdAt?: any;
            visitorName?: string;
          }
        >();

        visitSnapshot.docs.forEach((doc) => {
          const log = {
            id: doc.id,
            ...doc.data(),
          } as VisitLog;

          if (log.zoneId && !latestVisitMap.has(log.zoneId)) {
            latestVisitMap.set(log.zoneId, {
              createdAt: log.createdAt,
              visitorName: log.visitorName,
            });
          }
        });

        const zoneDataWithVisit = zoneData.map((zone) => {
          const latestVisit = latestVisitMap.get(zone.firestoreId);

          return {
            ...zone,
            lastVisitedAt: latestVisit?.createdAt,
            lastVisitorName: latestVisit?.visitorName,
          };
        });

        zoneDataWithVisit.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

        setZones(zoneDataWithVisit);
      } catch (error) {
        console.error("관리자 구역 조회 에러:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchZones();
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      sessionStorage.setItem("adminScrollY", window.scrollY.toString());
    };

    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

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

  const filteredZones = zones.filter((zone) => {
    return selectedRegion === "전체" ? true : zone.region === selectedRegion;
  });

  const allFilteredSelected =
    filteredZones.length > 0 &&
    filteredZones.every((zone) => selectedZones.includes(zone.firestoreId));

  function formatDate(createdAt: any) {
    if (!createdAt?.seconds) return "방문 기록 없음";

    return new Date(createdAt.seconds * 1000).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function toggleZone(zoneId: string) {
    setSelectedZones((prev) =>
      prev.includes(zoneId)
        ? prev.filter((id) => id !== zoneId)
        : [...prev, zoneId]
    );
  }

  function toggleAllFilteredZones() {
    if (allFilteredSelected) {
      setSelectedZones((prev) =>
        prev.filter(
          (id) => !filteredZones.some((zone) => zone.firestoreId === id)
        )
      );
    } else {
      setSelectedZones((prev) => {
        const next = new Set(prev);

        filteredZones.forEach((zone) => {
          next.add(zone.firestoreId);
        });

        return Array.from(next);
      });
    }
  }

  async function handleBulkVisitComplete() {
    if (selectedZones.length === 0) {
      alert("선택된 구역이 없습니다.");
      return;
    }

    const ok = confirm(`${selectedZones.length}개 구역을 방문완료 처리할까요?`);

    if (!ok) return;

    try {
      setBulkCompleting(true);

      const targetZones = zones.filter((zone) =>
        selectedZones.includes(zone.firestoreId)
      );

      await Promise.all(
        targetZones.map((zone) =>
          addDoc(collection(db, "visitLogs"), {
            zoneId: zone.firestoreId,
            zoneName: zone.name,
            zoneNumber: zone.id,
            region: zone.region,
            visitorName: "관리자",
            createdAt: serverTimestamp(),
          })
        )
      );

      const nowPlaceholder = {
        seconds: Math.floor(Date.now() / 1000),
      };

      setZones((prev) =>
        prev.map((zone) =>
          selectedZones.includes(zone.firestoreId)
            ? {
                ...zone,
                lastVisitedAt: nowPlaceholder,
                lastVisitorName: "관리자",
              }
            : zone
        )
      );

      alert("방문완료 처리되었습니다.");

      setSelectedZones([]);
    } catch (error) {
      console.error("다중 방문완료 에러:", error);
      alert("처리 실패");
    } finally {
      setBulkCompleting(false);
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

  if (role === "leader") {
    router.push("/visits");
    return null;
  }

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium shadow"
        >
          <ArrowLeft size={18} />
          메인으로 돌아가기
        </Link>

        <section className="mb-6 rounded-3xl bg-slate-900 p-6 text-white shadow">
          <div className="flex items-center gap-2 text-slate-300">
            <ShieldCheck size={18} />
            <span className="text-sm">전자구역 관리자</span>
          </div>

          <h1 className="mt-3 text-3xl font-bold">관리자 페이지</h1>

          <p className="mt-2 text-sm text-slate-300">
            구역 정보와 방문 기록을 관리하는 화면입니다.
          </p>

          <button
            onClick={handleLogout}
            className="mt-5 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-900"
          >
            로그아웃
          </button>
        </section>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl bg-white p-5 shadow">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100">
              <MapPinned size={22} />
            </div>

            <h2 className="text-lg font-bold">구역 관리</h2>

            <p className="mt-2 text-sm text-slate-500">
              구역 목록을 확인하고 수정할 수 있습니다.
            </p>
          </div>

          <Link
            href="/visits"
            className="rounded-2xl bg-white p-5 shadow transition hover:-translate-y-1 hover:shadow-lg"
          >
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100">
              <ClipboardList size={22} />
            </div>

            <h2 className="text-lg font-bold">방문 기록 관리</h2>

            <p className="mt-2 text-sm text-slate-500">
              저장된 방문 기록을 확인하고 관리할 수 있습니다.
            </p>
          </Link>

          <div className="rounded-2xl bg-white p-5 shadow">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100">
              <Settings size={22} />
            </div>

            <h2 className="text-lg font-bold">설정</h2>

            <p className="mt-2 text-sm text-slate-500">
              관리자 기능을 단계적으로 추가할 예정입니다.
            </p>
          </div>
        </div>
      </div>

      <section className="mt-6 rounded-3xl bg-white p-4 shadow sm:p-5">
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-bold">구역 목록</h2>

            <p className="text-sm text-slate-500">
              Firebase에 저장된 구역 데이터입니다.
            </p>

            <Tabs defaultValue="전체" className="mt-4">
              <TabsList className="flex h-12 w-full overflow-x-auto rounded-2xl bg-slate-100 p-1">
                {regions.map((region) => (
                  <TabsTrigger
                    key={region}
                    value={region}
                    onClick={() => setSelectedRegion(region)}
                    className="rounded-xl px-4 text-sm font-semibold"
                  >
                    {region}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={toggleAllFilteredZones}
              className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm"
            >
              {allFilteredSelected ? "전체 해제" : "전체 선택"}
            </button>

            <button
              onClick={handleBulkVisitComplete}
              disabled={bulkCompleting}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-50"
            >
              <CheckCircle2 size={16} />
              {bulkCompleting ? "처리 중..." : "선택 방문완료"}
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
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow"
            >
              구역 추가
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-slate-50 p-6 text-slate-500">
            불러오는 중...
          </div>
        ) : (
          <div className="space-y-2">
            {filteredZones.map((zone) => {
              const checked = selectedZones.includes(zone.firestoreId);

              return (
                <div
                  key={zone.firestoreId}
                  id={`zone-${zone.firestoreId}`}
                  className={`flex items-center justify-between gap-2 rounded-2xl px-3 py-2.5 transition sm:gap-3 sm:px-4 ${
                    checked
                      ? "bg-emerald-50 ring-2 ring-emerald-200"
                      : "bg-slate-50"
                  }`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleZone(zone.firestoreId)}
                      className="h-4 w-4 shrink-0 accent-emerald-600"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <div className="shrink-0 rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                          {zone.id}번
                        </div>

                        <div className="max-w-full truncate text-sm font-bold text-slate-900 sm:text-base">
                          {zone.name}
                        </div>

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

                  <div className="flex shrink-0 gap-1.5">
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
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}