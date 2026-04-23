import { Link } from "wouter";
import { ArrowLeft, ArrowRightLeft, Bot, ShieldCheck } from "lucide-react";
import { DashboardCard } from "@/components/dashboard";
import { Button } from "@/components/ui/button";
import { WorkpackStatusRail } from "./WorkpackStatusRail";
import { buildWorkpackDetailHref, buildWorkpackEntrypointHref } from "@/lib/workpackNavigation";

type WorkpackSummaryHeaderProps = {
  workpackId: string;
  title: string;
  description?: string | null;
  lifecycleState: string;
  autonomyMode: string;
  gateResult?: string | null;
  promotionState?: string | null;
  nextAction?: string | null;
};

export function WorkpackSummaryHeader(props: WorkpackSummaryHeaderProps) {
  return (
    <DashboardCard
      eyebrow="Workpack"
      title={props.title}
      description={props.description ?? "Autonomous workpack control surface"}
      leading={<Bot className="h-5 w-5 text-sky-600" />}
      trailing={(
        <div className="flex items-center gap-2">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Button>
          </Link>
          <Link href={buildWorkpackDetailHref(props.workpackId, "replay")}>
            <Button variant="outline" size="sm">
              Replay
              <ArrowRightLeft className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link href={buildWorkpackDetailHref(props.workpackId, "connectors")}>
            <Button variant="outline" size="sm">
              Connectors
              <ShieldCheck className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      )}
    >
      <div className="space-y-3">
        <WorkpackStatusRail
          lifecycleState={props.lifecycleState}
          autonomyMode={props.autonomyMode}
          gateResult={props.gateResult}
          promotionState={props.promotionState}
        />
        {props.nextAction ? (
          <p className="text-sm text-slate-600">
            Next action: {props.nextAction}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Link href={buildWorkpackEntrypointHref({ entrypoint: "dashboard", surface: "roi" })}>
            <Button variant="outline" size="sm">ROI</Button>
          </Link>
          <Link href={buildWorkpackEntrypointHref({ entrypoint: "dashboard", surface: "discovery" })}>
            <Button variant="outline" size="sm">Discovery</Button>
          </Link>
          <Link href={buildWorkpackEntrypointHref({ entrypoint: "dashboard", surface: "exceptions" })}>
            <Button variant="outline" size="sm">Exceptions</Button>
          </Link>
        </div>
      </div>
    </DashboardCard>
  );
}
