import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { AlertTriangle, ArrowLeft, Download, ExternalLink, Loader2 } from "lucide-react";

import { CopyLinkButton } from "@/components/library/CopyLinkButton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SafeMarkdown } from "@/components/chat/SafeMarkdown";
import { trpc } from "@/lib/trpc";
import {
  buildPublicDocumentShareUrl,
  resolveDocumentPreviewType,
} from "@/lib/documentManagementUi";
import CodeViewer from "@/components/library/CodeViewer";
import CSVViewer from "@/components/library/CSVViewer";
import JSONViewer from "@/components/library/JSONViewer";

const PUBLIC_SHARE_ROUTE = "/share/:token";

export default function PublicDocumentShare() {
  const [, params] = useRoute(PUBLIC_SHARE_ROUTE);
  const token = params?.token?.trim() ?? "";
  const shareUrl = useMemo(
    () => buildPublicDocumentShareUrl(token, typeof window !== "undefined" ? window.location.origin : ""),
    [token],
  );

  const { data, isLoading, isError } = trpc.library.resolvePublicShareLink.useQuery(
    { token },
    { enabled: Boolean(token) },
  );

  const item = data?.item ?? null;
  const previewItem = item
    ? {
        item_type: item.itemType,
        source_url: item.sourceUrl,
        metadata: item.metadata,
      }
    : null;
  const previewType = previewItem ? resolveDocumentPreviewType(previewItem) : "fallback";
  const sourceUrl = item?.sourceUrl ?? null;
  const markdownContent = data?.markdownContent ?? null;
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    setPreviewText(null);
    setPreviewError(null);

    if (!sourceUrl) {
      return;
    }

    const needsTextPreview =
      previewType === "code" ||
      previewType === "csv" ||
      previewType === "json" ||
      previewType === "text" ||
      previewType === "html" ||
      previewType === "xml";

    if (!needsTextPreview || markdownContent) {
      return;
    }

    const controller = new AbortController();
    fetch(sourceUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Unable to load preview (${response.status})`);
        }
        return response.text();
      })
      .then((text) => {
        setPreviewText(text);
      })
      .catch((error) => {
        if ((error as Error).name === "AbortError") {
          return;
        }
        setPreviewError("Preview could not be loaded. Use Download to open the file directly.");
      });

    return () => controller.abort();
  }, [markdownContent, previewType, sourceUrl]);

  const textPreview = markdownContent ?? previewText ?? null;
  const canShowDownload = Boolean(sourceUrl);

  return (
    <div className="min-h-screen overflow-y-auto bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.18),_transparent_35%),radial-gradient(circle_at_top_right,_rgba(34,197,94,0.14),_transparent_30%),linear-gradient(180deg,_#f8fbff_0%,_#eef7ff_46%,_#ffffff_100%)] px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="ghost" className="gap-2 rounded-full bg-white/70 shadow-sm backdrop-blur">
            <a href="/document-management">
              <ArrowLeft className="h-4 w-4" />
              Back to app
            </a>
          </Button>

          {token ? <CopyLinkButton shareUrl={shareUrl} /> : null}
        </div>

        <div className="overflow-hidden rounded-[2rem] border border-white/70 bg-white/85 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur">
          {isLoading ? (
            <div className="flex min-h-[60vh] items-center justify-center">
              <div className="flex items-center gap-3 text-slate-600">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading public file...
              </div>
            </div>
          ) : isError || !item ? (
            <div className="flex min-h-[60vh] items-center justify-center p-8">
              <div className="max-w-lg rounded-2xl border border-amber-200 bg-amber-50/90 p-6 text-center shadow-sm">
                <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-600" />
                <h1 className="text-xl font-semibold text-amber-900">Public link not available</h1>
                <p className="mt-2 text-sm text-amber-800">
                  This link may have expired, been revoked, or point to a file that no longer exists.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid min-h-[75vh] gap-0 lg:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.9fr)]">
              <div className="flex min-h-0 flex-col border-b border-slate-200/70 bg-gradient-to-br from-slate-950 via-slate-900 to-sky-900 text-white lg:border-b-0 lg:border-r">
                <div className="border-b border-white/10 p-5 sm:p-6">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="bg-sky-400/15 text-sky-200 hover:bg-sky-400/20">Public read-only</Badge>
                    <Badge variant="outline" className="border-white/20 bg-white/5 text-white">
                      {item.itemType}
                    </Badge>
                    {item.status ? (
                      <Badge variant="outline" className="border-white/20 bg-white/5 text-white/80">
                        {item.status}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h1 className="truncate text-2xl font-semibold tracking-tight sm:text-3xl">{item.title}</h1>
                      {item.description ? (
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200/90">
                          {item.description}
                        </p>
                      ) : null}
                    </div>
                    {canShowDownload ? (
                      <Button asChild className="shrink-0 gap-2 rounded-full bg-white text-slate-950 hover:bg-slate-100">
                        <a href={sourceUrl ?? "#"} target="_blank" rel="noreferrer" download>
                          <Download className="h-4 w-4" />
                          Download
                        </a>
                      </Button>
                    ) : null}
                  </div>
                </div>

                <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-6">
                  {previewType === "markdown" && textPreview ? (
                    <div className="rounded-[1.5rem] bg-white/95 p-5 text-slate-900 shadow-xl shadow-black/10">
                      <SafeMarkdown>{textPreview}</SafeMarkdown>
                    </div>
                  ) : null}

                  {previewType === "image" && sourceUrl ? (
                    <div className="flex min-h-[48vh] items-center justify-center rounded-[1.5rem] border border-white/15 bg-black/35 p-4">
                      <img
                        src={sourceUrl}
                        alt={item.title}
                        className="max-h-[70vh] max-w-full rounded-2xl object-contain shadow-2xl"
                      />
                    </div>
                  ) : null}

                  {previewType === "video" && sourceUrl ? (
                    <div className="rounded-[1.5rem] border border-white/15 bg-black/45 p-4">
                      <video src={sourceUrl} controls className="max-h-[70vh] w-full rounded-2xl bg-black" />
                    </div>
                  ) : null}

                  {previewType === "audio" && sourceUrl ? (
                    <div className="rounded-[1.5rem] border border-white/15 bg-white/10 p-5">
                      <audio src={sourceUrl} controls className="w-full" />
                    </div>
                  ) : null}

                  {previewType === "pdf" && sourceUrl ? (
                    <div className="overflow-hidden rounded-[1.5rem] border border-white/15 bg-white shadow-2xl">
                      <iframe src={sourceUrl} title={item.title} className="h-[72vh] w-full" />
                    </div>
                  ) : null}

                  {previewType === "code" ? (
                    textPreview ? (
                      <div className="overflow-hidden rounded-[1.5rem] bg-white shadow-xl shadow-black/10">
                        <CodeViewer code={textPreview} language="text" fileName={item.title} />
                      </div>
                    ) : (
                      <div className="rounded-[1.5rem] border border-white/15 bg-slate-950 p-5 text-sm text-slate-200 shadow-xl shadow-black/10">
                        {previewError ?? "Preview is not available for this file. Use Download to open it directly."}
                      </div>
                    )
                  ) : null}

                  {previewType === "csv" ? (
                    textPreview ? (
                      <CSVViewer csvData={textPreview} fileName={item.title} />
                    ) : (
                      <div className="rounded-[1.5rem] border border-white/15 bg-white p-5 text-sm text-slate-600 shadow-xl shadow-black/10">
                        {previewError ?? "Preview is not available for this file. Use Download to open it directly."}
                      </div>
                    )
                  ) : null}

                  {previewType === "json" ? (
                    textPreview ? (
                      <JSONViewer jsonData={textPreview} fileName={item.title} />
                    ) : (
                      <div className="rounded-[1.5rem] border border-white/15 bg-white p-5 text-sm text-slate-600 shadow-xl shadow-black/10">
                        {previewError ?? "Preview is not available for this file. Use Download to open it directly."}
                      </div>
                    )
                  ) : null}

                  {previewType === "text" || previewType === "html" || previewType === "xml" ? (
                    <div className="rounded-[1.5rem] border border-white/15 bg-slate-950 p-5 text-slate-100 shadow-xl shadow-black/10">
                      {textPreview ? (
                        <pre className="max-h-[72vh] overflow-auto whitespace-pre-wrap break-words font-mono text-sm leading-6">
                          {textPreview}
                        </pre>
                      ) : previewError ? (
                        <div className="text-sm text-amber-200">{previewError}</div>
                      ) : (
                        <div className="text-sm text-slate-300">Preview is not available for this file type.</div>
                      )}
                    </div>
                  ) : null}

                  {!textPreview &&
                  previewType !== "markdown" &&
                  previewType !== "image" &&
                  previewType !== "video" &&
                  previewType !== "audio" &&
                  previewType !== "pdf" &&
                  previewType !== "code" &&
                  previewType !== "csv" &&
                  previewType !== "json" ? (
                    <div className="rounded-[1.5rem] border border-dashed border-white/20 bg-white/10 p-6 text-sm text-slate-200">
                      Preview is not available in the browser for this file type. Use Download to open it directly.
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col gap-4 bg-slate-50/80 p-5 sm:p-6">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Share</p>
                      <h2 className="mt-1 text-lg font-semibold text-slate-900">Public link</h2>
                    </div>
                    <Badge variant="secondary" className="bg-emerald-50 text-emerald-700">
                      Read only
                    </Badge>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">
                    Anyone with this link can view the file without logging in. The owner can revoke it from Document Management.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <CopyLinkButton shareUrl={shareUrl} />
                    {canShowDownload ? (
                      <Button asChild variant="outline" className="gap-2">
                        <a href={sourceUrl ?? "#"} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-4 w-4" />
                          Open file
                        </a>
                      </Button>
                    ) : null}
                  </div>
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                    {token ? shareUrl : "No share token provided."}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Details</p>
                  <dl className="mt-3 space-y-3 text-sm">
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-slate-500">Type</dt>
                      <dd className="text-right font-medium text-slate-900">{item.itemType}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-slate-500">Updated</dt>
                      <dd className="text-right font-medium text-slate-900">
                        {new Date(item.updatedAt).toLocaleString()}
                      </dd>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                      <dt className="text-slate-500">Source</dt>
                      <dd className="max-w-[18rem] truncate text-right font-medium text-slate-900">
                        {item.source}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
