import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import type { VerticalDramaLang } from "./verticalDramaCopy";
import {
  FAMILY_SIDES,
  RELATIONSHIP_DISCLOSURES,
  RELATIONSHIP_STATUSES,
  RELATIONSHIP_TYPES,
  type FamilySide,
  type RelationshipDisclosure,
  type RelationshipStatus,
  type RelationshipType,
} from "@shared/verticalDramaSeries/longFormContracts";

type Props = {
  lang: VerticalDramaLang;
  seriesId: string;
  graphRevisionId: string;
  episodeNumber?: number;
};

/** Bounded relationship-map diagnostics; never loads the whole season graph. */
export function VerticalDramaRelationshipGraphPanel({
  lang,
  seriesId,
  graphRevisionId,
  episodeNumber,
}: Props) {
  const [familySide, setFamilySide] = useState<FamilySide | undefined>();
  const [relationType, setRelationType] = useState<
    RelationshipType | undefined
  >();
  const [episodeFilter, setEpisodeFilter] = useState(
    episodeNumber ? String(episodeNumber) : ""
  );
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [familyGroupId, setFamilyGroupId] = useState("");
  const [factionId, setFactionId] = useState("");
  const [status, setStatus] = useState<RelationshipStatus | undefined>();
  const [disclosure, setDisclosure] = useState<
    RelationshipDisclosure | undefined
  >();
  const [candidateGraphRevisionId, setCandidateGraphRevisionId] = useState("");
  const [includeCandidateActiveDiff, setIncludeCandidateActiveDiff] =
    useState(true);
  const [cursor, setCursor] = useState<string | undefined>();
  const [fromCharacterKey, setFromCharacterKey] = useState("");
  const [toCharacterKey, setToCharacterKey] = useState("");
  const query = trpc.verticalDramaSeries.getCharacterRelationshipGraph.useQuery(
    {
      seriesId,
      graphRevisionId,
      episodeNumber: parseEpisode(episodeFilter),
      episodeRange:
        parseEpisode(rangeStart) !== undefined &&
        parseEpisode(rangeEnd) !== undefined
          ? {
              startEpisode: parseEpisode(rangeStart) as number,
              endEpisode: parseEpisode(rangeEnd) as number,
            }
          : undefined,
      familySide,
      familyGroupId: familyGroupId.trim() || undefined,
      factionId: factionId.trim() || undefined,
      relationTypes: relationType ? [relationType] : undefined,
      statuses: status ? [status] : undefined,
      disclosure: disclosure ? [disclosure] : undefined,
      candidateGraphRevisionId: candidateGraphRevisionId.trim() || undefined,
      cursor,
      pageSize: 100,
      includeCandidateActiveDiff,
    }
  );
  const view = query.data;
  const pathQuery =
    trpc.verticalDramaSeries.getCharacterRelationshipPath.useQuery(
      {
        seriesId,
        graphRevisionId,
        fromCharacterKey,
        toCharacterKey,
        maxHops: 6,
        maxPaths: 3,
      },
      { enabled: Boolean(fromCharacterKey && toCharacterKey) }
    );
  const copy = lang === "th";
  return (
    <section
      aria-label={
        copy ? "ผังความสัมพันธ์ตัวละคร" : "Character relationship graph"
      }
      className="rounded-md border bg-card p-4"
      data-testid="vd-relationship-graph-panel"
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">
          {copy ? "ผังความสัมพันธ์ตัวละคร" : "Character relationship graph"}
        </h2>
        {view?.truncated && (
          <Badge variant="outline">
            {copy ? "กำลังแสดงบางส่วน" : "Partial page"}
          </Badge>
        )}
      </header>
      <p className="mt-1 text-xs text-muted-foreground">
        {copy
          ? "แสดงข้อมูลแบบแบ่งหน้าและปิดบังความลับตามสิทธิ์"
          : "Paged and permission-redacted diagnostics"}
      </p>
      <fieldset
        className="mt-3 flex flex-wrap gap-2"
        aria-label={
          copy ? "ตัวกรองผังความสัมพันธ์" : "Relationship graph filters"
        }
      >
        <label className="text-xs">
          {copy ? "ฝั่งตระกูล" : "Family side"}
          <select
            className="ml-2 rounded border bg-background px-2 py-1"
            value={familySide ?? ""}
            onChange={event => {
              setFamilySide(
                (event.target.value || undefined) as FamilySide | undefined
              );
              setCursor(undefined);
            }}
          >
            <option value="">{copy ? "ทั้งหมด" : "All"}</option>
            {FAMILY_SIDES.map(side => (
              <option key={side} value={side}>
                {side}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          {copy ? "ประเภท" : "Relation type"}
          <select
            className="ml-2 rounded border bg-background px-2 py-1"
            value={relationType ?? ""}
            onChange={event => {
              setRelationType(
                (event.target.value || undefined) as
                  | RelationshipType
                  | undefined
              );
              setCursor(undefined);
            }}
          >
            <option value="">{copy ? "ทั้งหมด" : "All"}</option>
            {RELATIONSHIP_TYPES.map(type => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>
      </fieldset>
      <fieldset
        className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
        aria-label={
          copy ? "ตัวกรองช่วงเวลาและสถานะ" : "Timeline and state filters"
        }
      >
        <label className="text-xs">
          {copy ? "ดู ณ ตอน" : "At episode"}
          <input
            className="mt-1 block w-full rounded border bg-background px-2 py-1 text-sm"
            inputMode="numeric"
            value={episodeFilter}
            onChange={event => {
              setEpisodeFilter(event.target.value);
              setRangeStart("");
              setRangeEnd("");
              setCursor(undefined);
            }}
            placeholder="—"
          />
        </label>
        <label className="text-xs">
          {copy ? "ช่วงตอนเริ่ม" : "Range start"}
          <input
            className="mt-1 block w-full rounded border bg-background px-2 py-1 text-sm"
            inputMode="numeric"
            value={rangeStart}
            onChange={event => {
              setRangeStart(event.target.value);
              setEpisodeFilter("");
              setCursor(undefined);
            }}
            placeholder="—"
          />
        </label>
        <label className="text-xs">
          {copy ? "ช่วงตอนสิ้นสุด" : "Range end"}
          <input
            className="mt-1 block w-full rounded border bg-background px-2 py-1 text-sm"
            inputMode="numeric"
            value={rangeEnd}
            onChange={event => {
              setRangeEnd(event.target.value);
              setEpisodeFilter("");
              setCursor(undefined);
            }}
            placeholder="—"
          />
        </label>
        <label className="text-xs">
          {copy ? "กลุ่มตระกูล" : "Family group"}
          <input
            className="mt-1 block w-full rounded border bg-background px-2 py-1 text-sm"
            value={familyGroupId}
            onChange={event => {
              setFamilyGroupId(event.target.value);
              setCursor(undefined);
            }}
            placeholder="group key"
          />
        </label>
        <label className="text-xs">
          {copy ? "ฝ่าย/แฟกชัน" : "Faction"}
          <input
            className="mt-1 block w-full rounded border bg-background px-2 py-1 text-sm"
            value={factionId}
            onChange={event => {
              setFactionId(event.target.value);
              setCursor(undefined);
            }}
            placeholder="faction key"
          />
        </label>
        <label className="text-xs">
          {copy ? "สถานะ" : "Status"}
          <select
            className="mt-1 block w-full rounded border bg-background px-2 py-1"
            value={status ?? ""}
            onChange={event => {
              setStatus(
                (event.target.value || undefined) as
                  | RelationshipStatus
                  | undefined
              );
              setCursor(undefined);
            }}
          >
            <option value="">{copy ? "ทั้งหมด" : "All"}</option>
            {RELATIONSHIP_STATUSES.map(value => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          {copy ? "การเปิดเผย" : "Disclosure"}
          <select
            className="mt-1 block w-full rounded border bg-background px-2 py-1"
            value={disclosure ?? ""}
            onChange={event => {
              setDisclosure(
                (event.target.value || undefined) as
                  | RelationshipDisclosure
                  | undefined
              );
              setCursor(undefined);
            }}
          >
            <option value="">{copy ? "ทั้งหมด" : "All"}</option>
            {RELATIONSHIP_DISCLOSURES.map(value => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 self-end text-xs">
          <input
            type="checkbox"
            checked={includeCandidateActiveDiff}
            onChange={event =>
              setIncludeCandidateActiveDiff(event.target.checked)
            }
          />
          {copy ? "แสดง diff candidate/active" : "Show candidate/active diff"}
        </label>
      </fieldset>
      <label className="mt-2 block text-xs">
        {copy
          ? "Candidate graph revision (ถ้ามี)"
          : "Candidate graph revision (optional)"}
        <input
          className="mt-1 block w-full rounded border bg-background px-2 py-1 text-sm"
          value={candidateGraphRevisionId}
          onChange={event => {
            setCandidateGraphRevisionId(event.target.value);
            setCursor(undefined);
          }}
          placeholder="candidate revision id"
        />
      </label>
      <fieldset
        className="mt-3 grid gap-2 sm:grid-cols-2"
        aria-label={
          copy ? "ตรวจเส้นทางความสัมพันธ์" : "Inspect relationship path"
        }
      >
        <label className="text-xs">
          {copy ? "จากตัวละคร" : "From character"}
          <input
            className="mt-1 block w-full rounded border bg-background px-2 py-1 text-sm"
            value={fromCharacterKey}
            onChange={event => setFromCharacterKey(event.target.value)}
            placeholder="character key"
          />
        </label>
        <label className="text-xs">
          {copy ? "ถึงตัวละคร" : "To character"}
          <input
            className="mt-1 block w-full rounded border bg-background px-2 py-1 text-sm"
            value={toCharacterKey}
            onChange={event => setToCharacterKey(event.target.value)}
            placeholder="character key"
          />
        </label>
      </fieldset>
      {pathQuery.data && (
        <section
          className="mt-3 rounded border p-2 text-xs"
          aria-label={
            copy ? "ผลตรวจเส้นทางความสัมพันธ์" : "Relationship path result"
          }
        >
          <p className="font-medium">
            {copy
              ? `ผลลัพธ์: ${pathQuery.data.kind}`
              : `Result: ${pathQuery.data.kind}`}
            {pathQuery.data.truncated
              ? copy
                ? " · มีเส้นทางมากกว่าที่แสดง"
                : " · more paths exist"
              : ""}
          </p>
          {pathQuery.data.paths.map((path, index) => (
            <p
              key={`${path.characterKeys.join("-")}:${index}`}
              className="mt-1 text-muted-foreground"
            >
              {path.characterKeys.join(" → ")} · {copy ? "หลักฐาน" : "evidence"}
              : {path.sourceEdgeIds.join(", ") || "—"}
            </p>
          ))}
        </section>
      )}
      {query.isLoading && (
        <p className="mt-4 flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {copy ? "กำลังโหลดผัง..." : "Loading graph..."}
        </p>
      )}
      {query.error && (
        <p
          role="alert"
          className="mt-4 flex items-center gap-2 text-sm text-destructive"
        >
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          {copy
            ? "โหลดผังไม่สำเร็จหรือ revision ล้าสมัย"
            : "Graph is unavailable or stale"}
        </p>
      )}
      {view && (
        <>
          <p className="mt-4 text-xs text-muted-foreground" aria-live="polite">
            {copy
              ? `พบ ${view.edges.length} ความสัมพันธ์${view.redactedEdgeCount ? ` และปิดบัง ${view.redactedEdgeCount} รายการ` : ""}`
              : `${view.edges.length} relationships${view.redactedEdgeCount ? `, ${view.redactedEdgeCount} redacted` : ""}`}
          </p>
          {view.candidateActiveDiff && (
            <p className="mt-2 rounded border border-dashed p-2 text-xs text-muted-foreground">
              {copy
                ? `Diff candidate: เพิ่ม ${view.candidateActiveDiff.addedCount}, เปลี่ยน ${view.candidateActiveDiff.changedCount}, เอาออก ${view.candidateActiveDiff.removedCount} รายการ · ตอนที่ได้รับผลกระทบ: ${view.candidateActiveDiff.affectedEpisodeNumbers.join(", ") || "—"}`
                : `Candidate diff: +${view.candidateActiveDiff.addedCount}, changed ${view.candidateActiveDiff.changedCount}, removed ${view.candidateActiveDiff.removedCount} · affected episodes: ${view.candidateActiveDiff.affectedEpisodeNumbers.join(", ") || "—"}`}
            </p>
          )}
          <ul
            className="mt-2 space-y-2"
            aria-label={copy ? "รายการความสัมพันธ์" : "Relationship edges"}
          >
            {view.edges.map(edge => (
              <li key={edge.edgeId} className="rounded border p-2 text-sm">
                <span className="font-medium">
                  {edge.fromCharacterKey} → {edge.toCharacterKey}
                </span>
                <Badge className="ml-2" variant="secondary">
                  {edge.relationType}
                </Badge>
                <p className="text-xs text-muted-foreground">
                  {edge.familySide} · {edge.disclosure} · EP{" "}
                  {edge.validFromEpisode}
                  {edge.validToEpisode ? `–${edge.validToEpisode}` : "+"}
                </p>
              </li>
            ))}
          </ul>
          {view.nextCursor && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setCursor(view.nextCursor)}
            >
              {copy ? "โหลดหน้าถัดไป" : "Load next page"}
            </Button>
          )}
        </>
      )}
    </section>
  );
}

function parseEpisode(value: string): number | undefined {
  const parsed = Number(value.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
