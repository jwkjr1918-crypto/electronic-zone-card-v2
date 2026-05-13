"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

import { doc, getDoc, updateDoc } from "firebase/firestore";

import {
  ref,
  uploadBytes,
  getDownloadURL,
  listAll,
  deleteObject,
} from "firebase/storage";

import {
  ArrowLeft,
  Save,
  Image as ImageIcon,
  MapPin,
  ScanText,
  Loader2,
  RotateCcw,
} from "lucide-react";

import { db, storage } from "@/firebase/firebase";

interface Zone {
  id?: number;
  name: string;
  region: string;
  imageUrl?: string;
  addresses?: string[];
}

const regions = [
  "후포면",
  "평해읍",
  "온정면",
  "기성면",
  "영해면",
  "병곡면",
  "창수면",
  "축산면",
];

const compressImage = (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };

    img.onload = () => {
      const canvas = document.createElement("canvas");

      const maxWidth = 2200;
      const scale = Math.min(maxWidth / img.width, 1);

      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);

      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("압축 실패"));
        return;
      }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("압축 실패"));
            return;
          }

          const compressedFile = new File(
            [blob],
            file.name.replace(/\.[^/.]+$/, ".jpg"),
            {
              type: "image/jpeg",
            }
          );

          resolve(compressedFile);
        },
        "image/jpeg",
        0.88
      );
    };

    img.onerror = reject;
    reader.onerror = reject;

    reader.readAsDataURL(file);
  });
};

function normalizeAddressText(text: string) {
  return text
    .replace(/[|]/g, "1")
    .replace(/[Il]/g, "1")
    .replace(/[０-９]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0)
    )
    .replace(/\s+/g, " ")
    .trim();
}

function extractAddressesFromText(text: string) {
  const normalizedText = normalizeAddressText(text);

  const patterns = [
    /[가-힣0-9]{1,12}(?:대로|번길|길|로)\s*\d{1,4}(?:\s*-\s*\d{1,4})?/g,
    /[가-힣0-9]{1,12}(?:리|동)\s*\d{1,4}(?:\s*-\s*\d{1,4})?/g,
  ];

  const found: string[] = [];

  patterns.forEach((pattern) => {
    const matches = normalizedText.match(pattern) || [];

    matches.forEach((match) => {
      const address = match
        .replace(/\s*-\s*/g, "-")
        .replace(/\s+/g, " ")
        .trim();

      if (
        address.length >= 4 &&
        /\d/.test(address) &&
        !/^\d/.test(address) &&
        !found.includes(address)
      ) {
        found.push(address);
      }
    });
  });

  return found;
}

function addressesToTextarea(addresses?: string[]) {
  if (!Array.isArray(addresses)) return "";

  return addresses
    .map((address) => String(address).trim())
    .filter(Boolean)
    .join("\n");
}

function textareaToAddresses(value: string) {
  return Array.from(
    new Set(
      value
        .split("\n")
        .map((address) => address.trim())
        .filter(Boolean)
    )
  );
}

async function imageUrlToPreprocessedDataUrl(imageUrl: string) {
  const response = await fetch(imageUrl);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new window.Image();

      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = objectUrl;
    });

    const scale = 3;
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;

    const ctx = canvas.getContext("2d", {
      willReadFrequently: true,
    });

    if (!ctx) {
      throw new Error("이미지 전처리에 실패했습니다.");
    }

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    for (let index = 0; index < data.length; index += 4) {
      const gray =
        data[index] * 0.299 +
        data[index + 1] * 0.587 +
        data[index + 2] * 0.114;

      const contrast = (gray - 128) * 1.8 + 128;
      const value = contrast > 170 ? 255 : 0;

      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
    }

    ctx.putImageData(imageData, 0, 0);

    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export default function AdminZoneEditPage() {
  const params = useParams();
  const router = useRouter();

  const id = params.id as string;

  const [zone, setZone] = useState<Zone | null>(null);
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [addressText, setAddressText] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extractingAddresses, setExtractingAddresses] = useState(false);
  const [ocrProgress, setOcrProgress] = useState("");

  const addressPreview = useMemo(() => {
    return textareaToAddresses(addressText);
  }, [addressText]);

  useEffect(() => {
    async function fetchZone() {
      try {
        const docRef = doc(db, "zones", id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data() as Zone;

          setZone(data);
          setName(data.name || "");
          setRegion(data.region || "");
          setImageUrl(data.imageUrl || "");
          setAddressText(addressesToTextarea(data.addresses));
        }
      } catch (error) {
        console.error("구역 조회 에러:", error);
      } finally {
        setLoading(false);
      }
    }

    if (id) {
      fetchZone();
    }
  }, [id]);

  async function deleteExistingZoneImages() {
    const folderRef = ref(storage, `zones/${id}`);

    try {
      const existingFiles = await listAll(folderRef);

      await Promise.all(
        existingFiles.items.map(async (itemRef) => {
          try {
            await deleteObject(itemRef);
          } catch (error) {
            console.error("기존 이미지 삭제 실패:", error);
          }
        })
      );
    } catch (error) {
      console.error("기존 이미지 조회 실패:", error);
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];

    if (!file) return;

    try {
      setUploading(true);

      const compressedFile = await compressImage(file);

      await deleteExistingZoneImages();

      const storageRef = ref(
        storage,
        `zones/${id}/${Date.now()}_${compressedFile.name}`
      );

      await uploadBytes(storageRef, compressedFile);

      const downloadURL = await getDownloadURL(storageRef);

      setImageUrl(downloadURL);

      alert(
        "기존 이미지를 삭제하고 새 이미지로 교체했습니다. 필요하면 주소 자동 추출 후 저장 버튼을 눌러주세요."
      );
    } catch (error) {
      console.error("이미지 업로드 에러:", error);
      alert("이미지 업로드 실패");
    } finally {
      setUploading(false);
    }
  }

  async function handleExtractAddresses() {
    if (!imageUrl) {
      alert("먼저 구역 이미지를 업로드해주세요.");
      return;
    }

    try {
      setExtractingAddresses(true);
      setOcrProgress("이미지를 OCR용으로 전처리 중...");

      const { recognize } = await import("tesseract.js");
      const preprocessedDataUrl = await imageUrlToPreprocessedDataUrl(imageUrl);

      setOcrProgress("주소 텍스트를 읽는 중...");

      const result = await recognize(preprocessedDataUrl, "kor+eng", {
        logger: (message) => {
          if (message.status === "recognizing text") {
            const progress = Math.round((message.progress || 0) * 100);
            setOcrProgress(`주소 텍스트를 읽는 중... ${progress}%`);
          }
        },
      });

      const extracted = extractAddressesFromText(result.data.text);

      if (extracted.length === 0) {
        alert(
          "주소를 자동으로 찾지 못했습니다.\n이미지 품질이나 글자 크기에 따라 실패할 수 있으니 주소를 직접 입력해주세요."
        );
        return;
      }

      const currentAddresses = textareaToAddresses(addressText);
      const merged = Array.from(new Set([...currentAddresses, ...extracted]));

      setAddressText(merged.join("\n"));

      alert(
        `주소 후보 ${extracted.length}개를 찾았습니다.\n내용을 확인한 뒤 저장해주세요.`
      );
    } catch (error) {
      console.error("주소 OCR 추출 에러:", error);
      alert("주소 자동 추출 실패");
    } finally {
      setExtractingAddresses(false);
      setOcrProgress("");
    }
  }

  function handleClearAddresses() {
    const ok = confirm("입력된 주소 목록을 모두 비울까요?");

    if (!ok) return;

    setAddressText("");
  }

  async function handleSave() {
    if (!zone) return;

    try {
      setSaving(true);

      const docRef = doc(db, "zones", id);

      await updateDoc(docRef, {
        name,
        region,
        imageUrl,
        addresses: textareaToAddresses(addressText),
      });

      alert("구역 정보가 저장되었습니다!");

      router.push("/admin/zones");
    } catch (error) {
      console.error("구역 저장 에러:", error);
      alert("저장 실패");
    } finally {
      setSaving(false);
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
          href="/admin/zones"
          scroll={false}
          className="mb-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium shadow"
        >
          <ArrowLeft size={18} />
          구역관리로 돌아가기
        </Link>

        <section className="rounded-3xl bg-white p-6 shadow">
          <p className="text-sm text-slate-400">관리자 구역 수정</p>

          <h1 className="mt-2 text-3xl font-bold">{zone.id}번 구역 수정</h1>

          <div className="mt-8 space-y-6">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                구역 이름
              </label>

              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none"
                placeholder="구역 이름 입력"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                지역
              </label>

              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none"
              >
                {regions.map((regionItem) => (
                  <option key={regionItem} value={regionItem}>
                    {regionItem}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
                <ImageIcon size={18} />
                구역 이미지
              </label>

              <input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={uploading || saving || extractingAddresses}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 disabled:opacity-50"
              />

              {uploading && (
                <p className="mt-3 text-sm text-slate-500">
                  기존 이미지를 삭제하고 새 이미지를 업로드 중...
                </p>
              )}

              {imageUrl && (
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <Image
                    src={imageUrl}
                    alt="구역 이미지"
                    width={1600}
                    height={1000}
                    className="h-auto max-h-[520px] w-full object-contain"
                  />
                </div>
              )}

              <p className="mt-2 text-xs text-slate-400">
                새 이미지는 최대 가로 2200px, JPEG 품질 0.88로 압축됩니다.
                업로드 후 저장 버튼을 눌러야 구역 정보에 최종 반영됩니다.
              </p>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <label className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    <MapPin size={18} />
                    지도 주소 목록
                  </label>

                  <p className="mt-1 text-xs text-slate-500">
                    한 줄에 주소 하나씩 입력하세요. 상세페이지에서 지도 버튼으로 표시됩니다.
                  </p>
                </div>

                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={handleExtractAddresses}
                    disabled={
                      !imageUrl || uploading || saving || extractingAddresses
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow disabled:opacity-50"
                  >
                    {extractingAddresses ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <ScanText size={15} />
                    )}
                    주소 자동 추출
                  </button>

                  <button
                    type="button"
                    onClick={handleClearAddresses}
                    disabled={saving || extractingAddresses || !addressText}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow disabled:opacity-50"
                  >
                    <RotateCcw size={15} />
                    비우기
                  </button>
                </div>
              </div>

              {ocrProgress && (
                <div className="mt-3 rounded-2xl bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">
                  {ocrProgress}
                </div>
              )}

              <textarea
                value={addressText}
                onChange={(event) => setAddressText(event.target.value)}
                disabled={saving || extractingAddresses}
                rows={6}
                className="mt-4 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none disabled:opacity-50"
                placeholder={`예시:\n금천3길 121\n금천3길 96\n금천3길 118-14`}
              />

              {addressPreview.length > 0 && (
                <div className="mt-3">
                  <div className="mb-2 text-xs font-semibold text-slate-500">
                    저장될 주소 {addressPreview.length}개
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {addressPreview.map((address) => (
                      <span
                        key={address}
                        className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-bold text-white"
                      >
                        {address}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleSave}
              disabled={saving || uploading || extractingAddresses}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 px-5 py-4 text-white hover:bg-slate-800 disabled:opacity-50"
            >
              <Save size={18} />
              {saving ? "저장 중..." : "구역 정보 저장"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
