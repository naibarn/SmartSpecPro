/**
 * VerticalDramaSettingsTab (spec feature 131, section-10/11 — Series detail
 * "Settings" tab).
 *
 * Minimal series-level configuration: title + status. Saves via the existing
 * `verticalDramaSeries.updateSeries` mutation (title/status fields only —
 * `bible`/`policy`/`productTieIn` are left untouched by omitting them from the
 * payload). Disabled entirely when the series is archived (`readOnly`).
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  pickCopy,
  seriesStatusCopy,
  verticalDramaCopy,
  type VerticalDramaSeriesStatus,
} from "@/components/verticalDramaSeries/verticalDramaCopy";

const STATUS_OPTIONS: VerticalDramaSeriesStatus[] = [
  "draft",
  "planning",
  "active",
  "paused",
  "completed",
  "archived",
];

export interface VerticalDramaSettingsTabProps {
  lang: "th" | "en";
  seriesId: string;
  title: string;
  status: string;
  readOnly: boolean;
  onSaved?: () => void;
}

export function VerticalDramaSettingsTab({
  lang,
  seriesId,
  title,
  status,
  readOnly,
  onSaved,
}: VerticalDramaSettingsTabProps) {
  const [titleInput, setTitleInput] = useState(title);
  const [statusInput, setStatusInput] = useState<VerticalDramaSeriesStatus>(
    (status as VerticalDramaSeriesStatus) ?? "draft",
  );

  // Keep local form state in sync when the parent series data changes
  // (e.g. after a refetch triggered elsewhere).
  useEffect(() => {
    setTitleInput(title);
  }, [title]);
  useEffect(() => {
    setStatusInput((status as VerticalDramaSeriesStatus) ?? "draft");
  }, [status]);

  const utils = trpc.useUtils();
  const updateMutation = trpc.verticalDramaSeries.updateSeries.useMutation({
    onSuccess: () => {
      toast.success(lang === "th" ? "บันทึกการตั้งค่าแล้ว" : "Settings saved");
      void utils.verticalDramaSeries.get.invalidate();
      onSaved?.();
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message || (lang === "th" ? "บันทึกไม่สำเร็จ" : "Failed to save settings"));
    },
  });

  const dirty = titleInput !== title || statusInput !== status;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {lang === "th" ? "ตั้งค่าซีรีย์" : "Series settings"}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid max-w-md gap-4">
        {readOnly && (
          <Badge variant="outline" className="w-fit">
            {pickCopy(lang, verticalDramaCopy.readOnly)}
          </Badge>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="series-settings-title" className="text-xs font-medium text-muted-foreground">
            {lang === "th" ? "ชื่อซีรีย์" : "Series title"}
          </Label>
          <Input
            id="series-settings-title"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            disabled={readOnly || updateMutation.isPending}
          />
        </div>

        <div className="grid gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            {lang === "th" ? "สถานะ" : "Status"}
          </Label>
          <Select
            value={statusInput}
            onValueChange={(v) => setStatusInput(v as VerticalDramaSeriesStatus)}
            disabled={readOnly || updateMutation.isPending}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {pickCopy(lang, seriesStatusCopy[opt])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!readOnly && (
          <Button
            onClick={() =>
              updateMutation.mutate({
                seriesId,
                title: titleInput.trim() || undefined,
                status: statusInput,
              })
            }
            disabled={updateMutation.isPending || !dirty || titleInput.trim().length === 0}
            className="w-fit gap-2"
          >
            {updateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            {updateMutation.isPending
              ? lang === "th"
                ? "กำลังบันทึก…"
                : "Saving…"
              : lang === "th"
                ? "บันทึก"
                : "Save"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
