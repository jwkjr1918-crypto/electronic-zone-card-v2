"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";

import { onAuthStateChanged } from "firebase/auth";

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
  setDoc,
  deleteDoc,
} from "firebase/firestore";

import {
  ArrowLeft,
  MapPin,
  Clock,
  CheckCircle2,
  X,
  RotateCw,
} from "lucide-react";

import { db, auth } from "@/firebase/firebase";

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
  visitorName?: string;
  region?: string;
  createdAt?: {
    seconds: number;
  };
}

const ACTIVE_VIEW_EXPIRE_MS = 120000;
const ACTIVE_VIEW_HEARTBEAT_MS = 30000;

function getSessionViewId(zoneId: string) {
  const key = "activeZoneViewSessionId";
  const existing = sessionStorage.getItem(key);

  if (existing) {
    return `${zoneId}_${existing}`;
  }

  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;

  sessionStorage.setItem(key, next);

  return `${zoneId}_${next}`;
}

export default function ZoneDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const id = params.id as string;

  const [zone, setZone] = useState<Zone | null>(null);
  const [loading, setLoading] = useState(true);
  const [recentVisit, setRecentVisit] = useState<VisitLog | null>(null);
  const [imageOpen, setImageOpen] = useState(false);

  const fromEvangelist = useMemo(() => {
    if (typeof window === "undefined") return false;

    return (
      searchParams.get("from") === "evangelist" ||
      sessionStorage.getItem("zoneEntryFrom") === "evangelist"
    );
  }, [searchParams]);

  useEffect(() => {
    async function fetchZone() {
      try {
        const docRef = doc(db, "zones", id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setZone(docSnap.data() as Zone);
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

        const visits = querySnapshot.docs.map((visitDoc) => ({
          id: visitDoc.id,
          ...visitDoc.data(),
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

  useEffect(() => {
    if (!id) return;

    let intervalId: number | null = null;
    let activeViewDocId: string | null = null;
    let activeViewRef: ReturnType<typeof doc> | null = null;
    let cleaned = false;

    async function writeActiveView() {
      if (!activeViewRef) return;

      await setDoc(
        activeViewRef,
        {
          zoneId: id,
          enteredAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          expiresAt: Date.now() + ACTIVE_VIEW_EXPIRE_MS,
        },
        { merge: true }
      );
    }

    async function cleanupActiveView() {
      if (cleaned || !activeViewRef) return;

      cleaned = true;

      try {
        await deleteDoc(activeViewRef);
      } catch (error) {
        console.error("방문중 상태 삭제 에러:", error);
      }
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          const userRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userRef);
          const userRole = userSnap.exists() ? userSnap.data().role : null;

          if (userRole === "admin") {
            return;
          }
        }

        activeViewDocId = getSessionViewId(id);
        activeViewRef = doc(db, "activeZoneViews", activeViewDocId);

        await writeActiveView();

        intervalId = window.setInterval(() => {
          writeActiveView().catch((error) => {
            console.error("방문중 상태 갱신 에러:", error);
          });
        }, ACTIVE_VIEW_HEARTBEAT_MS);
      } catch (error) {
        console.error("방문중 상태 등록 에러:", error);
      }
    });

    const handleBeforeUnload = () => {
      if (!activeViewDocId) return;

      const url = `https://firestore.googleapis.com/v1/projects/${
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
      }/databases/(default)/documents/activeZoneViews/${activeViewDocId}`;

      try {
        navigator.sendBeacon?.(url);
      } catch {
        // sendBeacon은 보조 수단입니다. 실제 정리는 expiresAt으로 처리됩니다.
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      unsubscribe();

      if (intervalId) {
        window.clearInterval(intervalId);
      }

      window.removeEventListener("beforeunload", handleBeforeUnload);

      cleanupActiveView();
    };
  }, [id]);

  useEffect(() => {
    if (!imageOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    window.history.pushState({ imageOpen: true }, "");

    const handlePopState = () => {
      setImageOpen(false);
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("popstate", handlePopState);
    };
  }, [imageOpen]);

  function closeImage() {
    setImageOpen(false);
  }

  async function handleVisitLog() {
    if (!zone) return;

    const visitorName = prompt("방문자 이름을 입력해주세요.");

    if (!visitorName || visitorName.trim() === "") {
      alert("이름을 입력해야 방문완료 처리할 수 있습니다.");
      return;
    }

    try {
      await addDoc(collection(db, "visitLogs"), {
        zoneId: id,
        zoneName: zone.name,
        zoneNumber: zone.id,
        region: zone.region,
        visitorName: visitorName.trim(),
        createdAt: serverTimestamp(),
      });

      alert(`${visitorName.trim()}님 방문완료 처리되었습니다!`);

      const q = query(
        collection(db, "visitLogs"),
        where("zoneId", "==", id),
        orderBy("createdAt", "desc"),
        limit(1)
      );

      const querySnapshot = await getDocs(q);

      const visits = querySnapshot.docs.map((visitDoc) => ({
        id: visitDoc.id,
        ...visitDoc.data(),
      })) as VisitLog[];

      if (visits.length > 0) {
        setRecentVisit(visits[0]);
      }

      if (fromEvangelist) {
        sessionStorage.removeItem("zoneEntryFrom");
        router.push("/evangelist");
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
    <>
      <main className="min-h-screen bg-slate-100 p-3 sm:p-4">
        <div className="mx-auto max-w-3xl">
          <Link
            href={fromEvangelist ? "/evangelist" : "/"}
            className="mb-3 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium shadow"
          >
            <ArrowLeft size={18} />
            {fromEvangelist
              ? "번호 입력 화면으로 돌아가기"
              : "메인으로 돌아가기"}
          </Link>

          <section className="rounded-3xl bg-slate-900 text-white shadow">
            <div className="p-4 sm:p-6">
              <p className="text-sm text-slate-300">{zone.region}</p>

              <h1 className="mt-1 text-2xl font-bold sm:text-3xl">
                {zone.id}번 {zone.name}
              </h1>

              {zone.imageUrl && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => setImageOpen(true)}
                    className="block w-full overflow-hidden rounded-2xl bg-black/20"
                  >
                    <Image
                      src={zone.imageUrl}
                      alt={zone.name}
                      width={1600}
                      height={1200}
                      className="h-auto max-h-[72vh] w-full object-contain select-none"
                      priority
                    />
                  </button>

                  <div className="mt-2 flex items-center justify-center gap-1 text-xs text-slate-400">
                    <RotateCw size={13} />
                    이미지를 누르면 회전된 전체화면으로 볼 수 있습니다.
                  </div>
                </div>
              )}

              <div className="mt-5 flex items-center gap-2 text-slate-300">
                <MapPin size={18} />
                <span>{zone.region}</span>
              </div>

              <button
                onClick={handleVisitLog}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 font-semibold text-slate-900 transition hover:bg-slate-200"
              >
                <CheckCircle2 size={20} />
                구역완료
              </button>
            </div>
          </section>

          <section className="mt-5 rounded-3xl bg-white p-5 shadow">
            <div className="flex items-center gap-2">
              <Clock size={18} />
              <h2 className="text-lg font-bold">최근 방문 기록</h2>
            </div>

            {recentVisit ? (
              <div className="mt-4 rounded-2xl bg-slate-100 p-4">
                <p className="font-semibold">
                  {recentVisit.zoneNumber}번 {recentVisit.zoneName}
                </p>

                {recentVisit.visitorName && (
                  <p className="mt-1 text-sm font-medium text-slate-700">
                    방문자: {recentVisit.visitorName}
                  </p>
                )}

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
      </main>

      {imageOpen && zone.imageUrl && (
        <div className="fixed inset-0 z-50 bg-black">
          <button
            type="button"
            onClick={closeImage}
            className="absolute right-4 top-4 z-[60] rounded-full bg-white/20 p-3 text-white backdrop-blur transition hover:bg-white/30 active:scale-95"
            aria-label="이미지 닫기"
          >
            <X size={26} />
          </button>

          <div
            role="button"
            tabIndex={0}
            onClick={closeImage}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                closeImage();
              }
            }}
            className="flex h-dvh w-dvw items-center justify-center overflow-hidden"
          >
            <Image
              src={zone.imageUrl}
              alt={zone.name}
              width={1800}
              height={1400}
              className="rotate-90 object-contain select-none"
              style={{
                width: "100dvh",
                height: "100dvw",
                maxWidth: "100dvh",
                maxHeight: "100dvw",
              }}
              priority
            />
          </div>
        </div>
      )}
    </>
  );
}