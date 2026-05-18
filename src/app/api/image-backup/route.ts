import { NextResponse } from "next/server";
import JSZip from "jszip";

interface ImageBackupRequestItem {
  imageUrl?: unknown;
  fileName?: unknown;
}

function sanitizeFileName(fileName: string) {
  const cleaned = fileName
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned || "구역이미지.jpg";
}

function getBackupZipFileName() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `구역이미지백업_${year}-${month}-${day}.zip`;
}

function makeUniqueFileName(fileName: string, usedFileNames: Set<string>) {
  const safeName = sanitizeFileName(fileName);

  if (!usedFileNames.has(safeName)) {
    usedFileNames.add(safeName);
    return safeName;
  }

  const extensionMatch = safeName.match(/\.[a-zA-Z0-9]{2,5}$/);
  const extension = extensionMatch ? extensionMatch[0] : "";
  const baseName = extension ? safeName.slice(0, -extension.length) : safeName;

  let count = 2;
  let nextName = `${baseName}_${count}${extension}`;

  while (usedFileNames.has(nextName)) {
    count += 1;
    nextName = `${baseName}_${count}${extension}`;
  }

  usedFileNames.add(nextName);
  return nextName;
}

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { images?: ImageBackupRequestItem[] };
    const images = Array.isArray(body.images) ? body.images : [];

    if (images.length === 0) {
      return new NextResponse("다운로드할 이미지가 없습니다.", {
        status: 400,
      });
    }

    if (images.length > 600) {
      return new NextResponse("한 번에 다운로드할 이미지가 너무 많습니다.", {
        status: 400,
      });
    }

    const zip = new JSZip();
    const usedFileNames = new Set<string>();

    for (const image of images) {
      const imageUrl = typeof image.imageUrl === "string" ? image.imageUrl : "";
      const fileName =
        typeof image.fileName === "string" ? image.fileName : "구역이미지.jpg";

      if (!imageUrl.startsWith("http")) continue;

      const response = await fetch(imageUrl);

      if (!response.ok) {
        throw new Error(`이미지 다운로드 실패: ${fileName}`);
      }

      const arrayBuffer = await response.arrayBuffer();

      zip.file(makeUniqueFileName(fileName, usedFileNames), arrayBuffer);
    }

    const zipBuffer = await zip.generateAsync({
      type: "nodebuffer",
      compression: "DEFLATE",
      compressionOptions: {
        level: 6,
      },
    });

    const zipFileName = encodeURIComponent(getBackupZipFileName());

    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename*=UTF-8''${zipFileName}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("이미지 백업 ZIP 생성 에러:", error);

    return new NextResponse("이미지 ZIP 파일을 만들지 못했습니다.", {
      status: 500,
    });
  }
}
