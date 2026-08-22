import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { QUESTION_TYPES, type OptionRow, type QuestionType } from "@/lib/schemas/question";

export { QUESTION_TYPES };
export type { OptionRow, QuestionType };

export function QuestionFields({
  type,
  onTypeChange,
  stem,
  onStemChange,
  mediaUrl,
  onMediaUrlChange,
  tags,
  onTagsChange,
  options,
  onOptionsChange,
}: {
  type: QuestionType;
  onTypeChange: (t: QuestionType) => void;
  stem: string;
  onStemChange: (s: string) => void;
  mediaUrl: string;
  onMediaUrlChange: (s: string) => void;
  tags: string;
  onTagsChange: (s: string) => void;
  options: OptionRow[];
  onOptionsChange: (opts: OptionRow[]) => void;
}) {
  const showOptions = type !== "NUMERIC";

  function updateOption(i: number, patch: Partial<OptionRow>) {
    const next = options.map((o, j) => (j === i ? { ...o, ...patch } : o));
    onOptionsChange(
      type === "MCQ_SINGLE" && patch.isCorrect
        ? next.map((o, j) => (j === i ? o : { ...o, isCorrect: false }))
        : next,
    );
  }

  function addOption() {
    onOptionsChange([...options, { label: "", isCorrect: false }]);
  }

  function removeOption(i: number) {
    onOptionsChange(options.filter((_, j) => j !== i));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type">
          <Select value={type} onChange={(e) => onTypeChange(e.target.value as QuestionType)}>
            {QUESTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Media URL" hint="Optional — image or chart">
          <Input
            type="url"
            value={mediaUrl}
            onChange={(e) => onMediaUrlChange(e.target.value)}
            placeholder="https://…"
          />
        </Field>
      </div>

      <Field label="Stem">
        <Textarea required value={stem} onChange={(e) => onStemChange(e.target.value)} rows={2} />
      </Field>

      {showOptions && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-slate-700">
            Options{" "}
            {type !== "LIKERT" && (
              <span className="font-normal text-slate-400">
                (mark the correct one{type === "MCQ_MULTI" ? "s" : ""})
              </span>
            )}
          </span>
          <div className="flex flex-col gap-2">
            {options.map((option, i) => (
              <div key={i} className="flex items-center gap-2 sm:gap-3">
                <input
                  type={type === "MCQ_SINGLE" ? "radio" : "checkbox"}
                  name="correct"
                  checked={option.isCorrect}
                  onChange={(e) => updateOption(i, { isCorrect: e.target.checked })}
                  title="Correct answer"
                  className="h-4 w-4 shrink-0 accent-indigo-600"
                />
                <Input
                  type="text"
                  value={option.label}
                  onChange={(e) => updateOption(i, { label: e.target.value })}
                  placeholder={`Option ${i + 1}`}
                  className="min-w-0 flex-1"
                />
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  className="shrink-0 text-xs text-slate-400 hover:text-red-600"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addOption}
            className="self-start text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            + Add option
          </button>
        </div>
      )}

      <Field label="Tags" hint="Comma separated, optional">
        <Input type="text" value={tags} onChange={(e) => onTagsChange(e.target.value)} />
      </Field>
    </div>
  );
}
