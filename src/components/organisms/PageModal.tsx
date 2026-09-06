import { Button } from "../atoms/Button";

/** Organism: fullscreen expanded page view (accurate PDF preview). */
export function PageModal({
  index,
  total,
  srcDoc,
  onClose,
  onPrev,
  onNext,
}: {
  index: number;
  total: number;
  srcDoc: string;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-full w-full max-w-3xl flex-col bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <span className="text-sm text-slate-600">
            Page {index + 1} of {total}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onPrev} disabled={index === 0}>
              ← Prev
            </Button>
            <Button
              variant="secondary"
              onClick={onNext}
              disabled={index === total - 1}
            >
              Next →
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
        <div className="overflow-auto bg-slate-200 p-4">
          <div className="mx-auto aspect-[210/297] w-full bg-white shadow">
            <iframe
              title={`expanded-page-${index + 1}`}
              srcDoc={srcDoc}
              sandbox=""
              className="h-full w-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
