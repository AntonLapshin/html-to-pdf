interface Props {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}

/** Atom: checkbox toggle. Showcase: `Toggle / On|Off`. */
export function Toggle({ label, checked, onChange }: Props) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-indigo-600"
      />
      <span className="text-sm text-slate-600">{label}</span>
    </label>
  );
}
