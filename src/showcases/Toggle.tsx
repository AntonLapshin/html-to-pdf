import { Toggle } from "../components/atoms/Toggle";

export const name = "Toggle";

export const On = () => <Toggle label="Show page numbers" checked onChange={() => undefined} />;
export const Off = () => <Toggle label="Show page numbers" checked={false} onChange={() => undefined} />;
