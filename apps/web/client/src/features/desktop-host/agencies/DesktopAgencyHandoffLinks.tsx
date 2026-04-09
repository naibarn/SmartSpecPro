import { buildDesktopHandoffLinks } from "../labels";

export function DesktopAgencyHandoffLinks(props: {
  agencyId: string;
  runId?: string;
}) {
  const links = buildDesktopHandoffLinks({
    agencyId: props.agencyId,
    runId: props.runId,
  });

  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={links.openInDesktop}
        className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white"
      >
        Open in Desktop
      </a>
      <a
        href={links.viewOnWeb}
        className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700"
      >
        View on Web
      </a>
    </div>
  );
}
