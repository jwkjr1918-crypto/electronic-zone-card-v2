"use client";

import Image from "next/image";

import { useEffect, useState } from "react";

import Link from "next/link";

import { useParams } from "next/navigation";

import {
  doc,
  getDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";

import {
  ArrowLeft,
  MapPin,
  Clock,
  CheckCircle2,
} from "lucide-react";

import { db } from "@/firebase/firebase";

interface Zone {
  id?: number;
  name: string;
  region: string;
  imageUrl?: string;
}

interface VisitLog {
  id: string;
  zoneId: string;
  zoneName: string;
  zoneNumber?: number;
  createdAt?: {
    seconds: number;
  };
}

export default function ZoneDetailPage() {
  const params = useParams();

  const id = params.id as string;

  const [zone, setZone] = useState<Zone | null>(null);

  const [loading, setLoading] = useState(true);

  const [isImageOpen, setIsImageOpen] = useState(false);

  const [recentVisit, setRecentVisit] =
    useState<VisitLog | null>(null);

  useEffect(() => {
    async function fetchZone() {
      try {
        const docRef = doc(db, "zones", id);

        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data() as Zone;

          setZone(data);
        }
      } catch (error) {
        console.error("구역 조회 에러:", error);
      } finally {
        setLoading(false);
      }
    }

    async function fetchRecentVisit() {
      try {
        const q = query(
          collection(db, "visitLogs"),
          where("zoneId", "==", id),
          orderBy("createdAt", "desc"),
          limit(1)
        );

        const querySnapshot = await getDocs(q);

        const visits = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as VisitLog[];

        if (visits.length > 0) {
          setRecentVisit(visits[0]);
        }
      } catch (error) {
        console.error("방문 기록 조회 에러:", error);
      }
    }

    if (id) {
      fetchZone();
      fetchRecentVisit();
    }
  }, [id]);

  async function handleVisitLog() {
    if (!zone) return;

    try {
      await addDoc(collection(db, "visitLogs"), {
        zoneId: id,
        zoneName: zone.name,
        zoneNumber: zone.id,
        createdAt: serverTimestamp(),
      });

      alert("구역 완료 처리되었습니다!");

      const q = query(
        collection(db, "visitLogs"),
        where("zoneId", "==", id),
        orderBy("createdAt", "desc"),
        limit(1)
      );

      const querySnapshot = await getDocs(q);

      const visits = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as VisitLog[];

      if (visits.length > 0) {
        setRecentVisit(visits[0]);
      }
    } catch (error) {
      console.error("방문 기록 저장 에러:", error);

      alert("저장 실패");
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
          href="/"
          className="mb-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium shadow"
        >
          <ArrowLeft size={18} />
          메인으로 돌아가기
        </Link>

        <section className="overflow-hidden rounded-3xl bg-slate-900 text-white shadow">

          <div className="p-6">

            <p className="text-sm text-slate-300">
              {zone.region}
            </p>

            <h1 className="mt-2 text-4xl font-bold">
              {zone.id}번 {zone.name}
            </h1>

            {zone.imageUrl && (
              <div
                onClick={() => setIsImageOpen(true)}
                className="mt-6 cursor-pointer overflow-hidden rounded-3xl bg-white shadow"
              >
                <Image
                  src={zone.imageUrl}
                  alt={zone.name}
                  width={1200}
                  height={800}
                  className="h-auto w-full max-h-[420px] object-contain"
                />

                <p className="py-2 text-center text-xs text-slate-400">
                  이미지를 누르면 크게 볼 수 있습니다
                </p>
              </div>
            )}

            <div className="mt-6 flex items-center gap-2 text-slate-300">
              <MapPin size={18} />
              <span>{zone.region}</span>
            </div>

            <button
              onClick={handleVisitLog}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 font-semibold text-slate-900 transition hover:bg-slate-200"
            >
              <CheckCircle2 size={20} />
              구역완료
            </button>

          </div>
        </section>

        <section className="mt-6 rounded-3xl bg-white p-6 shadow">

          <div className="flex items-center gap-2">
            <Clock size={18} />
            <h2 className="text-lg font-bold">
              최근 방문 기록
            </h2>
          </div>

          {recentVisit ? (
            <div className="mt-4 rounded-2xl bg-slate-100 p-4">
              <p className="font-semibold">
                {recentVisit.zoneNumber}번 {recentVisit.zoneName}
              </p>

              <p className="mt-1 text-sm text-slate-500">
                {recentVisit.createdAt?.seconds
                  ? new Date(
                      recentVisit.createdAt.seconds * 1000
                    ).toLocaleString()
                  : "시간 정보 없음"}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              아직 방문 기록이 없습니다.
            </p>
          )}

        </section>

      </div>

      {isImageOpen && zone.imageUrl && (
        <div
          onClick={() => setIsImageOpen(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          <button
            onClick={() => setIsImageOpen(false)}
            className="absolute right-4 top-4 rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-900"
          >
            닫기
          </button>

          <Image
            src={zone.imageUrl}
            alt={zone.name}
            width={1600}
            height={1200}
            onClick={(e) => e.stopPropagation()}
            className="h-auto max-h-[90vh] w-auto max-w-full rounded-2xl bg-white object-contain"
          />
        </div>
      )}
    </main>
  );
}