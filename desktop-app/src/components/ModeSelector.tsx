import { motion } from "framer-motion";

export type Mode = "orchestrator" | "code" | "ask" | "debug" | "architect";

interface ModeSelectorProps {
  selectedMode: Mode;
  onModeChange: (mode: Mode) => void;
}

const modes: { id: Mode; label: string; icon: string }[] = [
  { id: "orchestrator", label: "Orchestrator", icon: "🎯" },
  { id: "code", label: "Code", icon: "💻" },
  { id: "ask", label: "Ask", icon: "💬" },
  { id: "debug", label: "Debug", icon: "🐛" },
  { id: "architect", label: "Architect", icon: "🏗️" },
];

export function ModeSelector({ selectedMode, onModeChange }: ModeSelectorProps) {
  return (
    <div className="flex items-center justify-center space-x-1 px-4 py-2 bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
      {modes.map((mode) => (
        <motion.button
          key={mode.id}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onModeChange(mode.id)}
          className={`
            relative px-4 py-2 rounded-lg text-sm font-semibold transition-all
            ${
              selectedMode === mode.id
                ? "bg-blue-600 text-white shadow-lg"
                : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"
            }
          `}
        >
          <span className="mr-2">{mode.icon}</span>
          {mode.label}
          {selectedMode === mode.id && (
            <motion.div
              layoutId="activeMode"
              className="absolute inset-0 bg-blue-600 rounded-lg -z-10"
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            />
          )}
        </motion.button>
      ))}
    </div>
  );
}
