"use client";

import Image from "next/image";

import { useEffect, useState } from "react";

import {
  useParams,
  useRouter,
} from "next/navigation";

import {
  doc,
  getDoc,
  updateDoc,
} from "firebase/firestore";

import {
  ref,
  uploadBytes,
  getDownloadURL,
} from "firebase/storage";

import {
  ArrowLeft,
  Save,
  Image as ImageIcon,
} from "lucide-react";

import Link from "next/link";

import { db, storage } from "@/firebase/firebase";

interface Zone {
  id?: number;
  name: string;
  region: string;
  imageUrl?: string;
}

const regions = [
  "후포면",
  "평해면",
  "온정면",
  "기성면",
  "영해면",
  "병곡면",
  "창수면",
  "축산면",
];

const compressImage = (file: File): Promise<File> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      img.src = e.target?.result as string;
    };

    img.onload = () => {
      const canvas = document.createElement("canvas");

      const maxWidth = 1200;
      const scale = Math.min(maxWidth / img.width, 1);

      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("압축 실패"));
        return;
      }

      ctx.drawImage(
        img,
        0,
        0,
        canvas.width,
        canvas.height
      );

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
        0.7
      );
    };

    img.onerror = reject;
    reader.onerror = reject;

    reader.readAsDataURL(file);
  });
};

export default function AdminZoneEditPage() {
  const params = useParams();
  const router = useRouter();

  const id = params.id as string;

  const [zone, setZone] = useState<Zone | null>(null);
  const [name, setName] = useState("");
  const [region, setRegion] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  async function handleImageUpload(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];

    if (!file) return;

    try {
      setUploading(true);

      const compressedFile = await compressImage(file);

      const storageRef = ref(
        storage,
        `zones/${id}/${Date.now()}_${compressedFile.name}`
      );

      await uploadBytes(storageRef, compressedFile);

      const downloadURL = await getDownloadURL(storageRef);

      setImageUrl(downloadURL);

      alert("이미지 업로드 완료! 저장 버튼을 눌러주세요.");
    } catch (error) {
      console.error("이미지 업로드 에러:", error);
      alert("이미지 업로드 실패");
    } finally {
      setUploading(false);
    }
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
      });

      alert("구역 정보가 저장되었습니다!");

      router.push("/admin");
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
          href="/admin"
          scroll={false}
          className="mb-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium shadow"
        >
          <ArrowLeft size={18} />
          관리자 페이지로 돌아가기
        </Link>

        <section className="rounded-3xl bg-white p-6 shadow">
          <p className="text-sm text-slate-400">
            관리자 구역 수정
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            {zone.id}번 구역 수정
          </h1>

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
                  <option
                    key={regionItem}
                    value={regionItem}
                  >
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
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
              />

              {uploading && (
                <p className="mt-3 text-sm text-slate-500">
                  이미지 업로드 중...
                </p>
              )}

              {imageUrl && (
                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                  <Image
                    src={imageUrl}
                    alt="구역 이미지"
                    width={1200}
                    height={800}
                    className="h-auto w-full max-h-[420px] object-contain"
                  />
                </div>
              )}

              <p className="mt-2 text-xs text-slate-400">
                업로드 후 저장 버튼을 눌러야 반영됩니다.
              </p>
            </div>

            <button
              onClick={handleSave}
              disabled={saving || uploading}
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