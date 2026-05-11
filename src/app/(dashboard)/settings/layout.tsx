import { SettingsVoiceNav } from "@/components/settings/SettingsVoiceNav";

export default function SettingsSectionLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-7xl mx-auto w-full">
      <SettingsVoiceNav />
      {children}
    </div>
  );
}
