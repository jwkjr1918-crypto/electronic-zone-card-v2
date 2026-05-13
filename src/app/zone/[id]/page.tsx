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
  Lock,
  Navigation,
  ExternalLink,
} from "lucide-react";

import { db, auth } from "@/firebase/firebase";

interface Zone {
  id?: number;
  name: string;
  region: string;
  imageUrl?: string;
  addresses?: string[];
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
const VISIT_LOCK_MONTHS = 3;

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

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function formatDateTime(date: Date) {
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(date: Date) {
  return date.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function normalizeAddresses(addresses?: string[]) {
  if (!Array.isArray(addresses)) return [];

  return Array.from(
    new Set(
      addresses
        .map((address) => String(address).trim())
        .filter(Boolean)
    )
  );
}

function getCountyByRegion(region?: string) {
  const normalized = String(region ?? "")
    .trim()
    .replace(/\s/g, "");

  const uljinRegions = [
    "후포면",
    "평해읍",
    "온정면",
    "기성면",
  ];

  return uljinRegions.includes(normalized)
    ? "울진군"
    : "영덕군";
}

function getFullAddress(zone: Zone, address: string) {
  const county = getCountyByRegion(zone.region);

  return `경상북도 ${county} ${zone.region} ${address}`.trim();
}

function getNaverMapUrl(zone: Zone, address: string) {
  return `https://map.naver.com/p/search/${encodeURIComponent(
    getFullAddress(zone, address)
  )}`;
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
  const [savingVisit, setSavingVisit] = useState(false);

  const fromEvangelist = useMemo(() => {
    if (typeof window === "undefined") return false;

    return (
      searchParams.get("from") === "evangelist" ||
      sessionStorage.getItem("zoneEntryFrom") === "evangelist"
    );
  }, [searchParams]);

  const addresses = useMemo(() => {
    return normalizeAddresses(zone?.addresses);
  }, [zone?.addresses]);

  const visitLockInfo = useMemo(() => {
    if (!recentVisit?.createdAt?.seconds) {
      return {
        locked: false,
        nextAvailableDate: null as Date | null,
        remainingDays: 0,
      };
    }

    const latestDate = new Date(recentVisit.createdAt.seconds * 1000);
    const nextAvailableDate = addMonths(latestDate, VISIT_LOCK_MONTHS);
    const now = new Date();
    const locked = now < nextAvailableDate;

    const remainingDays = locked
      ? Math.ceil(
          (nextAvailableDate.getTime() - now.getTime()) /
            (1000 * 60 * 60 * 24)
        )
      : 0;

    return {
      locked,
      nextAvailableDate,
      remainingDays,
    };
  }, [recentVisit]);

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
        // expiresAt으로 자동 만료 처리됩니다.
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

  async function refreshRecentVisit() {
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
  }

  async function handleVisitLog() {
    if (!zone || savingVisit) return;

    if (visitLockInfo.locked && visitLockInfo.nextAvailableDate) {
      alert(
        `최근 방문완료 후 ${VISIT_LOCK_MONTHS}개월이 지나야 다시 완료할 수 있습니다.\n\n다음 완료 가능일: ${formatDate(
          visitLockInfo.nextAvailableDate
        )}`
      );
      return;
    }

    const visitorName = prompt("인도자의 이름을 입력해주세요.");

    if (!visitorName || visitorName.trim() === "") {
      alert("이름을 입력해야 방문완료 처리할 수 있습니다.");
      return;
    }

    try {
      setSavingVisit(true);

      await addDoc(collection(db, "visitLogs"), {
        zoneId: id,
        zoneName: zone.name,
        zoneNumber: zone.id,
        region: zone.region,
        visitorName: visitorName.trim(),
        createdAt: serverTimestamp(),
      });

      alert(`${visitorName.trim()}님 이름으로 방문완료 처리되었습니다!`);

      await refreshRecentVisit();

      if (fromEvangelist) {
        sessionStorage.removeItem("zoneEntryFrom");
        router.push("/evangelist");
      }
    } catch (error) {
      console.error("방문 기록 저장 에러:", error);
      alert("저장 실패");
    } finally {
      setSavingVisit(false);
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

              {addresses.length > 0 && (
                <div className="mt-5 rounded-2xl bg-white/10 p-3">
                  <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
                    <Navigation size={16} />
                    지도 바로가기
                  </div>

                  <div className="space-y-2">
                    {addresses.map((address) => (
                      <div
                        key={address}
                        className="flex items-center gap-2 rounded-xl bg-white p-3 text-slate-900"
                      >
                        <MapPin
                          size={16}
                          className="shrink-0 text-slate-500"
                        />

                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold">
                            {address}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-slate-500">
                            {getFullAddress(zone, address)}
                          </div>
                        </div>

                        <a
                          href={getNaverMapUrl(zone, address)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"
                        >
                          <ExternalLink size={12} />
                          네이버
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-5 flex items-center gap-2 text-slate-300">
                <MapPin size={18} />
                <span>{zone.region}</span>
              </div>

              {visitLockInfo.locked && visitLockInfo.nextAvailableDate && (
                <div className="mt-5 rounded-2xl bg-amber-100 px-4 py-3 text-sm text-amber-900">
                  <div className="flex items-center gap-2 font-bold">
                    <Lock size={16} />
                    3개월 미만 재완료 제한
                  </div>
                  <p className="mt-1">
                    다음 완료 가능일:{" "}
                    <span className="font-bold">
                      {formatDate(visitLockInfo.nextAvailableDate)}
                    </span>
                    {visitLockInfo.remainingDays > 0
                      ? ` (${visitLockInfo.remainingDays}일 남음)`
                      : ""}
                  </p>
                </div>
              )}

              <button
                onClick={handleVisitLog}
                disabled={visitLockInfo.locked || savingVisit}
                className={`mt-6 flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-4 font-semibold transition disabled:cursor-not-allowed ${
                  visitLockInfo.locked
                    ? "bg-slate-500 text-slate-200"
                    : "bg-white text-slate-900 hover:bg-slate-200"
                }`}
              >
                {visitLockInfo.locked ? (
                  <>
                    <Lock size={20} />
                    3개월 이후 완료 가능
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={20} />
                    {savingVisit ? "저장 중..." : "구역완료"}
                  </>
                )}
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
                    ? formatDateTime(
                        new Date(recentVisit.createdAt.seconds * 1000)
                      )
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
