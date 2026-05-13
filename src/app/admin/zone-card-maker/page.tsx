"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";

type LeafletModule = typeof import("leaflet");
type LeafletMap = import("leaflet").Map;
type LeafletLayerGroup = import("leaflet").LayerGroup;

type AddressRow = {
  road: string;
  number: string;
  detail: string;
  memo: string;
  fullAddress: string;
  lat?: number;
  lng?: number;
  status: "pending" | "success" | "fail";
};

type GeocodeResponse = {
  lat?: number;
  lng?: number;
  error?: string;
};

function getCellValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function getConvexHull(points: { lat: number; lng: number }[]) {
  if (points.length <= 2) return points;

  const sorted = [...points].sort((a, b) =>
    a.lng === b.lng ? a.lat - b.lat : a.lng - b.lng
  );

  const cross = (
    o: { lat: number; lng: number },
    a: { lat: number; lng: number },
    b: { lat: number; lng: number }
  ) => (a.lng - o.lng) * (b.lat - o.lat) - (a.lat - o.lat) * (b.lng - o.lng);

  const lower: { lat: number; lng: number }[] = [];

  for (const point of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop();
    }

    lower.push(point);
  }

  const upper: { lat: number; lng: number }[] = [];

  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    const point = sorted[index];

    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop();
    }

    upper.push(point);
  }

  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export default function ZoneCardMakerPage() {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const captureRef = useRef<HTMLDivElement | null>(null);

  const leafletRef = useRef<LeafletModule | null>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const layerGroupRef = useRef<LeafletLayerGroup | null>(null);

  const [title, setTitle] = useState("331. 원황1리 이천 가는 길(30)");
  const [baseAddress, setBaseAddress] = useState("경상북도 영덕군 병곡면 원황리");
  const [rows, setRows] = useState<AddressRow[]>([]);
  const [boundaryPoints, setBoundaryPoints] = useState<{ lat: number; lng: number }[]>([]);
  const [isMapReady, setIsMapReady] = useState(false);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [message, setMessage] = useState("지도를 불러오는 중입니다.");

  const successRows = useMemo(
    () => rows.filter((row) => row.status === "success" && row.lat && row.lng),
    [rows]
  );

  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (!mapRef.current || mapInstanceRef.current) return;

      const leaflet = await import("leaflet");

      if (!isMounted || !mapRef.current) return;

      leafletRef.current = leaflet;

      const map = leaflet
        .map(mapRef.current, {
          zoomControl: true,
          attributionControl: true,
        })
        .setView([36.7275, 129.441], 15);

      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          crossOrigin: true,
          attribution: "&copy; OpenStreetMap contributors",
        })
        .addTo(map);

      const layerGroup = leaflet.layerGroup().addTo(map);

      map.on("click", (event) => {
        setBoundaryPoints((prev) => [
          ...prev,
          {
            lat: event.latlng.lat,
            lng: event.latlng.lng,
          },
        ]);
      });

      mapInstanceRef.current = map;
      layerGroupRef.current = layerGroup;
      setIsMapReady(true);
      setMessage("지도 로딩 완료");
    }

    void initMap();

    return () => {
      isMounted = false;

      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        layerGroupRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const leaflet = leafletRef.current;
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;

    if (!leaflet || !map || !layerGroup) return;

    layerGroup.clearLayers();

    const bounds = leaflet.latLngBounds([]);

    successRows.forEach((row) => {
      if (!row.lat || !row.lng) return;

      const latLng = leaflet.latLng(row.lat, row.lng);
      bounds.extend(latLng);

      leaflet
        .circleMarker(latLng, {
          radius: 6,
          weight: 2,
          color: "#111827",
          fillColor: "#111827",
          fillOpacity: 1,
        })
        .addTo(layerGroup);

      leaflet
        .marker(latLng, {
          icon: leaflet.divIcon({
            className: "",
            html: `<div style="
              padding:2px 6px;
              background:white;
              border:1px solid #111;
              border-radius:4px;
              font-size:15px;
              font-weight:800;
              color:#111;
              white-space:nowrap;
              box-shadow:0 1px 3px rgba(0,0,0,.2);
            ">${row.number}</div>`,
          }),
        })
        .addTo(layerGroup);
    });

    const polygonPoints =
      boundaryPoints.length >= 3
        ? boundaryPoints
        : getConvexHull(
            successRows
              .filter((row) => row.lat && row.lng)
              .map((row) => ({
                lat: row.lat as number,
                lng: row.lng as number,
              }))
          );

    if (polygonPoints.length >= 3) {
      const polygonLatLngs = polygonPoints.map(
        (point) => [point.lat, point.lng] as [number, number]
      );

      leaflet
        .polygon(polygonLatLngs, {
          color: "#c54b13",
          weight: 5,
          fillColor: "#ffffff",
          fillOpacity: 0.03,
        })
        .addTo(layerGroup);

      polygonLatLngs.forEach(([lat, lng]) => {
        bounds.extend([lat, lng]);
      });
    }

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [80, 80] });
    }
  }, [successRows, boundaryPoints]);

  const handleExcelUpload = async (file: File) => {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: "",
    });

    let currentRoad = "";
    const parsed: AddressRow[] = [];

    rawRows.slice(1).forEach((row) => {
      const road = getCellValue(row[0]);
      const number = getCellValue(row[1]);
      const detail = getCellValue(row[2]);
      const memo = getCellValue(row[5]);

      if (road) currentRoad = road;
      if (!number || !currentRoad) return;

      parsed.push({
        road: currentRoad,
        number,
        detail,
        memo,
        fullAddress: `${baseAddress} ${currentRoad} ${number}`,
        status: "pending",
      });
    });

    setRows(parsed);
    setBoundaryPoints([]);
    setMessage(`${parsed.length}개 주소를 읽었습니다. 좌표 변환을 실행하세요.`);
  };

  const geocodeRows = async () => {
    setIsGeocoding(true);
    setMessage("주소 좌표 변환 중...");

    const updated: AddressRow[] = [];

    for (const row of rows) {
      try {
        const response = await fetch("/api/geocode", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            address: row.fullAddress,
            road: row.road,
            number: row.number,
            baseAddress,
          }),
        });

        const data = (await response.json()) as GeocodeResponse;

        if (!response.ok || !data.lat || !data.lng) {
          updated.push({ ...row, status: "fail" });
        } else {
          updated.push({
            ...row,
            lat: data.lat,
            lng: data.lng,
            status: "success",
          });
        }
      } catch {
        updated.push({ ...row, status: "fail" });
      }

      setRows([...updated, ...rows.slice(updated.length)]);

      await new Promise((resolve) => {
        window.setTimeout(resolve, 120);
      });
    }

    const successCount = updated.filter((row) => row.status === "success").length;
    const failCount = updated.filter((row) => row.status === "fail").length;

    setRows(updated);
    setIsGeocoding(false);
    setMessage(`완료: 성공 ${successCount}개 / 실패 ${failCount}개`);
  };

  const makeAutoBoundary = () => {
    const points = successRows
      .filter((row) => row.lat && row.lng)
      .map((row) => ({
        lat: row.lat as number,
        lng: row.lng as number,
      }));

    setBoundaryPoints(getConvexHull(points));
  };

  const savePng = async () => {
    if (!captureRef.current) return;

    const canvas = await html2canvas(captureRef.current, {
      useCORS: true,
      allowTaint: true,
      scale: 2,
    });

    const link = document.createElement("a");
    link.download = `${title}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <main className="min-h-screen bg-slate-100 p-4">
      <div className="mx-auto max-w-7xl space-y-4">
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h1 className="text-xl font-bold">실제 지도 기반 구역카드 제작</h1>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="space-y-1">
              <span className="text-sm font-semibold">구역카드 제목</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-xl border px-3 py-2"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-semibold">주소 앞부분</span>
              <input
                value={baseAddress}
                onChange={(event) => setBaseAddress(event.target.value)}
                className="w-full rounded-xl border px-3 py-2"
                placeholder="예: 경상북도 영덕군 병곡면 원황리"
              />
            </label>

            <label className="space-y-1">
              <span className="text-sm font-semibold">엑셀 업로드</span>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleExcelUpload(file);
                }}
                className="w-full rounded-xl border px-3 py-2"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => void geocodeRows()}
              disabled={!rows.length || isGeocoding || !isMapReady}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              {isGeocoding ? "좌표 변환 중..." : "주소 좌표 자동 변환"}
            </button>

            <button
              onClick={makeAutoBoundary}
              disabled={successRows.length < 3}
              className="rounded-xl bg-orange-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
            >
              자동 경계선 생성
            </button>

            <button
              onClick={() => setBoundaryPoints((prev) => prev.slice(0, -1))}
              className="rounded-xl border bg-white px-4 py-2 text-sm font-bold"
            >
              경계점 하나 취소
            </button>

            <button
              onClick={() => setBoundaryPoints([])}
              className="rounded-xl border bg-white px-4 py-2 text-sm font-bold"
            >
              경계선 초기화
            </button>

            <button
              onClick={() => void savePng()}
              className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-bold text-white"
            >
              PNG 저장
            </button>
          </div>

          {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}

          <p className="mt-2 text-xs text-slate-500">
            지도 위를 클릭하면 수동 경계점을 추가할 수 있습니다. 자동 경계선이 실제 도로 경계와 다르면
            경계선을 초기화한 뒤 직접 찍으면 됩니다.
          </p>
        </section>

        <section
          ref={captureRef}
          className="relative overflow-hidden rounded-2xl border bg-white shadow-sm"
        >
          <div className="absolute left-0 top-0 z-[1000] bg-blue-50/95 px-5 py-3 text-3xl font-black">
            {title}
          </div>

          <div ref={mapRef} className="h-[760px] w-full" />

          <div className="absolute bottom-8 right-8 z-[1000] rounded-2xl border bg-white/95 p-5 text-sm shadow-lg">
            <div className="mb-2 flex items-center gap-2 font-bold">
              <span className="inline-block h-1 w-10 rounded bg-orange-700" />
              구역 경계
            </div>
            <p>대상 주소: {successRows.length}개</p>
            <p>좌표 실패: {rows.filter((row) => row.status === "fail").length}개</p>
          </div>
        </section>

        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="font-bold">주소 목록</h2>

          <div className="mt-3 max-h-72 overflow-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-100">
                <tr>
                  <th className="p-2 text-left">상태</th>
                  <th className="p-2 text-left">주소</th>
                  <th className="p-2 text-left">메모</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.fullAddress}-${index}`} className="border-t">
                    <td className="p-2">
                      {row.status === "success"
                        ? "성공"
                        : row.status === "fail"
                          ? "실패"
                          : "대기"}
                    </td>
                    <td className="p-2">{row.fullAddress}</td>
                    <td className="p-2">{row.memo}</td>
                  </tr>
                ))}

                {!rows.length && (
                  <tr>
                    <td className="p-6 text-center text-slate-500" colSpan={3}>
                      엑셀 파일을 업로드하면 주소 목록이 표시됩니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}