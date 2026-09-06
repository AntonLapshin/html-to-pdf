interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}

/** Atom: labeled range slider. Showcase: `Slider / Default`. */
export function Slider({ label, value, min, max, step = 1, unit = "", onChange }: Props) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-sm text-slate-600">
        <span>{label}</span>
        <span className="tabular-nums">
          {value}
          {unit}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </label>
  );
}
