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

  return "후포면";
}


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
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function extractAddressesFromText(text: string) {
  const normalizedText = normalizeAddressText(text);
  const found: string[] = [];

  function addAddress(address: string) {
    const cleaned = address
      .replace(/\s*-\s*/g, "-")
      .replace(/\s+/g, " ")
      .trim();

    if (
      cleaned.length >= 4 &&
      /\d/.test(cleaned) &&
      !/^\d/.test(cleaned) &&
      !found.includes(cleaned)
    ) {
      found.push(cleaned);
    }
  }

  function cleanRoadLine(line: string) {
    return line
      .replace(/[^가-힣0-9]/g, "")
      .replace(/대개로/g, "대게로")
      .trim();
  }

  function cleanNumberLine(line: string) {
    return line
      .replace(/[^0-9-]/g, "")
      .replace(/--+/g, "-")
      .replace(/^-|-$/g, "")
      .trim();
  }

  const roadPattern = /^[가-힣0-9]{1,18}(?:대로|번길|길|로)$/;
  const numberPattern = /^\d{1,5}(?:-\d{1,5})?$/;

  const rawLines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const compactLines = rawLines.map((line) => ({
    raw: line,
    road: cleanRoadLine(line),
    number: cleanNumberLine(line),
  }));

  for (let index = 0; index < compactLines.length; index += 1) {
    const current = compactLines[index];

    if (!roadPattern.test(current.road)) continue;

    for (
      let nextIndex = index + 1;
      nextIndex < Math.min(index + 4, compactLines.length);
      nextIndex += 1
    ) {
      const next = compactLines[nextIndex];

      if (numberPattern.test(next.number)) {
        addAddress(`${current.road} ${next.number}`);
        break;
      }
    }
  }

  const singleLineText = normalizedText.replace(/\n/g, " ");
  const compactText = normalizedText.replace(/\s+/g, "");

  const normalPatterns = [
    /[가-힣0-9]{1,18}(?:대로|번길|길|로)\s*\d{1,5}(?:\s*-\s*\d{1,5})?/g,
    /[가-힣0-9]{1,18}(?:리|동)\s*\d{1,5}(?:\s*-\s*\d{1,5})?/g,
  ];

  normalPatterns.forEach((pattern) => {
    const matches = singleLineText.match(pattern) || [];
    matches.forEach(addAddress);
  });

  const compactPatterns = [
    /[가-힣0-9]{1,18}(?:대로|번길|길|로)\d{1,5}(?:-\d{1,5})?/g,
    /[가-힣0-9]{1,18}(?:리|동)\d{1,5}(?:-\d{1,5})?/g,
  ];

  compactPatterns.forEach((pattern) => {
    const matches = compactText.match(pattern) || [];

    matches.forEach((match) => {
      const formatted = match.replace(
        /^([가-힣0-9]+(?:대로|번길|길|로|리|동))(\d.*)$/,
        "$1 $2"
      );

      addAddress(formatted);
    });
  });

  console.log("OCR 원문:", text);
  console.log("OCR 줄 목록:", rawLines);
  console.log("주소 추출 결과:", found);

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

function loadImageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = (error) => {
      URL.revokeObjectURL(objectUrl);
      reject(error);
    };

    image.src = objectUrl;
  });
}

function loadImageFromUrl(imageUrl: string) {
  return new Promise<HTMLImageElement>(async (resolve, reject) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const image = new window.Image();

      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };

      image.onerror = (error) => {
        URL.revokeObjectURL(objectUrl);
        reject(error);
      };

      image.src = objectUrl;
    } catch (error) {
      reject(error);
    }
  });
}

function findDarkTextCrops(image: HTMLImageElement) {
  const maxAnalysisWidth = 1400;
  const analysisScale = Math.min(maxAnalysisWidth / image.naturalWidth, 1);
  const analysisWidth = Math.round(image.naturalWidth * analysisScale);
  const analysisHeight = Math.round(image.naturalHeight * analysisScale);

  const canvas = document.createElement("canvas");
  canvas.width = analysisWidth;
  canvas.height = analysisHeight;

  const ctx = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!ctx) {
    throw new Error("이미지 분석에 실패했습니다.");
  }

  ctx.drawImage(image, 0, 0, analysisWidth, analysisHeight);

  const imageData = ctx.getImageData(0, 0, analysisWidth, analysisHeight);
  const data = imageData.data;
  const cellSize = 24;
  const cols = Math.ceil(analysisWidth / cellSize);
  const rows = Math.ceil(analysisHeight / cellSize);
  const active = Array.from({ length: rows }, () => Array(cols).fill(false));

  for (let y = 0; y < analysisHeight; y += 2) {
    for (let x = 0; x < analysisWidth; x += 2) {
      const index = (y * analysisWidth + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];

      const isDark = r < 90 && g < 90 && b < 90;
      const isBlueTitle = b > 110 && r < 120;
      const isBrownLine = r > 80 && r < 180 && g > 30 && g < 120 && b < 80;

      if (!isDark || isBlueTitle || isBrownLine) continue;

      const col = Math.floor(x / cellSize);
      const row = Math.floor(y / cellSize);

      active[row][col] = true;
    }
  }

  const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
  const boxes: Array<{ x: number; y: number; width: number; height: number }> =
    [];

  const directions = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (!active[row][col] || visited[row][col]) continue;

      const queue = [[row, col]];
      visited[row][col] = true;

      let minRow = row;
      let maxRow = row;
      let minCol = col;
      let maxCol = col;

      while (queue.length > 0) {
        const [currentRow, currentCol] = queue.shift() as number[];

        minRow = Math.min(minRow, currentRow);
        maxRow = Math.max(maxRow, currentRow);
        minCol = Math.min(minCol, currentCol);
        maxCol = Math.max(maxCol, currentCol);

        directions.forEach(([dr, dc]) => {
          const nextRow = currentRow + dr;
          const nextCol = currentCol + dc;

          if (
            nextRow < 0 ||
            nextRow >= rows ||
            nextCol < 0 ||
            nextCol >= cols ||
            visited[nextRow][nextCol] ||
            !active[nextRow][nextCol]
          ) {
            return;
          }

          visited[nextRow][nextCol] = true;
          queue.push([nextRow, nextCol]);
        });
      }

      const padding = 48;
      const x = Math.max(0, minCol * cellSize - padding);
      const y = Math.max(0, minRow * cellSize - padding);
      const width = Math.min(
        analysisWidth - x,
        (maxCol - minCol + 1) * cellSize + padding * 2
      );
      const height = Math.min(
        analysisHeight - y,
        (maxRow - minRow + 1) * cellSize + padding * 2
      );

      if (width < 45 || height < 30) continue;
      if (width > analysisWidth * 0.55 || height > analysisHeight * 0.3) continue;

      boxes.push({ x, y, width, height });
    }
  }

  const expandedBoxes = boxes.map((box) => ({
    x: Math.max(0, box.x - 24),
    y: Math.max(0, box.y - 24),
    width: Math.min(analysisWidth - Math.max(0, box.x - 24), box.width + 48),
    height: Math.min(analysisHeight - Math.max(0, box.y - 24), box.height + 48),
  }));

  const merged: Array<{ x: number; y: number; width: number; height: number }> =
    [];

  function intersectsOrClose(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number }
  ) {
    const gap = 70;

    return !(
      a.x + a.width + gap < b.x ||
      b.x + b.width + gap < a.x ||
      a.y + a.height + gap < b.y ||
      b.y + b.height + gap < a.y
    );
  }

  expandedBoxes.forEach((box) => {
    const targetIndex = merged.findIndex((item) =>
      intersectsOrClose(item, box)
    );

    if (targetIndex === -1) {
      merged.push(box);
      return;
    }

    const target = merged[targetIndex];
    const x1 = Math.min(target.x, box.x);
    const y1 = Math.min(target.y, box.y);
    const x2 = Math.max(target.x + target.width, box.x + box.width);
    const y2 = Math.max(target.y + target.height, box.y + box.height);

    merged[targetIndex] = {
      x: x1,
      y: y1,
      width: x2 - x1,
      height: y2 - y1,
    };
  });

  return merged
    .filter((box) => box.width >= 70 && box.height >= 45)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .slice(0, 24)
    .map((box) => ({
      x: Math.round(box.x / analysisScale),
      y: Math.round(box.y / analysisScale),
      width: Math.round(box.width / analysisScale),
      height: Math.round(box.height / analysisScale),
    }));
}

function createOcrCropDataUrl(
  image: HTMLImageElement,
  crop: { x: number; y: number; width: number; height: number }
) {
  const scale = 4;
  const canvas = document.createElement("canvas");
  canvas.width = crop.width * scale;
  canvas.height = crop.height * scale;

  const ctx = canvas.getContext("2d", {
    willReadFrequently: true,
  });

  if (!ctx) {
    throw new Error("OCR crop 생성에 실패했습니다.");
  }

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;

  for (let index = 0; index < data.length; index += 4) {
    const gray =
      data[index] * 0.299 +
      data[index + 1] * 0.587 +
      data[index + 2] * 0.114;

    const contrast = (gray - 128) * 2.1 + 128;
    const value = contrast > 155 ? 255 : 0;

    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
  }

  ctx.putImageData(imageData, 0, 0);

  return canvas.toDataURL("image/png");
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
  const [selectedOriginalFile, setSelectedOriginalFile] = useState<File | null>(
    null
  );
  const [ocrDebugText, setOcrDebugText] = useState("");
  const [ocrCropCount, setOcrCropCount] = useState(0);

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
          setRegion(normalizeRegion(data.region));
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
      setSelectedOriginalFile(file);
      setOcrDebugText("");
      setOcrCropCount(0);
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
    if (!selectedOriginalFile && !imageUrl) {
      alert("먼저 구역 이미지를 선택하거나 업로드해주세요.");
      return;
    }

    try {
      setExtractingAddresses(true);
      setOcrDebugText("");
      setOcrCropCount(0);
      setOcrProgress("원본 이미지에서 주소 글씨 영역을 찾는 중...");

      const { recognize } = await import("tesseract.js");

      const image = selectedOriginalFile
        ? await loadImageFromFile(selectedOriginalFile)
        : await loadImageFromUrl(imageUrl);

      const crops = findDarkTextCrops(image);

      setOcrCropCount(crops.length);

      if (crops.length === 0) {
        alert(
          "검은 글씨 영역을 찾지 못했습니다.\n이미지의 주소 글씨가 너무 작거나 흐릴 수 있습니다."
        );
        return;
      }

      const allTexts: string[] = [];

      for (let index = 0; index < crops.length; index += 1) {
        setOcrProgress(
          `주소 후보 영역 OCR 중... ${index + 1}/${crops.length}`
        );

        const cropDataUrl = createOcrCropDataUrl(image, crops[index]);

        const result = await recognize(cropDataUrl, "kor+eng", {
          logger: (message) => {
            if (message.status === "recognizing text") {
              const progress = Math.round((message.progress || 0) * 100);
              setOcrProgress(
                `주소 후보 영역 OCR 중... ${index + 1}/${crops.length} (${progress}%)`
              );
            }
          },
        });

        const text = result.data.text.trim();

        if (text) {
          allTexts.push(text);
        }
      }

      const combinedText = allTexts.join("\n");
      const extracted = extractAddressesFromText(combinedText);

      setOcrDebugText(combinedText || "OCR이 읽은 텍스트가 없습니다.");

      if (extracted.length === 0) {
        alert(
          "주소를 자동으로 찾지 못했습니다.\n아래 OCR 원문을 참고해서 주소를 직접 입력해주세요."
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
                주소 추출은 가능하면 방금 선택한 원본 파일 기준으로 실행됩니다.
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
                      (!imageUrl && !selectedOriginalFile) ||
                      uploading ||
                      saving ||
                      extractingAddresses
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow disabled:opacity-50"
                  >
                    {extractingAddresses ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <ScanText size={15} />
                    )}
                    주소 영역 추출
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
                  {ocrCropCount > 0 ? ` / 후보 영역 ${ocrCropCount}개` : ""}
                </div>
              )}

              {ocrDebugText && (
                <details className="mt-3 rounded-2xl bg-white p-3 text-xs text-slate-600 shadow-sm">
                  <summary className="cursor-pointer font-bold text-slate-800">
                    OCR 원문 보기
                  </summary>
                  <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-100 p-3">
                    {ocrDebugText}
                  </pre>
                </details>
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
