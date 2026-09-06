import { useRef } from "react";
import { Button } from "../atoms/Button";

interface Props {
  onFile: (file: File) => void;
  onSample: () => void;
}

/** Molecule: HTML upload dropzone + sample loader. Showcase: `UploadZone / Default`. */
export function UploadZone({ onFile, onSample }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="border-2 border-dashed border-slate-300 bg-white p-8 text-center">
      <input
        ref={ref}
        type="file"
        accept=".html,text/html"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
      <div className="flex items-center justify-center gap-3">
        <Button onClick={() => ref.current?.click()}>Upload HTML</Button>
        <Button variant="secondary" onClick={onSample}>
          Load sample
        </Button>
      </div>
      <p className="mt-2 text-sm text-slate-500">
        Each <code>.page</code> block becomes exactly one PDF page.
      </p>
    </div>
  );
}
