"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { onAuthStateChanged, signOut } from "firebase/auth";

import {
  ArrowLeft,
  Clock3,
  Download,
  FolderDown,
  Image as ImageIcon,
  LogOut,
  Save,
  Settings,
  User,
} from "lucide-react";

import { db, auth } from "@/firebase/firebase";
import { Input } from "@/components/ui/input";


interface ImageBackupItem {
  zoneDocId: string;
  zoneNumber: number | null;
  zoneName: string;
  imageUrl: string;
  fileName: string;
  sortNumber: number;
  imageIndex: number;
}

function getZoneNumberValue(value: unknown) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

function sanitizeFileName(fileName: string) {
  const cleaned = fileName
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "구역이미지.jpg";
}

function removeUploadTimestampPrefix(fileName: string) {
  return fileName
    .replace(/^\d{10,}[_-]+/, "")
    .replace(/^\d{10,}/, "");
}

function cleanBackupFileName(fileName: string) {
  return sanitizeFileName(removeUploadTimestampPrefix(fileName));
}

function getFileNameFromUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    const encodedPath = parsedUrl.pathname.split("/o/")[1]?.split("?")[0];

    if (!encodedPath) return null;

    const decodedPath = decodeURIComponent(encodedPath);
    const fileName = decodedPath.split("/").pop();

    return fileName ? cleanBackupFileName(fileName) : null;
  } catch {
    return null;
  }
}

function getExtensionFromFileName(fileName: string) {
  const match = fileName.match(/\.[a-zA-Z0-9]{2,5}$/);

  return match ? match[0] : "";
}

function makeBackupFileName(
  zoneNumber: number | null,
  zoneName: string,
  imageIndex: number,
  imageUrl: string,
) {
  const originalFileName = getFileNameFromUrl(imageUrl);
  const extension = originalFileName
    ? getExtensionFromFileName(originalFileName)
    : "";

  if (originalFileName) {
    return cleanBackupFileName(originalFileName);
  }

  const baseName =
    zoneNumber !== null
      ? `${zoneNumber}.${zoneName || "구역"}`
      : zoneName || "구역이미지";

  const suffix = imageIndex > 1 ? `_${imageIndex}` : "";

  return sanitizeFileName(`${baseName}${suffix}${extension || ".jpg"}`);
}

function collectImageUrls(data: Record<string, unknown>) {
  const candidateFields = [
    data.imageUrl,
    data.imageUrls,
    data.image,
    data.images,
    data.photoUrl,
    data.photoUrls,
  ];

  const urls = candidateFields.flatMap((value) => {
    if (typeof value === "string") return [value];

    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string");
    }

    return [];
  });

  return Array.from(
    new Set(
      urls
        .map((url) => url.trim())
        .filter((url) => url.startsWith("http")),
    ),
  );
}

function downloadFromObjectUrl(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = sanitizeFileName(fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(objectUrl);
}

function downloadSingleImage(url: string, fileName: string) {
  const link = document.createElement("a");

  link.href = url;
  link.download = sanitizeFileName(fileName);
  link.target = "_blank";
  link.rel = "noopener noreferrer";

  document.body.appendChild(link);
  link.click();
  link.remove();
}

export default function AdminSettingsPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [role, setRole] = useState<"admin" | "leader" | null>(null);

  const [loading, setLoading] = useState(true);
  const [bulkVisitorName, setBulkVisitorName] = useState("관리자");
  const [visitLockMonths, setVisitLockMonths] = useState("3");
  const [allowedVisitorNamesText, setAllowedVisitorNamesText] =
    useState("관리자");
  const [saving, setSaving] = useState(false);

  const [imageBackups, setImageBackups] = useState<ImageBackupItem[]>([]);
  const [imageBackupLoading, setImageBackupLoading] = useState(false);
  const [imageBackupLoaded, setImageBackupLoaded] = useState(false);
  const [imageDownloading, setImageDownloading] = useState(false);
  const [imageDownloadProgress, setImageDownloadProgress] = useState("");

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

          const allowedVisitorNames = Array.isArray(data.allowedVisitorNames)
            ? data.allowedVisitorNames
                .map((name: unknown) => String(name).trim())
                .filter(Boolean)
            : [];

          setBulkVisitorName(data.bulkVisitorName || "관리자");
          setVisitLockMonths(String(data.visitLockMonths ?? 3));
          setAllowedVisitorNamesText(
            allowedVisitorNames.length > 0
              ? allowedVisitorNames.join("\n")
              : data.bulkVisitorName || "관리자"
          );
        } else {
          await setDoc(settingsRef, {
            bulkVisitorName: "관리자",
            visitLockMonths: 3,
            allowedVisitorNames: ["관리자"],
          });

          setBulkVisitorName("관리자");
          setVisitLockMonths("3");
          setAllowedVisitorNamesText("관리자");
        }
      } catch (error) {
        console.error("설정 불러오기 에러:", error);
        alert("설정을 불러오지 못했습니다.");
      } finally {
        setLoading(false);
      }
    }

    if (!checkingAuth && role === "admin") {
      fetchSettings();
    }
  }, [checkingAuth, role]);

  async function handleSave() {
    const trimmedName = bulkVisitorName.trim();

    if (!trimmedName) {
      alert("방문완료 기본 이름을 입력해주세요.");
      return;
    }

    const months = Number(visitLockMonths);

    if (!Number.isInteger(months) || months < 0 || months > 24) {
      alert("방문완료 제한 기간은 0개월부터 24개월까지 입력할 수 있습니다.");
      return;
    }

    const allowedVisitorNames = Array.from(
      new Set(
        allowedVisitorNamesText
          .split("\n")
          .map((name) => name.trim())
          .filter(Boolean)
      )
    );

    if (allowedVisitorNames.length === 0) {
      alert("허용할 인도자 이름을 최소 1명 이상 입력해주세요.");
      return;
    }

    if (!allowedVisitorNames.includes(trimmedName)) {
      alert(
        "방문완료 기본 이름은 허용된 인도자 이름 목록에 포함되어야 합니다."
      );
      return;
    }

    try {
      setSaving(true);

      await setDoc(
        doc(db, "settings", "global"),
        {
          bulkVisitorName: trimmedName,
          visitLockMonths: months,
          allowedVisitorNames,
        },
        {
          merge: true,
        }
      );

      setBulkVisitorName(trimmedName);
      setVisitLockMonths(String(months));
      setAllowedVisitorNamesText(allowedVisitorNames.join("\n"));

      alert("설정이 저장되었습니다.");
    } catch (error) {
      console.error("설정 저장 에러:", error);
      alert("설정 저장 실패");
    } finally {
      setSaving(false);
    }
  }


  async function fetchImageBackups() {
    try {
      setImageBackupLoading(true);

      const zoneSnapshot = await getDocs(collection(db, "zones"));

      const backups = zoneSnapshot.docs
        .flatMap((zoneDoc) => {
          const data = zoneDoc.data() as Record<string, unknown>;
          const zoneNumber = getZoneNumberValue(data.id);
          const zoneName = String(data.name ?? "구역").trim();
          const imageUrls = collectImageUrls(data);

          return imageUrls.map((imageUrl, index) => ({
            zoneDocId: zoneDoc.id,
            zoneNumber,
            zoneName,
            imageUrl,
            imageIndex: index + 1,
            sortNumber: zoneNumber ?? Number.MAX_SAFE_INTEGER,
            fileName: cleanBackupFileName(
              makeBackupFileName(zoneNumber, zoneName, index + 1, imageUrl),
            ),
          }));
        })
        .sort((a, b) => {
          if (a.sortNumber !== b.sortNumber) {
            return a.sortNumber - b.sortNumber;
          }

          if (a.zoneName !== b.zoneName) {
            return a.zoneName.localeCompare(b.zoneName, "ko");
          }

          return a.imageIndex - b.imageIndex;
        });

      setImageBackups(backups);
      setImageBackupLoaded(true);
    } catch (error) {
      console.error("이미지 백업 목록 조회 에러:", error);
      alert("이미지 백업 목록을 불러오지 못했습니다.");
    } finally {
      setImageBackupLoading(false);
    }
  }

  async function handleDownloadImage(item: ImageBackupItem) {
    try {
      setImageDownloading(true);
      downloadSingleImage(item.imageUrl, item.fileName);
    } catch (error) {
      console.error("이미지 다운로드 에러:", error);
      alert("이미지를 다운로드하지 못했습니다.");
    } finally {
      setImageDownloading(false);
    }
  }

  async function handleDownloadAllImages() {
    if (imageBackups.length === 0) {
      alert("다운로드할 이미지가 없습니다.");
      return;
    }

    const confirmed = window.confirm(
      `이미지 ${imageBackups.length}개를 ZIP 파일 하나로 다운로드할까요?`,
    );

    if (!confirmed) return;

    try {
      setImageDownloading(true);
      setImageDownloadProgress("서버에서 ZIP 파일 생성 중...");

      const response = await fetch("/api/image-backup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          images: imageBackups.map((item) => ({
            imageUrl: item.imageUrl,
            fileName: item.fileName,
          })),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "ZIP 파일 생성 실패");
      }

      const fileName =
        response.headers
          .get("Content-Disposition")
          ?.match(/filename\\*=UTF-8''(.+)$/)?.[1] || "구역이미지백업.zip";

      const zipBlob = await response.blob();

      downloadFromObjectUrl(zipBlob, decodeURIComponent(fileName));
      setImageDownloadProgress("다운로드 완료");
    } catch (error) {
      console.error("전체 이미지 ZIP 다운로드 에러:", error);
      alert("이미지 ZIP 파일을 만들지 못했습니다.");
    } finally {
      setImageDownloading(false);

      window.setTimeout(() => {
        setImageDownloadProgress("");
      }, 1500);
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

  if (checkingAuth || loading) {
    return (
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-3xl rounded-3xl bg-white p-8 shadow">
          설정 불러오는 중...
        </div>
      </main>
    );
  }

  if (role === "leader") return null;

  return (
    <main className="min-h-screen bg-slate-100 p-3 sm:p-4">
      <div className="mx-auto max-w-3xl">
        <div className="mb-3 flex items-center justify-between gap-2">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-medium shadow"
          >
            <ArrowLeft size={17} />
            관리자 페이지
          </Link>

          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white shadow"
          >
            <LogOut size={16} />
            로그아웃
          </button>
        </div>

        <section className="mb-4 rounded-3xl bg-slate-900 p-5 text-white shadow sm:p-6">
          <div className="flex items-center gap-2 text-slate-300">
            <Settings size={18} />
            <span className="text-sm">전자구역 관리자</span>
          </div>

          <h1 className="mt-3 text-2xl font-bold sm:text-3xl">설정</h1>

          <p className="mt-2 text-sm text-slate-300">
            관리자 기능에 필요한 기본값을 관리합니다.
          </p>
        </section>

        <section className="mb-4 rounded-3xl bg-white p-5 shadow">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100">
              <Clock3 size={22} />
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900">
                방문완료 제한 기간
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                방문완료 후 다시 방문완료를 누를 수 없게 막는 기간입니다.
                메인 화면의 방문할 곳 정렬에도 같이 적용됩니다.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">
              제한 기간
            </label>

            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={24}
                value={visitLockMonths}
                onChange={(e) => setVisitLockMonths(e.target.value)}
                placeholder="예: 3"
                className="h-11 max-w-32 rounded-xl bg-slate-50 text-base"
              />

              <span className="text-sm font-semibold text-slate-700">
                개월
              </span>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              현재 설정:{" "}
              <span className="font-bold text-slate-900">
                {visitLockMonths || "0"}개월
              </span>
              {Number(visitLockMonths) === 0
                ? " · 방문완료 제한 없음"
                : " · 이 기간이 지나야 다시 완료 가능"}
            </div>
          </div>
        </section>

        <section className="mb-4 rounded-3xl bg-white p-5 shadow">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100">
              <User size={22} />
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900">
                허용할 인도자 이름
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                상세페이지에서 구역완료를 누를 때 선택할 수 있는 이름입니다.
                여기에 없는 이름은 방문완료에 사용할 수 없습니다.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">
              인도자 이름 목록
            </label>

            <textarea
              value={allowedVisitorNamesText}
              onChange={(e) => setAllowedVisitorNamesText(e.target.value)}
              placeholder={"예:\n홍길동\n김철수\n이영희"}
              rows={6}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-base outline-none focus:border-slate-400"
            />

            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              한 줄에 한 명씩 입력해주세요. 중복된 이름은 저장할 때 자동으로
              정리됩니다.
            </div>
          </div>
        </section>

        <section className="mb-4 rounded-3xl bg-white p-5 shadow">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100">
              <ImageIcon size={22} />
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900">
                업로드 이미지 백업
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                구역 상세페이지에 업로드된 이미지를 컴퓨터에 저장합니다.
                개별 다운로드와 전체 번호순 다운로드를 사용할 수 있습니다.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={fetchImageBackups}
                disabled={imageBackupLoading || imageDownloading}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm disabled:opacity-50"
              >
                <ImageIcon size={17} />
                {imageBackupLoading ? "목록 불러오는 중..." : "이미지 목록 불러오기"}
              </button>

              <button
                type="button"
                onClick={handleDownloadAllImages}
                disabled={
                  imageDownloading ||
                  imageBackupLoading ||
                  imageBackups.length === 0
                }
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
              >
                <FolderDown size={17} />
                {imageDownloading
                  ? "ZIP 생성 중..."
                  : `전체 ZIP 다운로드 (${imageBackups.length}개)`}
              </button>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              전체 다운로드는 서버에서 ZIP 파일 하나로 만든 뒤 저장됩니다.
              이미지가 많으면 ZIP 파일 생성에 시간이 조금 걸릴 수 있습니다.
            </div>

            {imageDownloadProgress && (
              <div className="rounded-2xl bg-blue-50 p-4 text-sm font-semibold text-blue-700">
                {imageDownloadProgress}
              </div>
            )}

            {imageBackupLoaded && imageBackups.length === 0 && (
              <div className="rounded-2xl bg-amber-50 p-4 text-sm font-medium text-amber-700">
                백업할 업로드 이미지가 없습니다.
              </div>
            )}

            {imageBackups.length > 0 && (
              <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-2xl border border-slate-100 bg-slate-50 p-2">
                {imageBackups.map((item) => (
                  <div
                    key={`${item.zoneDocId}-${item.imageIndex}-${item.imageUrl}`}
                    className="flex items-center gap-3 rounded-xl bg-white p-2 shadow-sm"
                  >
                    <Image
                      src={item.imageUrl}
                      alt={item.fileName}
                      width={56}
                      height={56}
                      className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-slate-100"
                    />

                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-slate-900">
                        {item.zoneNumber !== null
                          ? `${item.zoneNumber}. ${item.zoneName}`
                          : item.zoneName}
                      </div>

                      <div className="mt-0.5 truncate text-xs text-slate-500">
                        {item.fileName}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleDownloadImage(item)}
                      disabled={imageDownloading}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      <Download size={14} />
                      다운로드
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-3xl bg-white p-5 shadow">
          <div className="mb-5 flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100">
              <User size={22} />
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900">
                방문완료 기본 이름
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                구역 관리에서 여러 구역을 선택 방문완료 처리할 때 저장될
                방문자 이름입니다.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-700">
              기본 방문자 이름
            </label>

            <Input
              value={bulkVisitorName}
              onChange={(e) => setBulkVisitorName(e.target.value)}
              placeholder="예: 관리자"
              className="h-11 rounded-xl bg-slate-50 text-base"
            />

            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              현재 저장될 이름:{" "}
              <span className="font-bold text-slate-900">
                {bulkVisitorName.trim() || "입력 필요"}
              </span>
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow disabled:opacity-50 sm:w-auto"
            >
              <Save size={17} />
              {saving ? "저장 중..." : "설정 저장"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}