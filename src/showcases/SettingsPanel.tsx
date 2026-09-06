import { SettingsPanel } from "../components/molecules/SettingsPanel";
import { DEFAULT_SETTINGS } from "../core/settings";

export const name = "SettingsPanel";

export const Default = () => (
  <div className="max-w-sm">
    <SettingsPanel settings={DEFAULT_SETTINGS} onChange={() => undefined} />
  </div>
);

export const NoPageNumbers = () => (
  <div className="max-w-sm">
    <SettingsPanel
      settings={{ ...DEFAULT_SETTINGS, showPageNumbers: false }}
      onChange={() => undefined}
    />
  </div>
);
