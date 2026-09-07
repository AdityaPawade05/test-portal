import vm from "node:vm";
import { spawn } from "node:child_process";

export interface TestCaseInput {
  id?: string;
  input: string;
  expectedOut: string;
  isHidden?: boolean;
}

export interface TestCaseResult {
  id?: string;
  input: string;
  expectedOut: string;
  actualOut: string;
  passed: boolean;
  isHidden?: boolean;
  error?: string;
  executionTimeMs: number;
}

export interface ExecutionResponse {
  language: string;
  passedCount: number;
  totalCount: number;
  allPassed: boolean;
  results: TestCaseResult[];
  error?: string;
}

/**
 * Executes JavaScript code safely in a sandboxed Node VM
 */
async function runJavaScriptTest(
  code: string,
  testCase: TestCaseInput,
  timeoutMs = 3000,
): Promise<TestCaseResult> {
  const start = Date.now();
  const inputStr = testCase.input.trim();
  const expectedStr = testCase.expectedOut.trim();

  // Create a clean sandbox with captured logs
  let stdoutLogs: string[] = [];
  const sandbox = {
    console: {
      log: (...args: unknown[]) => {
        stdoutLogs.push(
          args
            .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
            .join(" "),
        );
      },
      error: (...args: unknown[]) => {
        stdoutLogs.push(
          args
            .map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
            .join(" "),
        );
      },
    },
    process: undefined,
    require: undefined,
    fetch: undefined,
    setTimeout: undefined,
    setInterval: undefined,
  };

  const context = vm.createContext(sandbox);

  try {
    // Wrap code to support standard I/O or function calls
    const wrappedScript = `
      ${code}

      // Helper invocation if solution is written as function
      try {
        if (typeof solution === 'function') {
          let parsedInput;
          try {
            parsedInput = JSON.parse(${JSON.stringify(inputStr)});
          } catch(e) {
            parsedInput = ${JSON.stringify(inputStr)};
          }
          const res = Array.isArray(parsedInput) ? solution(...parsedInput) : solution(parsedInput);
          if (res !== undefined) {
            console.log(typeof res === 'object' ? JSON.stringify(res) : String(res));
          }
        }
      } catch(fnErr) {
        console.error("Execution error: " + fnErr.message);
      }
    `;

    const script = new vm.Script(wrappedScript);
    script.runInContext(context, { timeout: timeoutMs });

    const executionTimeMs = Date.now() - start;
    const actualOut = stdoutLogs.join("\n").trim();
    const passed = normalizeOutput(actualOut) === normalizeOutput(expectedStr);

    return {
      id: testCase.id,
      input: testCase.isHidden ? "[HIDDEN INPUT]" : testCase.input,
      expectedOut: testCase.isHidden ? "[HIDDEN EXPECTED OUTPUT]" : testCase.expectedOut,
      actualOut: testCase.isHidden ? (passed ? "[PASSED]" : "[FAILED]") : actualOut,
      passed,
      isHidden: testCase.isHidden,
      executionTimeMs,
    };
  } catch (err: unknown) {
    const executionTimeMs = Date.now() - start;
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      id: testCase.id,
      input: testCase.isHidden ? "[HIDDEN INPUT]" : testCase.input,
      expectedOut: testCase.isHidden ? "[HIDDEN EXPECTED OUTPUT]" : testCase.expectedOut,
      actualOut: "",
      passed: false,
      isHidden: testCase.isHidden,
      error: errorMsg.includes("timed out") ? "Time Limit Exceeded (3000ms)" : errorMsg,
      executionTimeMs,
    };
  }
}

/**
 * Executes Python code via python CLI with strict timeout
 */
async function runPythonTest(
  code: string,
  testCase: TestCaseInput,
  timeoutMs = 3000,
): Promise<TestCaseResult> {
  const start = Date.now();
  const inputStr = testCase.input.trim();
  const expectedStr = testCase.expectedOut.trim();

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let isSettled = false;

    // Python wrapper that attempts to call solution if defined, or runs standard input
    const pythonCode = `
import sys, json

try:
    input_data = """${inputStr.replace(/\\/g, "\\\\").replace(/"""/g, '\\"\\"\\"')}"""
except Exception:
    input_data = ""

${code}

if 'solution' in globals() and callable(globals()['solution']):
    try:
        try:
            parsed = json.loads(input_data)
        except Exception:
            parsed = input_data
        
        if isinstance(parsed, list):
            res = solution(*parsed)
        elif isinstance(parsed, dict):
            res = solution(**parsed)
        else:
            res = solution(parsed)
        if res is not None:
            print(json.dumps(res) if isinstance(res, (dict, list)) else res)
    except Exception as e:
        print(f"Runtime error: {e}", file=sys.stderr)
`;

    const pyProcess = spawn("python", ["-c", pythonCode], {
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      if (!isSettled) {
        isSettled = true;
        pyProcess.kill();
        resolve({
          id: testCase.id,
          input: testCase.isHidden ? "[HIDDEN INPUT]" : testCase.input,
          expectedOut: testCase.isHidden ? "[HIDDEN EXPECTED OUTPUT]" : testCase.expectedOut,
          actualOut: "",
          passed: false,
          isHidden: testCase.isHidden,
          error: "Time Limit Exceeded (3000ms)",
          executionTimeMs: timeoutMs,
        });
      }
    }, timeoutMs);

    pyProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    pyProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    pyProcess.on("error", (err) => {
      clearTimeout(timer);
      if (!isSettled) {
        isSettled = true;
        resolve({
          id: testCase.id,
          input: testCase.isHidden ? "[HIDDEN INPUT]" : testCase.input,
          expectedOut: testCase.isHidden ? "[HIDDEN EXPECTED OUTPUT]" : testCase.expectedOut,
          actualOut: "",
          passed: false,
          isHidden: testCase.isHidden,
          error: `Python runner error: ${err.message}`,
          executionTimeMs: Date.now() - start,
        });
      }
    });

    pyProcess.on("close", () => {
      clearTimeout(timer);
      if (!isSettled) {
        isSettled = true;
        const executionTimeMs = Date.now() - start;
        const actualOut = stdout.trim();
        const passed = normalizeOutput(actualOut) === normalizeOutput(expectedStr);

        resolve({
          id: testCase.id,
          input: testCase.isHidden ? "[HIDDEN INPUT]" : testCase.input,
          expectedOut: testCase.isHidden ? "[HIDDEN EXPECTED OUTPUT]" : testCase.expectedOut,
          actualOut: testCase.isHidden ? (passed ? "[PASSED]" : "[FAILED]") : actualOut,
          passed,
          isHidden: testCase.isHidden,
          error: stderr.trim() || undefined,
          executionTimeMs,
        });
      }
    });
  });
}

function normalizeOutput(str: string): string {
  return str
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

/**
 * Main function to evaluate code against multiple test cases
 */
export async function executeCodeAgainstTestCases(
  code: string,
  language: string,
  testCases: TestCaseInput[],
): Promise<ExecutionResponse> {
  const lang = (language || "javascript").toLowerCase();
  const results: TestCaseResult[] = [];

  for (const tc of testCases) {
    let res: TestCaseResult;
    if (lang === "python" || lang === "py") {
      res = await runPythonTest(code, tc);
    } else {
      res = await runJavaScriptTest(code, tc);
    }
    results.push(res);
  }

  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;

  return {
    language: lang,
    passedCount,
    totalCount,
    allPassed: passedCount === totalCount && totalCount > 0,
    results,
  };
}
