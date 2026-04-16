import { Link } from "wouter";
import { buildWorkpackEntrypointHref } from "@/lib/workpackNavigation";

interface RoleWorkpackLinksProps {
  workpackId: string;
}

export function RoleWorkpackLinks({ workpackId }: RoleWorkpackLinksProps) {
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      <Link href={`/workpacks/${workpackId}`} className="text-sky-600 hover:text-sky-700">
        Workpack detail
      </Link>
      <Link href={`/workpacks/${workpackId}/replay`} className="text-sky-600 hover:text-sky-700">
        Replay
      </Link>
      <Link href={`/workpacks/${workpackId}/connectors`} className="text-sky-600 hover:text-sky-700">
        Connectors
      </Link>
      <Link href={buildWorkpackEntrypointHref({ entrypoint: "teams", surface: "intake" })} className="text-sky-600 hover:text-sky-700">
        Intake
      </Link>
      <Link href={buildWorkpackEntrypointHref({ entrypoint: "teams", surface: "discovery" })} className="text-sky-600 hover:text-sky-700">
        Discovery
      </Link>
      <Link href={`/workpacks/exceptions`} className="text-sky-600 hover:text-sky-700">
        Exceptions
      </Link>
      <Link href={`/workpacks/roi`} className="text-sky-600 hover:text-sky-700">
        ROI
      </Link>
    </div>
  );
}
