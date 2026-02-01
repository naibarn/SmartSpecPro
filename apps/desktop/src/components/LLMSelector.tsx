import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

export type LLMModel = "gpt-4" | "gpt-4-turbo" | "claude-3" | "gemini-pro";

interface LLMSelectorProps {
  selectedModel: LLMModel;
  onModelChange: (model: LLMModel) => void;
}

const models: { id: LLMModel; label: string; provider: string; badge?: string }[] = [
  { id: "gpt-4", label: "GPT-4", provider: "OpenAI" },
  { id: "gpt-4-turbo", label: "GPT-4 Turbo", provider: "OpenAI", badge: "Fast" },
  { id: "claude-3", label: "Claude 3", provider: "Anthropic", badge: "Smart" },
  { id: "gemini-pro", label: "Gemini Pro", provider: "Google" },
];

export function LLMSelector({ selectedModel, onModelChange }: LLMSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectedModelData = models.find((m) => m.id === selectedModel);

  return (
    <div className="relative">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="min-w-[140px] justify-between"
      >
        <div className="flex items-center space-x-2">
          <span className="text-lg">🤖</span>
          <span className="text-xs font-semibold">{selectedModelData?.label}</span>
        </div>
        <svg
          className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </Button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />

            {/* Dropdown */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-full mb-2 right-0 w-64 bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden"
            >
              <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  Select LLM Model
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Choose your AI model
                </p>
              </div>

              <div className="p-2 space-y-1">
                {models.map((model) => (
                  <motion.button
                    key={model.id}
                    whileHover={{ scale: 1.02, x: 4 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      onModelChange(model.id);
                      setIsOpen(false);
                    }}
                    className={`
                      w-full text-left p-3 rounded-lg transition-all
                      ${
                        selectedModel === model.id
                          ? "bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-500"
                          : "hover:bg-gray-50 dark:hover:bg-gray-700 border-2 border-transparent"
                      }
                    `}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="text-sm font-bold text-gray-900 dark:text-white">
                            {model.label}
                          </span>
                          {model.badge && (
                            <Badge variant="success" className="text-xs">
                              {model.badge}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {model.provider}
                        </div>
                      </div>
                      {selectedModel === model.id && (
                        <motion.svg
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="w-5 h-5 text-blue-600 flex-shrink-0"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clipRule="evenodd"
                          />
                        </motion.svg>
                      )}
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
