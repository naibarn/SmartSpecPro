import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Music, Upload, X } from "lucide-react";
import { toast } from "sonner";

const MAX_OMNIVOICE_REFERENCE_AUDIO_BYTES = 10 * 1024 * 1024;

interface OmniVoiceCloneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  referenceAudioName: string;
  onReferenceAudioNameChange: (value: string) => void;
  referenceAudioBase64: string;
  onReferenceAudioBase64Change: (value: string) => void;
  referenceAudioMimeType: string;
  onReferenceAudioMimeTypeChange: (value: string) => void;
  referenceText: string;
  onReferenceTextChange: (value: string) => void;
  instruct: string;
  onInstructChange: (value: string) => void;
}

function resetReferenceAudio(
  onReferenceAudioNameChange: (value: string) => void,
  onReferenceAudioBase64Change: (value: string) => void,
  onReferenceAudioMimeTypeChange: (value: string) => void,
) {
  onReferenceAudioNameChange("");
  onReferenceAudioBase64Change("");
  onReferenceAudioMimeTypeChange("");
}

export function OmniVoiceCloneDialog({
  open,
  onOpenChange,
  referenceAudioName,
  onReferenceAudioNameChange,
  referenceAudioBase64,
  onReferenceAudioBase64Change,
  referenceAudioMimeType,
  onReferenceAudioMimeTypeChange,
  referenceText,
  onReferenceTextChange,
  instruct,
  onInstructChange,
}: OmniVoiceCloneDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Music className="h-5 w-5 text-sky-600" />
            OmniVoice Desktop Clone Studio
            <Badge variant="outline" className="text-[10px] border-sky-200 text-sky-700 bg-white">
              desktop only
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Upload a reference clip from this desktop device, add a transcript if you have one, and OmniVoice will use it for cloned TTS.
          </p>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Reference audio</label>
            <div className="flex items-center gap-2">
              <Input
                type="file"
                accept="audio/*"
                onChange={async (event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (!file) {
                    resetReferenceAudio(
                      onReferenceAudioNameChange,
                      onReferenceAudioBase64Change,
                      onReferenceAudioMimeTypeChange,
                    );
                    return;
                  }

                  if (file.size > MAX_OMNIVOICE_REFERENCE_AUDIO_BYTES) {
                    toast.error("Reference audio must be 10 MB or smaller.");
                    event.target.value = "";
                    resetReferenceAudio(
                      onReferenceAudioNameChange,
                      onReferenceAudioBase64Change,
                      onReferenceAudioMimeTypeChange,
                    );
                    return;
                  }

                  const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                      const raw = String(reader.result ?? "");
                      const parts = raw.split(",", 2);
                      resolve(parts.length > 1 ? parts[1] : raw);
                    };
                    reader.onerror = () => reject(new Error("Failed to read reference audio"));
                    reader.readAsDataURL(file);
                  });

                  onReferenceAudioNameChange(file.name);
                  onReferenceAudioMimeTypeChange(file.type || "audio/mpeg");
                  onReferenceAudioBase64Change(base64);
                }}
                className="bg-white"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => resetReferenceAudio(
                  onReferenceAudioNameChange,
                  onReferenceAudioBase64Change,
                  onReferenceAudioMimeTypeChange,
                )}
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            </div>
            {referenceAudioName && (
              <p className="text-xs text-sky-900/80">Selected: {referenceAudioName}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Reference transcript</label>
            <Textarea
              rows={3}
              placeholder="Optional transcript for the reference clip"
              value={referenceText}
              onChange={(event) => onReferenceTextChange(event.target.value)}
              className="bg-white"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Voice instructions</label>
            <Textarea
              rows={3}
              placeholder="Optional style notes, e.g. warm female voice, calm and clear"
              value={instruct}
              onChange={(event) => onInstructChange(event.target.value)}
              className="bg-white"
            />
          </div>

          {referenceAudioBase64 && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              Reference audio is loaded and will be attached to the next OmniVoice TTS request.
            </div>
          )}

          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            <Upload className="inline-block h-3.5 w-3.5 mr-1" />
            Maximum reference audio size: 10 MB.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
