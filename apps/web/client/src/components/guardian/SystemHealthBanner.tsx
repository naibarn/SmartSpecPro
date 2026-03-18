import { useGuardianEvents } from "@/hooks/useGuardianEvents";
import { motion, AnimatePresence } from "framer-motion";

interface SystemHealthBannerProps {
  isAdmin?: boolean;
}

export function SystemHealthBanner({ isAdmin = false }: SystemHealthBannerProps) {
  const { latestCriticalIncident } = useGuardianEvents(isAdmin);

  return (
    <AnimatePresence>
      {latestCriticalIncident && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-destructive text-destructive-foreground px-4 py-2 text-sm flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <span className="font-semibold">CRITICAL:</span>
            <span>{latestCriticalIncident.title}</span>
            <span className="opacity-75">— {latestCriticalIncident.message}</span>
          </div>
          <a
            href="/admin/system-guardian"
            className="underline font-medium hover:opacity-80"
          >
            View Details
          </a>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
