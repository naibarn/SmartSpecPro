import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { translateToCommand } from "../services/openai";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";

interface NaturalLanguageInputProps {
  onExecute: (workflow: string, args: Record<string, any>) => void;
}

export function NaturalLanguageInput({ onExecute }: NaturalLanguageInputProps) {
  const [input, setInput] = useState("");
  const [translating, setTranslating] = useState(false);
  const [result, setResult] = useState<{
    command: string;
    workflow: string;
    args: Record<string, any>;
    confidence: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleTranslate = async () => {
    if (!input.trim()) return;

    setTranslating(true);
    setError(null);
    setResult(null);

    try {
      const translation = await translateToCommand(input);
      setResult(translation);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setTranslating(false);
    }
  };

  const handleExecute = () => {
    if (result) {
      onExecute(result.workflow, result.args);
      setInput("");
      setResult(null);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!result) {
        handleTranslate();
      } else {
        handleExecute();
      }
    }
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.8) return { variant: "success" as const, label: "High" };
    if (confidence >= 0.6) return { variant: "warning" as const, label: "Medium" };
    return { variant: "destructive" as const, label: "Low" };
  };

  const examplePrompts = [
    "Generate a specification for user authentication",
    "Create an implementation plan for a payment gateway",
    "Generate a task list for building a chat feature"
  ];

  return (
    <Card className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border-2 border-blue-200 shadow-lg">
      <CardContent className="p-6">
        {/* Header */}
        <div className="mb-4">
          <h3 className="text-lg font-bold text-gray-900 flex items-center">
            <span className="text-2xl mr-2">🤖</span>
            Natural Language Input
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Describe what you want to do in plain English
          </p>
        </div>

        {/* Input Area */}
        <div className="bg-white rounded-xl shadow-md border-2 border-gray-200 p-5">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder='e.g., "Generate a spec for user authentication" or "Validate the API spec in specs/api.yaml"'
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none transition-all"
            rows={3}
            disabled={translating}
          />

          {/* Actions */}
          <div className="flex items-center justify-between mt-4">
            <div className="text-xs font-medium text-gray-500">
              {input.length > 0 && `${input.length} characters`}
            </div>
            <div className="flex space-x-3">
              {result && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setResult(null);
                    setInput("");
                  }}
                >
                  Clear
                </Button>
              )}
              {!result ? (
                <Button
                  onClick={handleTranslate}
                  disabled={!input.trim() || translating}
                  size="sm"
                >
                  {translating ? "⏳ Translating..." : "✨ Translate"}
                </Button>
              ) : (
                <Button
                  variant="success"
                  size="sm"
                  onClick={handleExecute}
                >
                  ▶️ Execute
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-4"
            >
              <div className="p-4 bg-red-50 border-2 border-red-200 rounded-xl">
                <div className="flex items-start">
                  <svg className="w-5 h-5 text-red-600 mt-0.5 mr-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-red-800">Error</p>
                    <p className="text-sm text-red-700 mt-1">{error}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Translation Result */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mt-4"
            >
              <div className="bg-white rounded-xl shadow-md border-2 border-gray-200 p-5">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h4 className="text-sm font-bold text-gray-900 mb-2 flex items-center">
                      <span className="mr-2">✅</span>
                      Translated Command
                    </h4>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-gray-600">Confidence:</span>
                      <Badge variant={getConfidenceBadge(result.confidence).variant}>
                        {getConfidenceBadge(result.confidence).label} ({Math.round(result.confidence * 100)}%)
                      </Badge>
                    </div>
                  </div>
                  {result.confidence < 0.7 && (
                    <Badge variant="warning">
                      ⚠️ Low confidence
                    </Badge>
                  )}
                </div>

                {/* Command Display */}
                <div className="bg-gray-900 text-gray-100 rounded-lg p-4 font-mono text-sm mb-4 shadow-inner">
                  <div className="flex items-start">
                    <span className="text-green-400 mr-2 font-bold">$</span>
                    <span className="flex-1">{result.command}</span>
                  </div>
                </div>

                {/* Arguments */}
                <details className="text-sm">
                  <summary className="cursor-pointer text-gray-700 hover:text-gray-900 font-semibold flex items-center">
                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    View Arguments
                  </summary>
                  <div className="mt-3 bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="space-y-2">
                      <div className="flex items-center">
                        <span className="text-gray-600 font-medium w-24">Workflow:</span>
                        <Badge variant="default">{result.workflow}</Badge>
                      </div>
                      {Object.entries(result.args).map(([key, value]) => (
                        <div key={key} className="flex items-center">
                          <span className="text-gray-600 font-medium w-24">{key}:</span>
                          <Badge variant="secondary">{String(value)}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </details>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Example Prompts */}
        {!result && !translating && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-gray-700 hover:text-gray-900 flex items-center">
              <span className="mr-2">💡</span>
              Example prompts
            </summary>
            <div className="mt-3 space-y-2">
              {examplePrompts.map((example, idx) => (
                <motion.button
                  key={idx}
                  whileHover={{ scale: 1.02, x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setInput(example)}
                  className="block w-full text-left px-4 py-2 bg-white hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg text-sm text-gray-700 hover:text-blue-700 transition-all"
                >
                  "{example}"
                </motion.button>
              ))}
            </div>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
