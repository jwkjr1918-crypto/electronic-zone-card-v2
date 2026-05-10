"use client";

import { useEffect, useState } from "react";
import { Search, Shield, ClipboardList } from "lucide-react";
import {
  collection,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";
import Link from "next/link";

import { db } from "@/firebase/firebase";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
}

export default function Home() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [search, setSearch] = useState("");
  const [selectedRegion, setSelectedRegion] = useState("전체");

  useEffect(() => {
    async function fetchZones() {
      try {
        console.log("Firebase 요청 시작");

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

        const latestVisitMap = new Map<string, any>();

        visitSnapshot.docs.forEach((doc) => {
          const log = doc.data();
          const zoneId = log.zoneId;

          if (zoneId && !latestVisitMap.has(zoneId)) {
            latestVisitMap.set(zoneId, log.createdAt);
          }
        });

        const zoneDataWithVisit = zoneData.map((zone) => ({
          ...zone,
          lastVisitedAt: latestVisitMap.get(zone.firestoreId),
        }));

        zoneDataWithVisit.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

        setZones(zoneDataWithVisit);
      } catch (error) {
        console.error("Firebase 에러:", error);
      }
    }

    fetchZones();
  }, []);

  const filteredZones = zones.filter((zone) => {
    const matchesSearch =
      zone.name.includes(search) || String(zone.id).includes(search);

    const matchesRegion =
      selectedRegion === "전체" ? true : zone.region === selectedRegion;

    return matchesSearch && matchesRegion;
  });

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-6xl">
        <div className="mb-4 flex items-center justify-between">
          <Link
  href="/visits"
  className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 shadow"
>
            <ClipboardList size={18} />
            <span className="text-sm font-medium">방문기록</span>
          </Link>

              <Link
                href="/admin"
                className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-white shadow"
              >
                <Shield size={18} />
                <span className="text-sm font-medium">관리자</span>
              </Link>
        </div>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-900">
            전자구역 카드
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            영덕 전자구역 방문 관리 시스템
          </p>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-3 text-slate-400" size={18} />
          <Input
            placeholder="구역 이름 또는 번호 검색"
            className="bg-white pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Tabs defaultValue="전체" className="mb-6">
          <TabsList className="flex w-full overflow-x-auto">
            {regions.map((region) => (
              <TabsTrigger
                key={region}
                value={region}
                onClick={() => setSelectedRegion(region)}
              >
                {region}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="mb-4 text-sm text-slate-500">
          총 {filteredZones.length}개 구역
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredZones.map((zone) => (
            <Link href={`/zone/${zone.firestoreId}`} key={zone.firestoreId}>
              <Card className="cursor-pointer transition hover:shadow-lg">
                <CardContent className="p-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <div className="rounded-full bg-slate-900 px-2 py-1 text-xs font-semibold text-white">
                        {zone.id}.
                      </div>

                      <h3 className="text-lg font-bold text-slate-900">
                        {zone.name}
                      </h3>
                    </div>

                    <p className="mt-1 text-sm text-gray-500">
                      {zone.region}
                    </p>
                  </div>                  

                  <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
                    <div className="text-xs text-slate-400">
                      최근 방문
                    </div>

                    <div className="mt-1 font-medium text-slate-700">
                      {zone.lastVisitedAt?.seconds
                        ? new Date(
                            zone.lastVisitedAt.seconds * 1000
                          ).toLocaleString()
                        : "방문 기록 없음"}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}