"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import {
  collection,
  getDocs,
  doc,
  deleteDoc,
} from "firebase/firestore";

import {
  ArrowLeft,
  Settings,
  MapPinned,
  ClipboardList,
  ShieldCheck,
} from "lucide-react";

import {
  onAuthStateChanged,
  signOut,
} from "firebase/auth";

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
}

export default function AdminPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRegion, setSelectedRegion] = useState("전체");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login");
      } else {
        setCheckingAuth(false);
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

        zoneData.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));

        setZones(zoneData);
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
      sessionStorage.setItem(
        "adminScrollY",
        window.scrollY.toString()
      );
    };

    window.addEventListener("scroll", handleScroll);

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  useEffect(() => {
    if (!loading && zones.length > 0) {
      const lastEditedZoneId =
        sessionStorage.getItem("lastEditedZoneId");

      if (!lastEditedZoneId) return;

      setTimeout(() => {
        const target = document.getElementById(
          `zone-${lastEditedZoneId}`
        );

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
    return selectedRegion === "전체"
      ? true
      : zone.region === selectedRegion;
  });

  async function handleDeleteZone(zone: Zone) {
    const ok = confirm(
      `${zone.id}번 ${zone.name} 구역을 삭제할까요?`
    );

    if (!ok) return;

    try {
      await deleteDoc(doc(db, "zones", zone.firestoreId));

      alert("구역이 삭제되었습니다.");

      setZones((prev) =>
        prev.filter((item) => item.firestoreId !== zone.firestoreId)
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

          <h1 className="mt-3 text-3xl font-bold">
            관리자 페이지
          </h1>

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

            <h2 className="text-lg font-bold">
              구역 관리
            </h2>

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

            <h2 className="text-lg font-bold">
              방문 기록 관리
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              저장된 방문 기록을 확인하고 관리할 수 있습니다.
            </p>
          </Link>

          <div className="rounded-2xl bg-white p-5 shadow">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100">
              <Settings size={22} />
            </div>

            <h2 className="text-lg font-bold">
              설정
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              관리자 기능을 단계적으로 추가할 예정입니다.
            </p>
          </div>
        </div>
      </div>

      <section className="mt-6 rounded-3xl bg-white p-5 shadow">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">
              구역 목록
            </h2>

            <p className="text-sm text-slate-500">
              Firebase에 저장된 구역 데이터입니다.
            </p>

            <Tabs defaultValue="전체" className="mt-4">
              <TabsList className="flex h-14 w-full overflow-x-auto rounded-2xl bg-slate-100 p-1">
                {regions.map((region) => (
                  <TabsTrigger
                    key={region}
                    value={region}
                    onClick={() => setSelectedRegion(region)}
                    className="rounded-xl px-5 text-base font-semibold"
                  >
                    {region}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className="flex items-center gap-2">
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
          <div className="space-y-3">
            {filteredZones.map((zone) => (
              <div
                key={zone.firestoreId}
                id={`zone-${zone.firestoreId}`}
                className="flex items-center justify-between rounded-2xl bg-slate-50 p-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <div className="rounded-full bg-slate-900 px-2 py-1 text-xs font-semibold text-white">
                      {zone.id}번
                    </div>

                    <div className="font-bold text-slate-900">
                      {zone.name}
                    </div>
                  </div>

                  <div className="mt-1 text-sm text-slate-500">
                    {zone.region}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Link
                    href={`/admin/zones/${zone.firestoreId}`}
                    scroll={false}
                    onClick={() => {
                      sessionStorage.setItem(
                        "lastEditedZoneId",
                        zone.firestoreId
                      );
                    }}
                    className="rounded-xl bg-white px-3 py-2 text-sm shadow"
                  >
                    수정
                  </Link>

                  <button
                    onClick={() => handleDeleteZone(zone)}
                    className="rounded-xl bg-red-500 px-3 py-2 text-sm text-white shadow"
                  >
                    삭제
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}