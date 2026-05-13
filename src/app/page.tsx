"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Shield,
  ClipboardList,
  CheckCircle2,
  AlertCircle,
  Eye,
  TriangleAlert,
  Clock3,
} from "lucide-react";

import {
  collection,
  getDocs,
  query,
  orderBy,
  Timestamp,
  onSnapshot,
} from "firebase/firestore";

import Link from "next/link";

import { db } from "@/firebase/firebase";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const HUPO_REGIONS = ["후포면", "평해읍", "온정면", "기성면"];

const YEONGHAE_REGIONS = ["영해면", "병곡면", "창수면", "축산면"];

function normalizeRegion(region?: string) {
  const normalized = String(region ?? "").trim().replace(/\s/g, "");

  if (normalized === "평해") return "평해읍";

  return normalized;
}

const THREE_MONTHS_AGO = () => {
  const date = new Date();
  date.setMonth(date.getMonth() - 3);
  return date;
};

type RegionGroup = "전체" | "후포지역" | "영해지역";

type SortType = "todo" | "number" | "oldest";

interface Zone {
  firestoreId: string;
  id?: number;
  name: string;
  region: string;
  lastVisitedAt?: Timestamp | null;
}

interface VisitLogData {
  zoneId?: string;
  zoneNumber?: number;
  zoneName?: string;
  createdAt?: Timestamp | null;
}

interface ActiveZoneView {
  zoneId?: string;
  expiresAt?: number;
}

function getZoneNumber(zone: Zone) {
  return typeof zone.id === "number" ? zone.id : Number.MAX_SAFE_INTEGER;
}

function getVisitedSeconds(zone: Zone) {
  return zone.lastVisitedAt?.seconds ?? null;
}

function hasVisitRecord(zone: Zone) {
  return Boolean(zone.lastVisitedAt?.seconds);
}

function isThreeMonthsPassed(zone: Zone, cutoffDate: Date) {
  const seconds = getVisitedSeconds(zone);

  if (!seconds) return false;

  return seconds * 1000 <= cutoffDate.getTime();
}

function sortByZoneNumber(a: Zone, b: Zone) {
  const numberDiff = getZoneNumber(a) - getZoneNumber(b);

  if (numberDiff !== 0) return numberDiff;

  return a.name.localeCompare(b.name, "ko");
}

function sortOldestZones(a: Zone, b: Zone) {
  const aVisited = hasVisitRecord(a);
  const bVisited = hasVisitRecord(b);

  if (!aVisited && !bVisited) {
    return sortByZoneNumber(a, b);
  }

  if (!aVisited) return -1;
  if (!bVisited) return 1;

  const visitedDiff =
    (a.lastVisitedAt?.seconds ?? 0) - (b.lastVisitedAt?.seconds ?? 0);

  if (visitedDiff !== 0) return visitedDiff;

  return sortByZoneNumber(a, b);
}

function sortTodoZones(zones: Zone[]) {
  const cutoffDate = THREE_MONTHS_AGO();

  const todoZones = zones.filter(
    (zone) => !hasVisitRecord(zone) || isThreeMonthsPassed(zone, cutoffDate)
  );

  const hasUnvisitedZone = zones.some((zone) => !hasVisitRecord(zone));

  if (hasUnvisitedZone) {
    return [...todoZones].sort(sortByZoneNumber);
  }

  const oldestZone = [...todoZones].sort(sortOldestZones)[0];

  if (!oldestZone || typeof oldestZone.id !== "number") {
    return [...todoZones].sort(sortByZoneNumber);
  }

  const startNumber = oldestZone.id;

  return [...todoZones].sort((a, b) => {
    const aNumber = getZoneNumber(a);
    const bNumber = getZoneNumber(b);

    const aGroup = aNumber >= startNumber ? 0 : 1;
    const bGroup = bNumber >= startNumber ? 0 : 1;

    if (aGroup !== bGroup) return aGroup - bGroup;

    return sortByZoneNumber(a, b);
  });
}

export default function Home() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [activeZoneIds, setActiveZoneIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  const [selectedRegionGroup, setSelectedRegionGroup] =
    useState<RegionGroup>("전체");

  const [selectedSubRegion, setSelectedSubRegion] = useState("전체");

  const [sortType, setSortType] = useState<SortType>("todo");

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

        const latestVisitMap = new Map<string, Timestamp | null>();

        visitSnapshot.docs.forEach((visitDoc) => {
          const log = visitDoc.data() as VisitLogData;

          const keys = [
            log.zoneId ? String(log.zoneId) : null,
            log.zoneNumber ? String(log.zoneNumber) : null,
            log.zoneName ? String(log.zoneName) : null,
          ].filter(Boolean) as string[];

          keys.forEach((key) => {
            if (!latestVisitMap.has(key)) {
              latestVisitMap.set(key, log.createdAt || null);
            }
          });
        });

        const zoneDataWithVisit = zoneData.map((zone) => {
          const latestVisit =
            latestVisitMap.get(zone.firestoreId) ||
            latestVisitMap.get(String(zone.id)) ||
            latestVisitMap.get(zone.name) ||
            null;

          return {
            ...zone,
            lastVisitedAt: latestVisit,
          };
        });

        setZones(zoneDataWithVisit);
      } catch (error) {
        console.error("Firebase 에러:", error);
      }
    }

    fetchZones();
  }, []);

  useEffect(() => {
    let latestViews: ActiveZoneView[] = [];

    function updateActiveZones(views: ActiveZoneView[]) {
      const now = Date.now();

      const ids = Array.from(
        new Set(
          views
            .filter(
              (view) => view.zoneId && view.expiresAt && view.expiresAt > now
            )
            .map((view) => String(view.zoneId))
        )
      );

      setActiveZoneIds(ids);
    }

    const unsubscribe = onSnapshot(
      collection(db, "activeZoneViews"),
      (snapshot) => {
        latestViews = snapshot.docs.map(
          (viewDoc) => viewDoc.data() as ActiveZoneView
        );

        updateActiveZones(latestViews);
      }
    );

    const interval = window.setInterval(() => {
      updateActiveZones(latestViews);
    }, 15000);

    return () => {
      unsubscribe();
      window.clearInterval(interval);
    };
  }, []);

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

  const subRegions = useMemo(() => {
    if (selectedRegionGroup === "후포지역") {
      return ["전체", ...HUPO_REGIONS];
    }

    if (selectedRegionGroup === "영해지역") {
      return ["전체", ...YEONGHAE_REGIONS];
    }

    return ["전체"];
  }, [selectedRegionGroup]);

  const filteredZones = useMemo(() => {
    const baseFilteredZones = zones.filter((zone) => {
      const matchesSearch =
        zone.name.includes(search) || String(zone.id ?? "").includes(search);

      let matchesRegion = true;

      if (selectedRegionGroup === "후포지역") {
        matchesRegion =
          selectedSubRegion === "전체"
            ? HUPO_REGIONS.includes(normalizeRegion(zone.region))
            : normalizeRegion(zone.region) === normalizeRegion(selectedSubRegion);
      }

      if (selectedRegionGroup === "영해지역") {
        matchesRegion =
          selectedSubRegion === "전체"
            ? YEONGHAE_REGIONS.includes(normalizeRegion(zone.region))
            : normalizeRegion(zone.region) === normalizeRegion(selectedSubRegion);
      }

      return matchesSearch && matchesRegion;
    });

    if (sortType === "todo") {
      return sortTodoZones(baseFilteredZones);
    }

    if (sortType === "oldest") {
      return [...baseFilteredZones].sort(sortOldestZones);
    }

    return [...baseFilteredZones].sort(sortByZoneNumber);
  }, [zones, search, selectedRegionGroup, selectedSubRegion, sortType]);

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-3 sm:px-4 sm:py-4">
      <div className="mx-auto max-w-7xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Link
            href="/visits"
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs shadow-sm transition hover:bg-slate-50 sm:text-sm"
          >
            <ClipboardList size={15} />
            <span className="font-medium">방문기록</span>
          </Link>

          <Link
            href="/admin"
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs text-white shadow-sm transition hover:bg-slate-800 sm:text-sm"
          >
            <Shield size={15} />
            <span className="font-medium">관리자</span>
          </Link>
        </div>

        <div className="mb-4">
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">
            후포회중 구역카드
          </h1>

          <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
            후포회중구역 방문 관리 시스템
          </p>
        </div>

        {duplicateCount > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700 shadow-sm">
            <TriangleAlert size={18} />
            <span className="font-semibold">
              중복된 구역번호 {duplicateCount}개 발견
            </span>
          </div>
        )}

        <div className="relative mb-3">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={16}
          />

          <Input
            placeholder="구역 이름 또는 번호 검색"
            className="h-9 rounded-xl bg-white pl-9 text-sm shadow-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="mb-3 grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setSortType("todo")}
            className={`rounded-xl px-3 py-2 text-sm font-bold shadow-sm transition ${
              sortType === "todo"
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600"
            }`}
          >
            방문할 곳
          </button>

          <button
            type="button"
            onClick={() => setSortType("oldest")}
            className={`flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-sm font-bold shadow-sm transition ${
              sortType === "oldest"
                ? "bg-orange-600 text-white"
                : "bg-white text-slate-600"
            }`}
          >
            <Clock3 size={14} />
            오래된 순
          </button>

          <button
            type="button"
            onClick={() => setSortType("number")}
            className={`rounded-xl px-3 py-2 text-sm font-bold shadow-sm transition ${
              sortType === "number"
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600"
            }`}
          >
            모두 표시
          </button>
        </div>

        <Tabs value={selectedRegionGroup} className="mb-2">
          <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl bg-slate-200/70 p-1">
            {["전체", "후포지역", "영해지역"].map((regionGroup) => (
              <TabsTrigger
                key={regionGroup}
                value={regionGroup}
                onClick={() => {
                  setSelectedRegionGroup(regionGroup as RegionGroup);
                  setSelectedSubRegion("전체");
                }}
                className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold"
              >
                {regionGroup}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {selectedRegionGroup !== "전체" && (
          <Tabs value={selectedSubRegion} className="mb-3">
            <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm">
              {subRegions.map((region) => (
                <TabsTrigger
                  key={region}
                  value={region}
                  onClick={() => setSelectedSubRegion(region)}
                  className="shrink-0 rounded-xl px-4 py-2 text-sm font-semibold"
                >
                  {region}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        <div className="mb-3 text-xs text-slate-500 sm:text-sm">
          총{" "}
          <span className="font-semibold text-slate-800">
            {filteredZones.length}
          </span>
          개 구역
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {filteredZones.map((zone) => {
            const isVisited = Boolean(zone.lastVisitedAt?.seconds);

            const isActive = activeZoneIds.includes(zone.firestoreId);

            const isDuplicate = duplicateZoneIds.has(zone.firestoreId);

            return (
              <Link href={`/zone/${zone.firestoreId}`} key={zone.firestoreId}>
                <Card
                  className={`cursor-pointer rounded-xl border shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                    isDuplicate
                      ? "border-red-300 bg-red-50 ring-1 ring-red-100"
                      : isActive
                        ? "border-emerald-300 bg-emerald-50 ring-1 ring-emerald-100"
                        : isVisited
                          ? "border-slate-200 bg-slate-50 opacity-85"
                          : "border-slate-200 bg-white"
                  }`}
                >
                  <CardContent className="p-3 sm:p-3.5">
                    <div className="mb-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <div
                          className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-white sm:text-xs ${
                            isDuplicate
                              ? "bg-red-600"
                              : isActive
                                ? "bg-emerald-600"
                                : isVisited
                                  ? "bg-slate-500"
                                  : "bg-slate-900"
                          }`}
                        >
                          {zone.id}.
                        </div>

                        <div className="min-w-0 flex-1">
                          <h3
                            className={`line-clamp-1 text-sm font-bold sm:text-[15px] ${
                              isDuplicate
                                ? "text-red-900"
                                : isActive
                                  ? "text-emerald-950"
                                  : isVisited
                                    ? "text-slate-700"
                                    : "text-slate-900"
                            }`}
                          >
                            {zone.name}
                          </h3>

                          <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500 sm:text-xs">
                            {zone.region}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1">
                        {isDuplicate && (
                          <div className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-1 text-[10px] font-bold text-white sm:text-[11px]">
                            <TriangleAlert size={11} />
                            중복번호
                          </div>
                        )}

                        <div
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold sm:text-[11px] ${
                            isActive
                              ? "bg-emerald-600 text-white"
                              : isVisited
                                ? "bg-slate-200 text-slate-600"
                                : "bg-blue-50 text-blue-700"
                          }`}
                        >
                          {isActive ? (
                            <>
                              <Eye size={11} />
                              방문중
                            </>
                          ) : isVisited ? (
                            <>
                              <CheckCircle2 size={11} />
                              완료
                            </>
                          ) : (
                            <>
                              <AlertCircle size={11} />
                              방문 필요
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div
                      className={`mt-3 rounded-lg px-2.5 py-2 ${
                        isDuplicate
                          ? "bg-red-100/60"
                          : isActive
                            ? "bg-white/80"
                            : isVisited
                              ? "bg-slate-100"
                              : "bg-slate-50"
                      }`}
                    >
                      <div className="text-[10px] text-slate-400 sm:text-[11px]">
                        최근 방문
                      </div>

                      <div
                        className={`mt-0.5 line-clamp-1 text-[11px] font-medium sm:text-xs ${
                          isDuplicate
                            ? "text-red-800"
                            : isActive
                              ? "text-emerald-800"
                              : isVisited
                                ? "text-slate-700"
                                : "text-slate-600"
                        }`}
                      >
                        {zone.lastVisitedAt?.seconds
                          ? new Date(
                              zone.lastVisitedAt.seconds * 1000
                            ).toLocaleString("ko-KR", {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "방문 기록 없음"}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </main>
  );
}