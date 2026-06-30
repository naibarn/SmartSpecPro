"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = RenderJobsPage;
var react_1 = require("react");
var wouter_1 = require("wouter");
var lucide_react_1 = require("lucide-react");
var sonner_1 = require("sonner");
var badge_1 = require("@/components/ui/badge");
var button_1 = require("@/components/ui/button");
var select_1 = require("@/components/ui/select");
var table_1 = require("@/components/ui/table");
var trpc_1 = require("@/lib/trpc");
var utils_1 = require("@/lib/utils");
var STATUS_OPTIONS = [
    "all",
    "queued",
    "claimed",
    "running",
    "uploading",
    "publishing",
    "completed",
    "failed",
    "canceled",
];
var STATUS_LABELS = {
    all: "ทั้งหมด",
    queued: "รอ worker",
    claimed: "มี worker รับงานแล้ว",
    preparing: "กำลังเตรียมงาน",
    running: "กำลังเรนเดอร์",
    uploading: "กำลังอัปโหลด",
    publishing: "กำลังเผยแพร่",
    indexing: "กำลังจัดทำดัชนี",
    completed: "สำเร็จ",
    failed: "ล้มเหลว",
    canceled: "ยกเลิกแล้ว",
    expired: "หมดเวลา",
};
var STATUS_BADGE = {
    completed: "default",
    failed: "destructive",
    canceled: "destructive",
    expired: "destructive",
    running: "secondary",
    uploading: "secondary",
    publishing: "secondary",
    claimed: "outline",
    queued: "outline",
};
function formatDate(value) {
    if (!value)
        return "-";
    var date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime()))
        return "-";
    return new Intl.DateTimeFormat("th-TH", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);
}
function statusIcon(status) {
    if (status === "completed")
        return <lucide_react_1.CheckCircle2 className="h-4 w-4"/>;
    if (status === "failed" || status === "canceled" || status === "expired") {
        return <lucide_react_1.XCircle className="h-4 w-4"/>;
    }
    if (status === "running" || status === "uploading" || status === "publishing") {
        return <lucide_react_1.Loader2 className="h-4 w-4 animate-spin"/>;
    }
    return <lucide_react_1.Clock className="h-4 w-4"/>;
}
function JobStatusBadge(_a) {
    var _b, _c;
    var status = _a.status;
    return (<badge_1.Badge variant={(_b = STATUS_BADGE[status]) !== null && _b !== void 0 ? _b : "outline"} className="gap-1">
      {statusIcon(status)}
      {(_c = STATUS_LABELS[status]) !== null && _c !== void 0 ? _c : status}
    </badge_1.Badge>);
}
function getOutputDownloadUrl(ref) {
    var _a, _b;
    return (((_a = ref.downloadUrl) === null || _a === void 0 ? void 0 : _a.trim()) ||
        ((_b = ref.sourceUrl) === null || _b === void 0 ? void 0 : _b.trim()) ||
        "");
}
function formatShotLabel(event) {
    if (!event || typeof event.shotIndex !== "number" || typeof event.shotTotal !== "number") {
        return null;
    }
    return "Shot ".concat(event.shotIndex + 1, "/").concat(event.shotTotal);
}
function formatEventMessage(event) {
    var _a, _b, _c;
    if (!event)
        return "-";
    var shotLabel = formatShotLabel(event);
    var message = (_c = (_b = (_a = event.message) !== null && _a !== void 0 ? _a : event.phase) !== null && _b !== void 0 ? _b : event.sidecarEventType) !== null && _c !== void 0 ? _c : event.eventType;
    return shotLabel ? "".concat(shotLabel, ": ").concat(message) : message;
}
function isShotEvent(event) {
    return typeof event.shotIndex === "number" && typeof event.shotTotal === "number";
}
function getCurrentShotEvent(events) {
    var _a;
    return (_a = __spreadArray([], events, true).reverse()
        .find(function (event) {
        var _a, _b;
        return isShotEvent(event)
            && !String((_a = event.sidecarEventType) !== null && _a !== void 0 ? _a : "").endsWith(".succeeded")
            && !String((_b = event.sidecarEventType) !== null && _b !== void 0 ? _b : "").endsWith(".cache_hit");
    })) !== null && _a !== void 0 ? _a : null;
}
function getShotRows(events) {
    var _a, _b, _c, _d;
    var rows = new Map();
    for (var _i = 0, events_1 = events; _i < events_1.length; _i++) {
        var event_1 = events_1[_i];
        if (!isShotEvent(event_1))
            continue;
        var type = String((_a = event_1.sidecarEventType) !== null && _a !== void 0 ? _a : "");
        var status_1 = "rendering";
        if (type.endsWith(".cache_hit"))
            status_1 = "cached";
        if (type.endsWith(".succeeded"))
            status_1 = "completed";
        if (type.endsWith(".failed"))
            status_1 = "failed";
        rows.set(event_1.shotIndex, {
            shotIndex: event_1.shotIndex,
            shotTotal: event_1.shotTotal,
            shotId: (_b = event_1.shotId) !== null && _b !== void 0 ? _b : null,
            status: status_1,
            message: (_c = event_1.message) !== null && _c !== void 0 ? _c : type,
            rootCause: (_d = event_1.rootCause) !== null && _d !== void 0 ? _d : null,
        });
    }
    return __spreadArray([], rows.values(), true).sort(function (a, b) { return a.shotIndex - b.shotIndex; });
}
function getOutputLibraryRoute(ref) {
    return ref.publishedItemId
        ? "/media-history?type=video&source=marketplace_auto_review_hyperframes_render"
        : "/media-history";
}
function getOutputVideoEditorRoute(ref) {
    return ref.publishedItemId
        ? "/video-editor?libraryItemId=".concat(encodeURIComponent(String(ref.publishedItemId)))
        : null;
}
function RenderJobsPage() {
    var _this = this;
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    var _k = (0, react_1.useState)("all"), statusFilter = _k[0], setStatusFilter = _k[1];
    var _l = (0, react_1.useState)(null), selectedJobId = _l[0], setSelectedJobId = _l[1];
    var utils = trpc_1.trpc.useUtils();
    var listQuery = trpc_1.trpc.workerJobs.list.useQuery({
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: 50,
        offset: 0,
    }, { refetchInterval: 10000 });
    var jobs = (_b = (_a = listQuery.data) === null || _a === void 0 ? void 0 : _a.items) !== null && _b !== void 0 ? _b : [];
    var selectedJob = (_d = selectedJobId !== null && selectedJobId !== void 0 ? selectedJobId : (_c = jobs[0]) === null || _c === void 0 ? void 0 : _c.id) !== null && _d !== void 0 ? _d : null;
    var detailQuery = trpc_1.trpc.workerJobs.detail.useQuery({ jobId: selectedJob !== null && selectedJob !== void 0 ? selectedJob : "" }, { enabled: Boolean(selectedJob) });
    var cancelMutation = trpc_1.trpc.workerJobs.cancelQueued.useMutation({
        onSuccess: function () { return __awaiter(_this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        sonner_1.toast.success("ยกเลิกงานแล้ว");
                        return [4 /*yield*/, Promise.all([
                                utils.workerJobs.list.invalidate(),
                                utils.workerJobs.detail.invalidate(),
                            ])];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); },
        onError: function (error) {
            sonner_1.toast.error(error.message || "ยกเลิกงานไม่สำเร็จ");
        },
    });
    var activeCount = (0, react_1.useMemo)(function () { return jobs.filter(function (job) { return ["claimed", "preparing", "running", "uploading", "publishing", "indexing"].includes(job.status); }).length; }, [jobs]);
    var detailEvents = ((_f = (_e = detailQuery.data) === null || _e === void 0 ? void 0 : _e.events) !== null && _f !== void 0 ? _f : []);
    var currentShotEvent = getCurrentShotEvent(detailEvents);
    var shotRows = getShotRows(detailEvents);
    var failedShotRows = shotRows.filter(function (row) { return row.status === "failed"; });
    return (<main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.22),transparent_30%),radial-gradient(circle_at_85%_10%,rgba(99,102,241,0.20),transparent_26%),linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,1))]"/>
      <div className="relative flex min-h-screen flex-col">
        <header className="border-b border-white/10 bg-slate-950/80 px-4 py-4 backdrop-blur-xl sm:px-6">
          <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <button_1.Button asChild variant="ghost" size="icon" className="shrink-0 text-slate-300 hover:bg-white/10 hover:text-white">
                <wouter_1.Link href="/dashboard" aria-label="กลับไป Dashboard">
                  <lucide_react_1.ArrowLeft className="h-5 w-5"/>
                </wouter_1.Link>
              </button_1.Button>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-300/20 bg-cyan-400/10 text-cyan-200">
                <lucide_react_1.MonitorPlay className="h-5 w-5"/>
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl font-semibold tracking-normal text-white sm:text-2xl">
                    งานเรนเดอร์ของฉัน
                  </h1>
                  <badge_1.Badge variant="outline" className="border-cyan-300/30 bg-cyan-400/10 text-cyan-100">
                    Worker queue
                  </badge_1.Badge>
                </div>
                <p className="mt-1 text-sm text-slate-300">
                  ติดตามงาน worker ที่คุณส่งไว้ ดูคิว คนรับงาน ความคืบหน้า และลิงก์ผลลัพธ์จากหน้าเดียว
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button_1.Button asChild variant="outline" className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10">
                <wouter_1.Link href="/media-history">Media History</wouter_1.Link>
              </button_1.Button>
              <button_1.Button asChild variant="outline" className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10">
                <wouter_1.Link href="/media-studio">Media Studio</wouter_1.Link>
              </button_1.Button>
              <select_1.Select value={statusFilter} onValueChange={function (value) { return setStatusFilter(value); }}>
                <select_1.SelectTrigger className="w-44 border-white/15 bg-white/10 text-slate-100">
                  <select_1.SelectValue />
                </select_1.SelectTrigger>
                <select_1.SelectContent>
                  {STATUS_OPTIONS.map(function (status) { return (<select_1.SelectItem key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </select_1.SelectItem>); })}
                </select_1.SelectContent>
              </select_1.Select>
              <button_1.Button variant="outline" size="icon" aria-label="รีเฟรชรายการงาน" onClick={function () { return listQuery.refetch(); }} disabled={listQuery.isFetching} className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10">
                <lucide_react_1.RefreshCw className={(0, utils_1.cn)("h-4 w-4", listQuery.isFetching && "animate-spin")}/>
              </button_1.Button>
            </div>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-[1680px] flex-1 flex-col gap-5 px-4 py-5 sm:px-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-4 shadow-2xl shadow-black/10 backdrop-blur-xl">
              <div className="text-xs text-slate-300">ทั้งหมดในหน้านี้</div>
              <div className="mt-1 text-3xl font-semibold text-white">{jobs.length}</div>
            </div>
            <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-4 shadow-2xl shadow-black/10 backdrop-blur-xl">
              <div className="text-xs text-cyan-100/80">กำลังทำงาน</div>
              <div className="mt-1 text-3xl font-semibold text-cyan-50">{activeCount}</div>
            </div>
            <div className="rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 shadow-2xl shadow-black/10 backdrop-blur-xl">
              <div className="text-xs text-amber-100/80">รอ worker</div>
              <div className="mt-1 text-3xl font-semibold text-amber-50">{jobs.filter(function (job) { return job.status === "queued"; }).length}</div>
            </div>
            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 shadow-2xl shadow-black/10 backdrop-blur-xl">
              <div className="text-xs text-emerald-100/80">สำเร็จ</div>
              <div className="mt-1 text-3xl font-semibold text-emerald-50">{jobs.filter(function (job) { return job.status === "completed"; }).length}</div>
            </div>
          </div>

          {listQuery.isError ? (<div className="flex items-center gap-2 rounded-2xl border border-rose-300/30 bg-rose-500/10 p-4 text-sm text-rose-100">
              <lucide_react_1.AlertCircle className="h-4 w-4"/>
              โหลดรายการงานไม่สำเร็จ: {listQuery.error.message}
            </div>) : null}

          <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(380px,0.75fr)]">
            <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/95 text-slate-900 shadow-2xl shadow-black/20">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-4">
                <div>
                  <h2 className="text-base font-semibold">รายการงาน</h2>
                  <p className="text-xs text-slate-500">คลิกงานเพื่อดูรายละเอียดและ output ที่ตรวจสอบแล้ว</p>
                </div>
                {listQuery.isFetching ? (<badge_1.Badge variant="outline" className="border-cyan-200 bg-cyan-50 text-cyan-700">
                    <lucide_react_1.Loader2 className="mr-1 h-3 w-3 animate-spin"/>
                    กำลังอัปเดต
                  </badge_1.Badge>) : null}
              </div>

              {listQuery.isLoading ? (<div className="flex min-h-80 items-center justify-center text-slate-500">
                  <lucide_react_1.Loader2 className="mr-2 h-5 w-5 animate-spin"/>
                  กำลังโหลดงาน
                </div>) : jobs.length === 0 ? (<div className="flex min-h-80 items-center justify-center px-4 text-center text-sm text-slate-500">
                  ยังไม่มีงานในสถานะนี้
                </div>) : (<>
                  <div className="hidden overflow-x-auto md:block">
                    <table_1.Table>
                      <table_1.TableHeader>
                        <table_1.TableRow>
                          <table_1.TableHead>งาน</table_1.TableHead>
                          <table_1.TableHead>สถานะ</table_1.TableHead>
                          <table_1.TableHead>Worker</table_1.TableHead>
                          <table_1.TableHead>ความคืบหน้า</table_1.TableHead>
                          <table_1.TableHead className="text-right">สร้างเมื่อ</table_1.TableHead>
                        </table_1.TableRow>
                      </table_1.TableHeader>
                      <table_1.TableBody>
                        {jobs.map(function (job) {
                var _a, _b, _c, _d, _e;
                return (<table_1.TableRow key={job.id} className={(0, utils_1.cn)("cursor-pointer", selectedJob === job.id && "bg-cyan-50")} onClick={function () { return setSelectedJobId(job.id); }}>
                            <table_1.TableCell>
                              <div className="font-medium">{job.jobType}</div>
                              <div className="max-w-52 truncate text-xs text-slate-500">{job.id}</div>
                            </table_1.TableCell>
                            <table_1.TableCell><JobStatusBadge status={job.status}/></table_1.TableCell>
                            <table_1.TableCell>
                              {(_b = (_a = job.worker) === null || _a === void 0 ? void 0 : _a.displayName) !== null && _b !== void 0 ? _b : "ยังไม่ assign"}
                              {((_c = job.worker) === null || _c === void 0 ? void 0 : _c.machineName) ? (<div className="text-xs text-slate-500">{job.worker.machineName}</div>) : null}
                            </table_1.TableCell>
                            <table_1.TableCell>
                              <div className="max-w-72 truncate text-sm">
                                {formatEventMessage(job.latestEvent)}
                              </div>
                              {((_d = job.latestEvent) === null || _d === void 0 ? void 0 : _d.cacheHit) ? (<div className="text-xs text-emerald-600">ใช้ cache แล้ว</div>) : null}
                              {typeof ((_e = job.latestEvent) === null || _e === void 0 ? void 0 : _e.progressPercent) === "number" ? (<div className="text-xs text-slate-500">{job.latestEvent.progressPercent}%</div>) : null}
                            </table_1.TableCell>
                            <table_1.TableCell className="text-right text-sm text-slate-500">
                              {formatDate(job.createdAt)}
                            </table_1.TableCell>
                          </table_1.TableRow>);
            })}
                      </table_1.TableBody>
                    </table_1.Table>
                  </div>

                  <div className="grid gap-2 p-3 md:hidden">
                    {jobs.map(function (job) { return (<button key={job.id} type="button" onClick={function () { return setSelectedJobId(job.id); }} className={(0, utils_1.cn)("rounded-2xl border p-3 text-left", selectedJob === job.id && "border-cyan-300 bg-cyan-50")}>
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{job.jobType}</span>
                          <JobStatusBadge status={job.status}/>
                        </div>
                        <div className="text-xs text-slate-500">{formatDate(job.createdAt)}</div>
                        <div className="mt-2 truncate text-sm">
                          {formatEventMessage(job.latestEvent) || "ยังไม่มี progress event"}
                        </div>
                      </button>); })}
                  </div>
                </>)}
            </section>

            <aside className="overflow-hidden rounded-3xl border border-cyan-300/15 bg-slate-900/85 shadow-2xl shadow-black/20 backdrop-blur-xl">
              <div className="border-b border-white/10 px-5 py-4">
                <h2 className="text-base font-semibold text-white">รายละเอียดงาน</h2>
                <p className="text-xs text-slate-400">สถานะ worker, เวลา, output และ progress events</p>
              </div>

              {!selectedJob ? (<div className="p-5 text-sm text-slate-400">เลือกงานเพื่อดูรายละเอียด</div>) : detailQuery.isLoading ? (<div className="flex min-h-56 items-center justify-center text-slate-400">
                  <lucide_react_1.Loader2 className="mr-2 h-5 w-5 animate-spin"/>
                  กำลังโหลดรายละเอียด
                </div>) : detailQuery.isError ? (<div className="p-5 text-sm text-rose-200">{detailQuery.error.message}</div>) : detailQuery.data ? (<div className="max-h-[calc(100vh-260px)] space-y-5 overflow-y-auto p-5">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-white">{detailQuery.data.jobType}</div>
                        <div className="truncate text-xs text-slate-400">{detailQuery.data.id}</div>
                      </div>
                      <JobStatusBadge status={detailQuery.data.status}/>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm text-slate-200">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs text-slate-400">เริ่ม</div>
                        {formatDate(detailQuery.data.startedAt)}
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="text-xs text-slate-400">จบ</div>
                        {formatDate(detailQuery.data.finishedAt)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
                      <div className="text-xs text-slate-400">Worker</div>
                      {(_h = (_g = detailQuery.data.worker) === null || _g === void 0 ? void 0 : _g.displayName) !== null && _h !== void 0 ? _h : "ยังไม่มี worker รับงาน"}
                      {((_j = detailQuery.data.worker) === null || _j === void 0 ? void 0 : _j.status) ? (<span className="ml-2 text-xs text-slate-400">({detailQuery.data.worker.status})</span>) : null}
                    </div>
                    {currentShotEvent ? (<div className="rounded-2xl border border-cyan-300/25 bg-cyan-400/10 p-3 text-sm text-cyan-50">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-xs text-cyan-100/70">กำลังทำงานที่</div>
                            <div className="font-medium">{formatShotLabel(currentShotEvent)}</div>
                          </div>
                          {typeof currentShotEvent.progressPercent === "number" ? (<div className="text-lg font-semibold">{currentShotEvent.progressPercent}%</div>) : null}
                        </div>
                        <div className="mt-2 text-xs text-cyan-100/80">{currentShotEvent.message}</div>
                      </div>) : null}
                  </div>

                  {detailQuery.data.failureReason ? (<div className="rounded-2xl border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">
                      {detailQuery.data.failureReason}
                    </div>) : null}

                  {failedShotRows.length > 0 ? (<div className="rounded-2xl border border-rose-300/30 bg-rose-500/10 p-3 text-sm text-rose-100">
                      <div className="mb-2 flex items-center gap-2 font-medium">
                        <lucide_react_1.AlertCircle className="h-4 w-4"/>
                        Shot ที่ render มีปัญหา
                      </div>
                      <div className="space-y-2">
                        {failedShotRows.map(function (row) {
                    var _a, _b;
                    return (<div key={row.shotIndex} className="rounded-xl bg-rose-950/40 p-2">
                            <div className="font-medium">Shot {row.shotIndex + 1}/{row.shotTotal}: {(_a = row.shotId) !== null && _a !== void 0 ? _a : "-"}</div>
                            <div className="text-xs text-rose-100/80">{(_b = row.rootCause) !== null && _b !== void 0 ? _b : row.message}</div>
                          </div>);
                })}
                      </div>
                    </div>) : null}

                  <div className="flex flex-wrap gap-2">
                    <button_1.Button variant="destructive" size="sm" disabled={!detailQuery.data.canCancel || cancelMutation.isPending} onClick={function () { return cancelMutation.mutate({ jobId: detailQuery.data.id }); }}>
                      {cancelMutation.isPending ? <lucide_react_1.Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                      ยกเลิกงาน
                    </button_1.Button>
                    {detailQuery.data.workflowRunId ? (<wouter_1.Link href={"/workpacks/".concat(detailQuery.data.workflowRunId)}>
                        <button_1.Button variant="outline" size="sm" className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10">
                          เปิดงานต้นทาง
                        </button_1.Button>
                      </wouter_1.Link>) : null}
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-white">Shot progress</h3>
                    {shotRows.length === 0 ? (<div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-400">
                        ยังไม่มีข้อมูลราย shot
                      </div>) : (<div className="space-y-2">
                        {shotRows.map(function (row) {
                    var _a;
                    return (<div key={row.shotIndex} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="font-medium text-white">Shot {row.shotIndex + 1}/{row.shotTotal}</div>
                                <div className="truncate text-xs text-slate-400">{(_a = row.shotId) !== null && _a !== void 0 ? _a : row.message}</div>
                              </div>
                              <badge_1.Badge variant={row.status === "failed" ? "destructive" : row.status === "completed" || row.status === "cached" ? "default" : "secondary"}>
                                {row.status === "cached" ? "ใช้ cache" : row.status === "completed" ? "สำเร็จ" : row.status === "failed" ? "ล้มเหลว" : "กำลังเรนเดอร์"}
                              </badge_1.Badge>
                            </div>
                            {row.rootCause ? (<div className="mt-2 text-xs text-rose-200">{row.rootCause}</div>) : null}
                          </div>);
                })}
                      </div>)}
                  </div>

                  <div>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                      <lucide_react_1.Download className="h-4 w-4"/>
                      ผลลัพธ์ที่ตรวจสอบแล้ว
                    </h3>
                    {detailQuery.data.outputRefs.length === 0 ? (<div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-400">
                        ยังไม่มี output ที่ผ่านการตรวจสอบ
                      </div>) : (<div className="space-y-2">
                        {detailQuery.data.outputRefs.map(function (ref, index) {
                    var _a, _b, _c, _d;
                    var downloadUrl = getOutputDownloadUrl(ref);
                    var videoEditorRoute = getOutputVideoEditorRoute(ref);
                    var libraryRoute = getOutputLibraryRoute(ref);
                    return (<div key={"".concat((_b = (_a = ref.artifactId) !== null && _a !== void 0 ? _a : ref.publishedItemId) !== null && _b !== void 0 ? _b : index)} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div className="min-w-0">
                                  <div className="font-medium text-white">{ref.artifactType}</div>
                                  <div className="break-all text-xs text-slate-400">
                                    {ref.publishedItemId ? "Library item #".concat(ref.publishedItemId) : (_d = (_c = ref.storageRef) !== null && _c !== void 0 ? _c : ref.contentHash) !== null && _d !== void 0 ? _d : "verified output"}
                                  </div>
                                </div>
                                <div className="flex shrink-0 flex-wrap gap-2">
                                  {downloadUrl ? (<button_1.Button asChild variant="outline" size="sm" className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10">
                                      <a href={downloadUrl} target="_blank" rel="noreferrer" download>
                                        <lucide_react_1.Download className="mr-2 h-4 w-4"/>
                                        ดาวน์โหลด
                                      </a>
                                    </button_1.Button>) : null}
                                  {videoEditorRoute ? (<button_1.Button asChild variant="outline" size="sm" className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10">
                                      <wouter_1.Link href={videoEditorRoute}>
                                        <lucide_react_1.Scissors className="mr-2 h-4 w-4"/>
                                        เปิดวิดีโอ
                                      </wouter_1.Link>
                                    </button_1.Button>) : null}
                                  {ref.publishedItemId ? (<button_1.Button asChild variant="outline" size="sm" className="border-white/15 bg-white/5 text-slate-100 hover:bg-white/10">
                                      <wouter_1.Link href={libraryRoute}>
                                        <lucide_react_1.ExternalLink className="mr-2 h-4 w-4"/>
                                        Media History
                                      </wouter_1.Link>
                                    </button_1.Button>) : null}
                                </div>
                              </div>
                            </div>);
                })}
                      </div>)}
                  </div>

                  <div>
                    <h3 className="mb-2 text-sm font-semibold text-white">Progress events</h3>
                    {detailQuery.data.events.length === 0 ? (<div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-400">
                        ยังไม่มี event
                      </div>) : (<ol className="space-y-2">
                        {detailQuery.data.events.map(function (event) {
                    var _a;
                    return (<li key={event.id} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-200">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate font-medium text-white">{formatEventMessage(event)}</div>
                                <div className="text-xs text-slate-400">
                                  {(_a = event.sidecarEventType) !== null && _a !== void 0 ? _a : event.eventType}
                                  {event.cacheHit ? " · cache" : ""}
                                </div>
                                {event.rootCause ? (<div className="mt-1 text-xs text-rose-200">{event.rootCause}</div>) : null}
                              </div>
                              <div className="shrink-0 text-xs text-slate-400">{formatDate(event.createdAt)}</div>
                            </div>
                          </li>);
                })}
                      </ol>)}
                  </div>
                </div>) : null}
            </aside>
          </div>
        </div>
      </div>
    </main>);
}
