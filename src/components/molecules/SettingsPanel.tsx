import { Slider } from "../atoms/Slider";
import { Toggle } from "../atoms/Toggle";
import type { PdfSettings } from "../../core/settings";

/** Molecule: margin + page-number settings. Showcase: `SettingsPanel / Default`. */
export function SettingsPanel({
  settings,
  onChange,
}: {
  settings: PdfSettings;
  onChange: (s: PdfSettings) => void;
}) {
  return (
    <section className="space-y-4 bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-sm font-semibold text-slate-700">General settings</h2>
      <Slider
        label="Margin"
        value={settings.marginMm}
        min={0}
        max={30}
        unit=" mm"
        onChange={(marginMm) => onChange({ ...settings, marginMm })}
      />
      <Toggle
        label="Show page numbers"
        checked={settings.showPageNumbers}
        onChange={(showPageNumbers) => onChange({ ...settings, showPageNumbers })}
      />
      {settings.showPageNumbers && (
        <label className="flex items-center justify-between text-sm text-slate-600">
          <span>Start from</span>
          <input
            type="number"
            min={1}
            value={settings.startPageNumber}
            onChange={(e) =>
              onChange({
                ...settings,
                startPageNumber: Math.max(1, Number(e.target.value) || 1),
              })
            }
            className="w-20 border border-slate-300 px-2 py-1 text-right tabular-nums"
          />
        </label>
      )}
    </section>
  );
}
