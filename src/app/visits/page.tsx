"use client";

import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { db, auth } from "@/firebase/firebase";

import { useEffect, useMemo, useRef, useState } from "react";

import Link from "next/link";
import PizZip from "pizzip";
import { saveAs } from "file-saver";

import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  deleteDoc,
  writeBatch,
  getDoc,
  updateDoc,
  Timestamp,
} from "firebase/firestore";

import {
  ArrowLeft,
  Clock3,
  MapPin,
  Trash2,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  LogOut,
  User,
  FileText,
  Pencil,
  Save,
  X,
} from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

const regions = [
  "전체",
  "후포면",
  "평해읍",
  "온정면",
  "기성면",
  "영해면",
  "병곡면",
  "창수면",
  "축산면",
];

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const TOTAL_ZONE_COUNT = 484;
const WORD_TEMPLATE_PATH = "/templates/구역배정기록 S-13_KO.docx";
const VALID_VISIT_INTERVAL_MONTHS = 3;

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

  return normalized;
}

interface VisitLog {
  id: string;
  zoneId?: string;
  zoneNumber?: number;
  zoneName: string;
  region: string;
  visitorName?: string;
  createdAt?: Timestamp | null;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function isAtLeastMonthsAfter(target: Date, base: Date, months: number) {
  return target.getTime() >= addMonths(base, months).getTime();
}

function sortVisitLogsDesc(logs: VisitLog[]) {
  return [...logs].sort((a, b) => {
    const aTime = a.createdAt?.seconds ?? 0;
    const bTime = b.createdAt?.seconds ?? 0;

    return bTime - aTime;
  });
}

function toDateTimeLocalValue(createdAt?: Timestamp | null) {
  const date = createdAt?.seconds
    ? new Date(createdAt.seconds * 1000)
    : new Date();

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

export default function VisitsPage() {
  const lastSelectedLogIdRef = useRef<string | null>(null);

  const [visitLogs, setVisitLogs] = useState<VisitLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [openZone, setOpenZone] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [updatingSelectedLogs, setUpdatingSelectedLogs] = useState(false);
  const [selectedLogs, setSelectedLogs] = useState<string[]>([]);
  const [generatingWord, setGeneratingWord] = useState(false);

  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editingDateValue, setEditingDateValue] = useState("");
  const [editingVisitorName, setEditingVisitorName] = useState("");
  const [updatingDateId, setUpdatingDateId] = useState<string | null>(null);

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [role, setRole] = useState<"admin" | "leader" | null>(null);
  const [selectedRegion, setSelectedRegion] = useState("전체");

  const router = useRouter();

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
          await signOut(auth);
          router.push("/login");
          return;
        }

        const userRole = userSnap.data().role;

        setRole(userRole);
        setCheckingAuth(false);
      } catch (error) {
        console.error("권한 확인 에러:", error);
        router.push("/login");
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    async function fetchVisitLogs() {
      try {
        const q = query(
          collection(db, "visitLogs"),
          orderBy("createdAt", "desc"),
        );

        const querySnapshot = await getDocs(q);

        const logs = querySnapshot.docs.map((visitDoc) => ({
          id: visitDoc.id,
          ...visitDoc.data(),
        })) as VisitLog[];

        setVisitLogs(sortVisitLogsDesc(logs));
      } catch (error) {
        console.error("방문 기록 조회 에러:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchVisitLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    return visitLogs.filter((log) => {
      return selectedRegion === "전체"
        ? true
        : normalizeRegion(log.region) === normalizeRegion(selectedRegion);
    });
  }, [visitLogs, selectedRegion]);

  const groupedLogs = useMemo(() => {
    const map = new Map<string, VisitLog[]>();

    filteredLogs.forEach((log) => {
      const key = log.zoneName || log.zoneId || log.id;

      if (!map.has(key)) {
        map.set(key, []);
      }

      map.get(key)?.push(log);
    });

    return Array.from(map.entries()).map(([zoneName, logs]) => ({
      zoneName,
      logs,
      latestLog: logs[0],
    }));
  }, [filteredLogs]);

  const orderedLatestLogIds = useMemo(() => {
    return groupedLogs
      .map((group) => group.latestLog?.id)
      .filter(Boolean) as string[];
  }, [groupedLogs]);

  const allFilteredSelected =
    orderedLatestLogIds.length > 0 &&
    orderedLatestLogIds.every((id) => selectedLogs.includes(id));

  function toggleLog(logId: string, shiftKey = false, nextChecked?: boolean) {
    const previousLogId = lastSelectedLogIdRef.current;
    lastSelectedLogIdRef.current = logId;

    if (shiftKey && previousLogId && previousLogId !== logId) {
      const previousIndex = orderedLatestLogIds.indexOf(previousLogId);
      const currentIndex = orderedLatestLogIds.indexOf(logId);

      if (previousIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(previousIndex, currentIndex);
        const end = Math.max(previousIndex, currentIndex);
        const rangeIds = orderedLatestLogIds.slice(start, end + 1);

        setSelectedLogs((prev) => {
          if (nextChecked === false) {
            return prev.filter((id) => !rangeIds.includes(id));
          }

          const next = new Set(prev);

          rangeIds.forEach((id) => {
            next.add(id);
          });

          return Array.from(next);
        });

        return;
      }
    }

    setSelectedLogs((prev) => {
      const shouldCheck = nextChecked ?? !prev.includes(logId);

      if (!shouldCheck) {
        return prev.filter((id) => id !== logId);
      }

      if (prev.includes(logId)) {
        return prev;
      }

      return [...prev, logId];
    });
  }

  function toggleLatestLog(logId: string, shiftKey = false, nextChecked?: boolean) {
    toggleLog(logId, shiftKey, nextChecked);
  }

  function toggleAllFilteredLogs() {
    if (allFilteredSelected) {
      setSelectedLogs((prev) =>
        prev.filter((id) => !orderedLatestLogIds.includes(id))
      );
    } else {
      setSelectedLogs((prev) => {
        const next = new Set(prev);

        orderedLatestLogIds.forEach((id) => {
          next.add(id);
        });

        return Array.from(next);
      });
    }
  }

  function startEditVisitDate(log: VisitLog) {
    setEditingLogId(log.id);
    setEditingDateValue(toDateTimeLocalValue(log.createdAt));
    setEditingVisitorName(log.visitorName || "");
  }

  function cancelEditVisitDate() {
    setEditingLogId(null);
    setEditingDateValue("");
    setEditingVisitorName("");
  }

  async function handleUpdateVisitDate(log: VisitLog) {
    if (!editingDateValue) {
      alert("수정할 방문 날짜를 선택해주세요.");
      return;
    }

    const nextDate = new Date(editingDateValue);
    const nextVisitorName = editingVisitorName.trim();

    if (Number.isNaN(nextDate.getTime())) {
      alert("올바른 날짜가 아닙니다.");
      return;
    }

    if (!nextVisitorName) {
      alert("방문자 이름을 입력해주세요.");
      return;
    }

    const ok = confirm(
      `${log.zoneName} 방문완료 날짜를 수정할까요?\n\n${nextDate.toLocaleString(
        "ko-KR",
        {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        },
      )}`,
    );

    if (!ok) return;

    try {
      setUpdatingDateId(log.id);

      const nextTimestamp = Timestamp.fromDate(nextDate);

      await updateDoc(doc(db, "visitLogs", log.id), {
        createdAt: nextTimestamp,
        visitorName: nextVisitorName,
      });

      setVisitLogs((prev) =>
        sortVisitLogsDesc(
          prev.map((item) =>
            item.id === log.id
              ? {
                  ...item,
                  createdAt: nextTimestamp,
                  visitorName: nextVisitorName,
                }
              : item,
          ),
        ),
      );

      setEditingLogId(null);
      setEditingDateValue("");
      setEditingVisitorName("");

      alert("방문 정보가 수정되었습니다.");
    } catch (error) {
      console.error("방문완료 날짜 수정 에러:", error);
      alert("방문완료 날짜 수정 실패");
    } finally {
      setUpdatingDateId(null);
    }
  }

  async function handleDeleteLog(log: VisitLog) {
    const ok = confirm(`${log.zoneName} 방문 기록 1개를 삭제할까요?`);

    if (!ok) return;

    try {
      setDeletingId(log.id);

      await deleteDoc(doc(db, "visitLogs", log.id));

      setVisitLogs((prev) => prev.filter((item) => item.id !== log.id));

      setSelectedLogs((prev) => prev.filter((id) => id !== log.id));
    } catch (error) {
      console.error("방문 기록 삭제 에러:", error);
      alert("삭제 실패");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleDeleteSelectedLogs() {
    if (selectedLogs.length === 0) {
      alert("선택된 방문 기록이 없습니다.");
      return;
    }

    const ok = confirm(
      `선택한 ${selectedLogs.length}개 방문 기록을 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`,
    );

    if (!ok) return;

    try {
      setDeletingSelected(true);

      const batch = writeBatch(db);

      selectedLogs.forEach((logId) => {
        batch.delete(doc(db, "visitLogs", logId));
      });

      await batch.commit();

      setVisitLogs((prev) =>
        prev.filter((log) => !selectedLogs.includes(log.id)),
      );

      setSelectedLogs([]);
      setOpenZone(null);

      alert("선택한 방문 기록이 삭제되었습니다.");
    } catch (error) {
      console.error("선택 방문 기록 삭제 에러:", error);
      alert("선택 삭제 실패");
    } finally {
      setDeletingSelected(false);
    }
  }

  async function handleUpdateSelectedLogs() {
    if (selectedLogs.length === 0) {
      alert("선택된 방문 기록이 없습니다.");
      return;
    }

    const nextVisitorName = prompt(
      `선택한 ${selectedLogs.length}개 방문 기록의 방문자 이름을 바꾸려면 입력해주세요.
이름은 그대로 두려면 빈칸으로 확인을 누르세요.`,
      "",
    );

    if (nextVisitorName === null) return;

    const nextDateValue = prompt(
      `선택한 ${selectedLogs.length}개 방문 기록의 날짜를 바꾸려면 아래 형식으로 입력해주세요.
예: 2026-05-14 19:30
날짜는 그대로 두려면 빈칸으로 확인을 누르세요.`,
      "",
    );

    if (nextDateValue === null) return;

    const trimmedName = nextVisitorName.trim();
    const trimmedDateValue = nextDateValue.trim();

    if (!trimmedName && !trimmedDateValue) {
      alert("수정할 방문자 이름이나 날짜를 입력해주세요.");
      return;
    }

    let nextTimestamp: Timestamp | null = null;
    let nextDate: Date | null = null;

    if (trimmedDateValue) {
      const normalizedDateValue = trimmedDateValue.includes("T")
        ? trimmedDateValue
        : trimmedDateValue.replace(" ", "T");

      nextDate = new Date(normalizedDateValue);

      if (Number.isNaN(nextDate.getTime())) {
        alert("날짜 형식이 올바르지 않습니다. 예: 2026-05-14 19:30");
        return;
      }

      nextTimestamp = Timestamp.fromDate(nextDate);
    }

    const updateData: Partial<Pick<VisitLog, "visitorName" | "createdAt">> = {};

    if (trimmedName) {
      updateData.visitorName = trimmedName;
    }

    if (nextTimestamp) {
      updateData.createdAt = nextTimestamp;
    }

    const confirmLines = [
      `선택한 ${selectedLogs.length}개 방문 기록을 수정할까요?`,
    ];

    if (trimmedName) {
      confirmLines.push(`방문자 이름: ${trimmedName}`);
    }

    if (nextDate) {
      confirmLines.push(
        `방문 날짜: ${nextDate.toLocaleString("ko-KR", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}`,
      );
    }

    const ok = confirm(confirmLines.join("\n"));

    if (!ok) return;

    try {
      setUpdatingSelectedLogs(true);

      const batch = writeBatch(db);

      selectedLogs.forEach((logId) => {
        batch.update(doc(db, "visitLogs", logId), updateData);
      });

      await batch.commit();

      setVisitLogs((prev) =>
        sortVisitLogsDesc(
          prev.map((log) =>
            selectedLogs.includes(log.id)
              ? {
                  ...log,
                  ...updateData,
                }
              : log,
          ),
        ),
      );

      alert("선택한 방문 기록이 수정되었습니다.");
    } catch (error) {
      console.error("선택 방문 기록 수정 에러:", error);
      alert("선택 수정 실패");
    } finally {
      setUpdatingSelectedLogs(false);
    }
  }

  async function handleDeleteAll() {
    const ok = confirm(
      "전체 방문 기록을 모두 삭제할까요? 이 작업은 되돌릴 수 없습니다.",
    );

    if (!ok) return;

    try {
      setDeletingAll(true);

      const batch = writeBatch(db);

      visitLogs.forEach((log) => {
        batch.delete(doc(db, "visitLogs", log.id));
      });

      await batch.commit();

      setVisitLogs([]);
      setSelectedLogs([]);
      setOpenZone(null);

      alert("전체 방문 기록이 삭제되었습니다.");
    } catch (error) {
      console.error("전체 삭제 에러:", error);
      alert("전체 삭제 실패");
    } finally {
      setDeletingAll(false);
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

  function formatDate(createdAt?: Timestamp | null) {
    if (!createdAt?.seconds) return "시간 없음";

    return new Date(createdAt.seconds * 1000).toLocaleString("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatWordDate(createdAt?: Timestamp | null) {
    if (!createdAt?.seconds) return "";

    const date = new Date(createdAt.seconds * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}.${month}.${day}`;
  }

  function getServiceYear() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;

    return month >= 9 ? year + 1 : year;
  }

  function getTextCells(row: Element) {
    return Array.from(row.getElementsByTagNameNS(WORD_NS, "tc"));
  }

  function createTextParagraph(xmlDoc: XMLDocument, text: string) {
    const paragraph = xmlDoc.createElementNS(WORD_NS, "w:p");
    const paragraphProperties = xmlDoc.createElementNS(WORD_NS, "w:pPr");
    const justify = xmlDoc.createElementNS(WORD_NS, "w:jc");

    justify.setAttributeNS(WORD_NS, "w:val", "center");
    paragraphProperties.appendChild(justify);

    const run = xmlDoc.createElementNS(WORD_NS, "w:r");
    const runProperties = xmlDoc.createElementNS(WORD_NS, "w:rPr");
    const size = xmlDoc.createElementNS(WORD_NS, "w:sz");
    const sizeCs = xmlDoc.createElementNS(WORD_NS, "w:szCs");

    size.setAttributeNS(WORD_NS, "w:val", "18");
    sizeCs.setAttributeNS(WORD_NS, "w:val", "18");

    runProperties.appendChild(size);
    runProperties.appendChild(sizeCs);

    const textNode = xmlDoc.createElementNS(WORD_NS, "w:t");
    textNode.textContent = text;

    run.appendChild(runProperties);
    run.appendChild(textNode);

    paragraph.appendChild(paragraphProperties);
    paragraph.appendChild(run);

    return paragraph;
  }

  function clearCell(cell: Element | undefined) {
    if (!cell) return;

    Array.from(cell.getElementsByTagNameNS(WORD_NS, "p")).forEach(
      (paragraph) => {
        if (paragraph.parentNode === cell) {
          cell.removeChild(paragraph);
        }
      },
    );
  }

  function setCellText(
    xmlDoc: XMLDocument,
    cell: Element | undefined,
    text: string,
  ) {
    if (!cell) return;

    clearCell(cell);
    cell.appendChild(createTextParagraph(xmlDoc, text));
  }

  function setCellLines(
    xmlDoc: XMLDocument,
    cell: Element | undefined,
    lines: string[],
  ) {
    if (!cell) return;

    clearCell(cell);

    if (lines.length === 0) {
      cell.appendChild(createTextParagraph(xmlDoc, ""));
      return;
    }

    lines.forEach((line) => {
      cell.appendChild(createTextParagraph(xmlDoc, line));
    });
  }

  function getValidThreeMonthLogs(logs: VisitLog[]) {
    const sortedLogs = [...logs]
      .filter((log) => Boolean(log.createdAt?.seconds))
      .sort((a, b) => {
        const aTime = a.createdAt?.seconds ?? 0;
        const bTime = b.createdAt?.seconds ?? 0;

        return aTime - bTime;
      });

    const validLogs: VisitLog[] = [];
    let lastValidDate: Date | null = null;

    sortedLogs.forEach((log) => {
      if (!log.createdAt?.seconds) return;

      const currentDate = new Date(log.createdAt.seconds * 1000);

      if (
        !lastValidDate ||
        isAtLeastMonthsAfter(
          currentDate,
          lastValidDate,
          VALID_VISIT_INTERVAL_MONTHS,
        )
      ) {
        validLogs.push(log);
        lastValidDate = currentDate;
      }
    });

    return validLogs;
  }

  function getValidLogsByZoneNumber() {
    const map = new Map<number, VisitLog[]>();

    visitLogs.forEach((log) => {
      if (!log.zoneNumber) return;

      if (!map.has(log.zoneNumber)) {
        map.set(log.zoneNumber, []);
      }

      map.get(log.zoneNumber)?.push(log);
    });

    const validMap = new Map<number, VisitLog[]>();

    map.forEach((logs, zoneNumber) => {
      validMap.set(zoneNumber, getValidThreeMonthLogs(logs));
    });

    return validMap;
  }

  async function handleDownloadWord() {
    try {
      setGeneratingWord(true);

      const response = await fetch(encodeURI(WORD_TEMPLATE_PATH));

      if (!response.ok) {
        alert(
          "Word 양식 파일을 찾을 수 없습니다.\npublic/templates/구역배정기록 S-13_KO.docx 위치를 확인해주세요.",
        );
        return;
      }

      const templateBuffer = await response.arrayBuffer();
      const zip = new PizZip(templateBuffer);
      const documentFile = zip.file("word/document.xml");

      if (!documentFile) {
        alert("Word 문서 구조를 읽을 수 없습니다.");
        return;
      }

      const documentXml = documentFile.asText();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(documentXml, "application/xml");

      const tables = Array.from(xmlDoc.getElementsByTagNameNS(WORD_NS, "tbl"));
      const serviceYearTable = tables[0];
      const recordTable = tables[1];

      if (!serviceYearTable || !recordTable) {
        alert("Word 양식의 표 구조를 찾을 수 없습니다.");
        return;
      }

      const serviceYearCells = getTextCells(serviceYearTable);
      setCellText(xmlDoc, serviceYearCells[1], String(getServiceYear()));

      const originalRows = Array.from(
        recordTable.getElementsByTagNameNS(WORD_NS, "tr"),
      );

      const headerRows = originalRows.slice(0, 2);
      const firstDataRowTemplate = originalRows[2];
      const secondDataRowTemplate = originalRows[3];

      if (!firstDataRowTemplate || !secondDataRowTemplate) {
        alert("Word 양식의 데이터 줄 구조를 찾을 수 없습니다.");
        return;
      }

      originalRows.slice(2).forEach((row) => {
        recordTable.removeChild(row);
      });

      const validLogsByZoneNumber = getValidLogsByZoneNumber();

      for (
        let zoneNumber = 1;
        zoneNumber <= TOTAL_ZONE_COUNT;
        zoneNumber += 1
      ) {
        const firstRow = firstDataRowTemplate.cloneNode(true) as Element;
        const secondRow = secondDataRowTemplate.cloneNode(true) as Element;

        const firstRowCells = getTextCells(firstRow);
        const secondRowCells = getTextCells(secondRow);

        const zoneLogs = validLogsByZoneNumber.get(zoneNumber) || [];

        const dates = zoneLogs.map((log) => formatWordDate(log.createdAt));
        const visitorNames = zoneLogs.map((log) => log.visitorName || "");

        setCellText(xmlDoc, firstRowCells[0], String(zoneNumber));

        setCellLines(xmlDoc, firstRowCells[1], dates);
        setCellLines(xmlDoc, firstRowCells[2], visitorNames);

        setCellLines(xmlDoc, secondRowCells[2], dates);
        setCellLines(xmlDoc, secondRowCells[3], dates);

        for (let index = 3; index < firstRowCells.length; index += 1) {
          setCellText(xmlDoc, firstRowCells[index], "");
        }

        for (let index = 4; index < secondRowCells.length; index += 1) {
          setCellText(xmlDoc, secondRowCells[index], "");
        }

        recordTable.appendChild(firstRow);
        recordTable.appendChild(secondRow);
      }

      headerRows.forEach((row) => {
        if (!row.parentNode) {
          recordTable.insertBefore(row, recordTable.firstChild);
        }
      });

      const serializer = new XMLSerializer();
      const updatedXml = serializer.serializeToString(xmlDoc);

      zip.file("word/document.xml", updatedXml);

      const blob = zip.generate({
        type: "blob",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      const today = new Date();
      const fileDate = `${today.getFullYear()}-${String(
        today.getMonth() + 1,
      ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      saveAs(blob, `구역배정기록-${getServiceYear()}봉사연도-${fileDate}.docx`);
    } catch (error) {
      console.error("Word 기록 다운로드 에러:", error);
      alert("Word 기록 다운로드 실패");
    } finally {
      setGeneratingWord(false);
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
    <main className="min-h-screen bg-slate-100 p-3">
      <div className="mx-auto max-w-5xl">
        <div className="sticky top-0 z-40 -mx-3 mb-3 border-b border-slate-200 bg-slate-100/95 px-3 pb-3 pt-3 shadow-sm backdrop-blur">
          <div className="mx-auto max-w-5xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              {role === "admin" ? (
                <Link
                  href="/admin"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-medium shadow"
                >
                  <ArrowLeft size={16} />
                  관리자 페이지로 돌아가기
                </Link>
              ) : (
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-medium shadow"
                >
                  <ArrowLeft size={16} />
                  메인으로 돌아가기
                </Link>
              )}

              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow"
              >
                <LogOut size={16} />
                로그아웃
              </button>
            </div>

            <div className="mb-3 rounded-2xl bg-slate-900 p-4 text-white shadow">
              <div className="flex items-center gap-2 text-slate-300">
                <ClipboardList size={18} />
                <p className="text-sm">전자구역 방문 관리</p>
              </div>

              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h1 className="text-2xl font-bold">방문 기록 관리</h1>

                  <p className="mt-1 text-sm text-slate-300">
                    총 {visitLogs.length}개 기록 / 현재 {filteredLogs.length}개 표시
                    / {groupedLogs.length}개 구역
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleDownloadWord}
                    disabled={generatingWord || loading}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    <FileText size={14} />
                    {generatingWord ? "생성 중..." : "Word 기록 다운로드"}
                  </button>

                  {visitLogs.length > 0 && (
                    <button
                      onClick={handleDeleteAll}
                      disabled={deletingAll}
                      className="rounded-xl bg-red-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {deletingAll ? "삭제 중..." : "전체 삭제"}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <Tabs defaultValue="전체" className="mb-3">
              <TabsList className="flex h-auto w-full justify-start gap-2 overflow-x-auto rounded-2xl bg-slate-200/70 p-2">
                {regions.map((region) => (
                  <TabsTrigger
                    key={region}
                    value={region}
                    onClick={() => {
                      setSelectedRegion(region);
                      setOpenZone(null);
                    }}
                    className="shrink-0 rounded-xl px-4 py-2.5 text-sm font-semibold"
                  >
                    {region}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={toggleAllFilteredLogs}
            disabled={filteredLogs.length === 0}
            className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow disabled:opacity-50"
          >
            {allFilteredSelected ? "전체 해제" : "전체 선택"}
          </button>

          {role === "admin" && (
            <button
              onClick={handleUpdateSelectedLogs}
              disabled={updatingSelectedLogs || selectedLogs.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-50"
            >
              <Pencil size={16} />
              {updatingSelectedLogs ? "수정 중..." : "선택 수정"}
            </button>
          )}

          <button
            onClick={handleDeleteSelectedLogs}
            disabled={deletingSelected || selectedLogs.length === 0}
            className="inline-flex items-center gap-2 rounded-xl bg-red-500 px-4 py-2 text-sm font-medium text-white shadow disabled:opacity-50"
          >
            <Trash2 size={16} />
            {deletingSelected ? "삭제 중..." : "선택 삭제"}
          </button>

          <div className="rounded-full bg-white px-3 py-1 text-sm text-slate-500 shadow">
            선택 {selectedLogs.length}개
          </div>

          <div className="text-xs text-slate-500">
            각 구역의 가장 최근 방문기록 1개만 선택됩니다. Shift를 누른 채 체크하면 여러 구역을 한 번에 선택할 수 있습니다.
          </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-white p-6 shadow">불러오는 중...</div>
        ) : groupedLogs.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center text-slate-400 shadow">
            방문 기록이 없습니다.
          </div>
        ) : (
          <div className="space-y-2">
            {groupedLogs.map(({ zoneName, logs, latestLog }) => {
              const isOpen = openZone === zoneName;
              const latestSelected = selectedLogs.includes(latestLog.id);
              const selectedCount = latestSelected ? 1 : 0;
              const allZoneSelected = latestSelected;

              return (
                <div
                  key={zoneName}
                  className={`overflow-hidden rounded-2xl bg-white shadow ${
                    selectedCount > 0 ? "ring-2 ring-red-200" : ""
                  }`}
                >
                  <div className="flex w-full items-center gap-3 p-4">
                    <input
                      type="checkbox"
                      checked={allZoneSelected}
                      onChange={(event) => {
                        toggleLatestLog(
                          latestLog.id,
                          event.nativeEvent.shiftKey,
                          event.target.checked,
                        );
                      }}
                      className="h-6 w-6 shrink-0 accent-red-500"
                      aria-label={`${latestLog.zoneName} 최근 방문기록 선택`}
                    />

                    <button
                      onClick={() => setOpenZone(isOpen ? null : zoneName)}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-slate-900 px-2 py-1 text-xs font-semibold text-white">
                            {latestLog.zoneNumber ?? latestLog.zoneId}.
                          </span>

                          <span className="truncate text-base font-bold text-slate-900">
                            {latestLog.zoneName}
                          </span>

                          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">
                            기록 {logs.length}개
                          </span>

                          {selectedCount > 0 && (
                            <span className="rounded-full bg-red-500 px-2 py-1 text-xs font-semibold text-white">
                              선택됨 {selectedCount}개
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <MapPin size={13} />
                            {latestLog.region || "지역 정보 없음"}
                          </span>

                          {latestLog.visitorName && (
                            <span className="flex items-center gap-1 font-medium text-slate-700">
                              <User size={13} />
                              최근 방문자: {latestLog.visitorName}
                            </span>
                          )}

                          <span className="flex items-center gap-1">
                            <Clock3 size={13} />
                            {formatDate(latestLog.createdAt)}
                          </span>
                        </div>
                      </div>

                      {isOpen ? (
                        <ChevronUp size={20} className="shrink-0" />
                      ) : (
                        <ChevronDown size={20} className="shrink-0" />
                      )}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="border-t border-slate-100 bg-slate-50 p-3">
                      <div className="space-y-2">
                        {logs.map((log) => {
                          const isLatestLog = log.id === latestLog.id;
                          const checked = selectedLogs.includes(log.id);
                          const isEditing = editingLogId === log.id;

                          return (
                            <div
                              key={log.id}
                              className={`rounded-xl px-3 py-2 ${
                                checked
                                  ? "bg-red-100 ring-2 ring-red-300"
                                  : "bg-white"
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3 text-sm">
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    disabled={!isLatestLog}
                                    onChange={(event) => {
                                      if (!isLatestLog) return;

                                      toggleLatestLog(
                                        log.id,
                                        event.nativeEvent.shiftKey,
                                        event.target.checked,
                                      );
                                    }}
                                    className="h-6 w-6 shrink-0 accent-red-500 disabled:opacity-30"
                                  />

                                  <div className="min-w-0">
                                    <div className="mb-1 text-[11px] font-semibold text-slate-400">
                                      {isLatestLog
                                        ? "선택 가능 · 가장 최근 기록"
                                        : "이전 기록 · 개별 수정/삭제만 가능"}
                                    </div>

                                    {log.visitorName && (
                                      <div className="mb-1 flex items-center gap-1 font-semibold text-slate-900">
                                        <User size={14} />
                                        방문자: {log.visitorName}
                                      </div>
                                    )}

                                    <div className="flex items-center gap-1 text-slate-500">
                                      <Clock3 size={14} />
                                      {formatDate(log.createdAt)}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex shrink-0 items-center gap-1.5">
                                  {role === "admin" && (
                                    <button
                                      onClick={() => startEditVisitDate(log)}
                                      disabled={updatingDateId === log.id}
                                      className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                                    >
                                      <Pencil size={13} />
                                      수정
                                    </button>
                                  )}

                                  <button
                                    onClick={() => handleDeleteLog(log)}
                                    disabled={deletingId === log.id}
                                    className="inline-flex items-center gap-1 rounded-lg bg-red-500 px-2 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                                  >
                                    <Trash2 size={13} />
                                    {deletingId === log.id ? "삭제 중" : "삭제"}
                                  </button>
                                </div>
                              </div>

                              {isEditing && (
                                <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                  <div className="mb-2 text-xs font-semibold text-slate-600">
                                    방문 정보 수정
                                  </div>

                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                    <input
                                      type="text"
                                      value={editingVisitorName}
                                      onChange={(event) =>
                                        setEditingVisitorName(
                                          event.target.value,
                                        )
                                      }
                                      placeholder="방문자 이름"
                                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-slate-400"
                                    />

                                    <input
                                      type="datetime-local"
                                      value={editingDateValue}
                                      onChange={(event) =>
                                        setEditingDateValue(event.target.value)
                                      }
                                      className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-slate-400"
                                    />

                                    <div className="flex gap-2">
                                      <button
                                        onClick={() =>
                                          handleUpdateVisitDate(log)
                                        }
                                        disabled={updatingDateId === log.id}
                                        className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-bold text-white shadow disabled:opacity-50"
                                      >
                                        <Save size={15} />
                                        {updatingDateId === log.id
                                          ? "저장 중"
                                          : "저장"}
                                      </button>

                                      <button
                                        onClick={cancelEditVisitDate}
                                        disabled={updatingDateId === log.id}
                                        className="inline-flex items-center gap-1 rounded-xl bg-white px-3 py-2 text-sm font-bold text-slate-600 shadow disabled:opacity-50"
                                      >
                                        <X size={15} />
                                        취소
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
