"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";

export interface TestCase {
  id?: string;
  input: string;
  expectedOut: string;
  order?: number;
}

interface CodeEditorProps {
  questionId: string;
  starterCode?: string | null;
  testCases?: TestCase[];
  onCodeChange: (code: string, language: string, passedCount: number, totalCount: number) => void;
  initialCode?: string;
  initialLanguage?: string;
}

const DEFAULT_JS_TEMPLATE = `// JavaScript (Node.js) Solution
function solution(input) {
  // Parse input and compute output
  return input;
}
`;

const DEFAULT_PY_TEMPLATE = `# Python 3 Solution
def solution(input_data):
    # Parse input and compute output
    return input_data
`;

export function CodeEditor({
  questionId,
  starterCode,
  testCases = [],
  onCodeChange,
  initialCode,
  initialLanguage = "javascript",
}: CodeEditorProps) {
  const [language, setLanguage] = useState<string>(initialLanguage);
  const [code, setCode] = useState<string>(
    initialCode ||
      starterCode ||
      (language === "python" ? DEFAULT_PY_TEMPLATE : DEFAULT_JS_TEMPLATE),
  );
  const [isRunning, setIsRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<"editor" | "testcases" | "console">("editor");
  const [executionResults, setExecutionResults] = useState<{
    passedCount: number;
    totalCount: number;
    allPassed?: boolean;
    results: {
      input: string;
      expectedOut: string;
      actualOut: string;
      passed: boolean;
      error?: string;
      executionTimeMs: number;
    }[];
  } | null>(null);
  const [consoleOutput, setConsoleOutput] = useState<string>("");

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lineGutterRef = useRef<HTMLDivElement | null>(null);

  const lines = code.split("\n");
  const lineCount = Math.max(lines.length, 12);

  // Synchronize gutter scroll with textarea scroll
  function handleScroll(e: React.UIEvent<HTMLTextAreaElement>) {
    if (lineGutterRef.current) {
      lineGutterRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  }

  function handleLanguageChange(newLang: string) {
    setLanguage(newLang);
    if (!code || code === DEFAULT_JS_TEMPLATE || code === DEFAULT_PY_TEMPLATE) {
      const template = newLang === "python" ? DEFAULT_PY_TEMPLATE : DEFAULT_JS_TEMPLATE;
      setCode(template);
      onCodeChange(template, newLang, executionResults?.passedCount || 0, testCases.length);
    } else {
      onCodeChange(code, newLang, executionResults?.passedCount || 0, testCases.length);
    }
  }

  function handleCodeInput(newCode: string) {
    setCode(newCode);
    onCodeChange(newCode, language, executionResults?.passedCount || 0, testCases.length);
  }

  // Handle Tab key indentation & bracket auto-pairing like Monaco/Ace
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      const newCode = code.substring(0, start) + "  " + code.substring(end);
      handleCodeInput(newCode);

      // Restore cursor position after inserted spaces
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 2;
        }
      }, 0);
    }
  }

  async function handleRunCode() {
    setIsRunning(true);
    setActiveTab("testcases");
    setConsoleOutput("⚡ Compiling and executing code in isolated sandbox...");

    try {
      const res = await fetch("/api/code/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          language,
          questionId,
          customTestCases: testCases.length ? testCases : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Execution failed");

      setExecutionResults(data);
      onCodeChange(code, language, data.passedCount, data.totalCount);

      if (data.results && data.results.length > 0) {
        const summary = data.results
          .map(
            (r: { passed: boolean; actualOut: string; error?: string; executionTimeMs: number }, i: number) =>
              `Case #${i + 1} (${r.executionTimeMs}ms): ${r.passed ? "✓ PASSED" : "✗ FAILED"}${
                r.error ? ` [Error: ${r.error}]` : ` -> Output: ${r.actualOut}`
              }`,
          )
          .join("\n");
        setConsoleOutput(
          `Execution Finished: ${data.passedCount}/${data.totalCount} Test Cases Passed.\n\n${summary}`,
        );
      }
    } catch (err) {
      setConsoleOutput(err instanceof Error ? `Error: ${err.message}` : "Execution error");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="flex flex-col rounded-2xl border border-slate-800 bg-slate-950 text-slate-100 overflow-hidden shadow-2xl">
      {/* Monaco / Ace Header Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
          </div>

          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Language:
            </span>
            <select
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-bold text-slate-200 focus:border-blue-500 focus:outline-hidden cursor-pointer"
            >
              <option value="javascript">JavaScript (Node.js 20)</option>
              <option value="python">Python 3.12</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              const template = language === "python" ? DEFAULT_PY_TEMPLATE : DEFAULT_JS_TEMPLATE;
              handleCodeInput(starterCode || template);
            }}
            className="text-[11px] font-semibold text-slate-400 hover:text-slate-200 px-2.5 py-1 rounded-lg border border-slate-800 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Reset Template
          </button>
          <Button
            type="button"
            onClick={handleRunCode}
            disabled={isRunning || !code.trim()}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md px-4 rounded-xl cursor-pointer"
          >
            {isRunning ? "Running Sandbox..." : "▶ Run Code & Test Cases"}
          </Button>
        </div>
      </div>

      {/* Editor Body with Line Number Gutter */}
      <div className="relative flex bg-slate-950 font-mono text-xs">
        {/* Line Gutter */}
        <div
          ref={lineGutterRef}
          aria-hidden="true"
          className="select-none py-3.5 px-3 text-right text-slate-600 bg-slate-900/60 border-r border-slate-800/80 font-mono text-xs leading-relaxed min-w-[45px] overflow-hidden"
        >
          {Array.from({ length: lineCount }).map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Code Input */}
        <textarea
          ref={textareaRef}
          value={code}
          onChange={(e) => handleCodeInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={handleScroll}
          rows={14}
          spellCheck={false}
          className="flex-1 w-full bg-slate-950 py-3.5 px-4 font-mono text-xs leading-relaxed text-emerald-400 border-0 focus:outline-hidden resize-y selection:bg-blue-600/40 tab-2"
          placeholder="Write your solution here..."
        />
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-900/90 border-t border-slate-800/80 text-[10px] text-slate-400 font-mono">
        <div className="flex items-center gap-3">
          <span>UTF-8</span>
          <span>•</span>
          <span>Tab Size: 2</span>
          <span>•</span>
          <span>Lines: {lines.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {executionResults && (
            <span
              className={`font-bold ${
                executionResults.allPassed ? "text-emerald-400" : "text-amber-400"
              }`}
            >
              {executionResults.passedCount}/{executionResults.totalCount} Passed
            </span>
          )}
          <span className="text-slate-500">Sandboxed Environment</span>
        </div>
      </div>

      {/* Test Cases & Execution Drawer Tabs */}
      <div className="border-t border-slate-800 bg-slate-900/95">
        <div className="flex items-center gap-2 px-3 pt-2 border-b border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("testcases")}
            className={`px-3 py-1.5 rounded-t-lg font-bold transition-colors cursor-pointer ${
              activeTab === "testcases"
                ? "bg-slate-950 text-white border-t-2 border-blue-500"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Test Cases ({testCases.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("console")}
            className={`px-3 py-1.5 rounded-t-lg font-bold transition-colors cursor-pointer ${
              activeTab === "console"
                ? "bg-slate-950 text-white border-t-2 border-blue-500"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Output Console
          </button>
        </div>

        {/* Tab Contents */}
        <div className="p-3.5 bg-slate-950/70 max-h-52 overflow-y-auto font-mono text-xs">
          {activeTab === "testcases" && (
            <div className="space-y-2.5">
              {testCases.length === 0 ? (
                <div className="text-slate-500 italic p-2 text-xs">
                  Default sample test cases will run upon clicking &quot;Run Code & Test Cases&quot;.
                </div>
              ) : (
                testCases.map((tc, idx) => {
                  const execRes = executionResults?.results?.[idx];
                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border text-xs transition-all ${
                        execRes
                          ? execRes.passed
                            ? "bg-emerald-950/20 border-emerald-800 text-emerald-300"
                            : "bg-rose-950/20 border-rose-800 text-rose-300"
                          : "bg-slate-900/80 border-slate-800 text-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold mb-1.5">
                        <span className="flex items-center gap-1.5">
                          <span>Case #{idx + 1}</span>
                          {tc.order !== undefined && (
                            <span className="text-[10px] text-slate-500 font-normal">
                              (Order: {tc.order})
                            </span>
                          )}
                        </span>
                        {execRes && (
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              execRes.passed
                                ? "bg-emerald-900/60 text-emerald-300"
                                : "bg-rose-900/60 text-rose-300"
                            }`}
                          >
                            {execRes.passed ? "✓ PASSED" : "✗ FAILED"} ({execRes.executionTimeMs}ms)
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                        <div>
                          <span className="text-slate-500 block mb-0.5">Input:</span>
                          <span className="bg-slate-950 px-2 py-1 rounded-md block text-slate-200 truncate font-mono">
                            {tc.input}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block mb-0.5">Expected Output:</span>
                          <span className="bg-slate-950 px-2 py-1 rounded-md block text-slate-200 truncate font-mono">
                            {tc.expectedOut}
                          </span>
                        </div>
                      </div>

                      {execRes && !execRes.passed && (
                        <div className="mt-2 pt-2 border-t border-rose-900/40 text-[11px] text-rose-300">
                          <strong>Your Output:</strong> {execRes.actualOut || "(empty/none)"}{" "}
                          {execRes.error && (
                            <span className="text-rose-400 font-bold block mt-0.5">
                              Runtime Error: {execRes.error}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === "console" && (
            <pre className="whitespace-pre-wrap text-slate-300 font-mono text-xs leading-relaxed p-1">
              {consoleOutput || "No executions yet. Click 'Run Code & Test Cases' to view logs."}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
