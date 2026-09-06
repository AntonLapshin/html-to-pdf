import { Toggle } from "../atoms/Toggle";
import { Slider } from "../atoms/Slider";
import { clampSettings, type PdfSettings } from "../../core/settings";

/** Molecule: full Phase-2 settings — size, margins, numbers, DPI/quality. */
export function SettingsPanel({
  settings,
  onChange,
}: {
  settings: PdfSettings;
  onChange: (s: PdfSettings) => void;
}) {
  const set = (patch: Partial<PdfSettings>) => onChange(clampSettings({ ...settings, ...patch }));

  return (
    <section className="space-y-4 bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-sm font-semibold text-slate-700">General settings</h2>

      <label className="flex items-center justify-between text-sm text-slate-600">
        <span>Page size</span>
        <select
          value={settings.pageSize}
          onChange={(e) => set({ pageSize: e.target.value as PdfSettings["pageSize"] })}
          className="border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="a4">A4 (210×297mm)</option>
          <option value="letter">Letter (215.9×279.4mm)</option>
        </select>
      </label>

      <Toggle
        label="Custom per-edge margins"
        checked={settings.marginMode === "custom"}
        onChange={(v) => set({ marginMode: v ? "custom" : "uniform" })}
      />
      {settings.marginMode === "uniform" ? (
        <Slider
          label="Margin"
          value={settings.marginMm}
          min={0}
          max={30}
          unit=" mm"
          onChange={(marginMm) => set({ marginMm })}
        />
      ) : (
        <div className="space-y-2">
          {(["top", "right", "bottom", "left"] as const).map((edge) => (
            <Slider
              key={edge}
              label={`Margin ${edge}`}
              value={settings.marginsMm[edge]}
              min={0}
              max={30}
              unit=" mm"
              onChange={(v) => set({ marginsMm: { ...settings.marginsMm, [edge]: v } })}
            />
          ))}
        </div>
      )}

      <Toggle
        label="Show page numbers"
        checked={settings.showPageNumbers}
        onChange={(showPageNumbers) => set({ showPageNumbers })}
      />
      {settings.showPageNumbers && (
        <>
          <label className="flex items-center justify-between text-sm text-slate-600">
            <span>Start from</span>
            <input
              type="number"
              min={1}
              value={settings.startPageNumber}
              onChange={(e) => set({ startPageNumber: Math.max(1, Number(e.target.value) || 1) })}
              className="w-20 border border-slate-300 px-2 py-1 text-right tabular-nums"
            />
          </label>
          <label className="flex items-center justify-between text-sm text-slate-600">
            <span>Position</span>
            <select
              value={settings.numberPosition}
              onChange={(e) => set({ numberPosition: e.target.value as PdfSettings["numberPosition"] })}
              className="border border-slate-300 px-2 py-1 text-sm"
            >
              <option value="bottom-center">Bottom center</option>
              <option value="bottom-left">Bottom left</option>
              <option value="bottom-right">Bottom right</option>
            </select>
          </label>
        </>
      )}

      <Slider
        label="DPI"
        value={settings.dpi}
        min={72}
        max={300}
        step={12}
        onChange={(dpi) => set({ dpi })}
      />
      <Slider
        label="JPEG quality"
        value={Math.round(settings.quality * 100)}
        min={10}
        max={100}
        step={1}
        unit="%"
        onChange={(v) => set({ quality: v / 100 })}
      />
      <p className="text-xs text-slate-400">
        DPI sets raster resolution (scale = DPI/96); quality re-encodes the JPEG like book's reencodeImage.
      </p>
    </section>
  );
}
