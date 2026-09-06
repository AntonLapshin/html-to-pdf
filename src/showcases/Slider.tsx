import { Slider } from "../components/atoms/Slider";

export const name = "Slider";

export const Default = () => (
  <div className="max-w-sm">
    <Slider label="Margin" value={10} min={0} max={30} unit=" mm" onChange={() => undefined} />
  </div>
);

export const Dpi = () => (
  <div className="max-w-sm">
    <Slider label="DPI" value={192} min={72} max={300} step={12} onChange={() => undefined} />
  </div>
);
