"use client";

import { useVoicePlatformStore } from "@/store/voicePlatformStore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";

export default function MediaStreamSettingsPage() {
  const { media, setMedia } = useVoicePlatformStore();

  return (
    <div className="space-y-8 pb-12">
      <SettingsSectionHeader
        title="Audio, STT & TTS"
        subtitle="Configure the WebSocket leg carriers open toward your app, then choose speech vendors. Voice agents inherit these defaults unless you override per agent later."
      />

      <Card className="glass">
        <CardHeader>
          <CardTitle className="text-base">Stream endpoint</CardTitle>
          <CardDescription>Expose a secure WebSocket that proxies PCM or encoded frames.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 max-w-xl">
          <div className="space-y-2">
            <Label>Stream URL</Label>
            <Input
              value={media.websocketStreamUrl}
              onChange={(e) => setMedia({ websocketStreamUrl: e.target.value })}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Realtime audio</p>
              <p className="text-xs text-muted-foreground">Low-latency chunking for voice replies.</p>
            </div>
            <Switch
              checked={media.realtimeAudioEnabled}
              onCheckedChange={(v) => setMedia({ realtimeAudioEnabled: v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Barge-in</p>
              <p className="text-xs text-muted-foreground">Caller can interrupt TTS playback.</p>
            </div>
            <Switch checked={media.bargeInEnabled} onCheckedChange={(v) => setMedia({ bargeInEnabled: v })} />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">Speech-to-text</CardTitle>
            <CardDescription>Vendor for streaming recognition.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>STT provider</Label>
              <Select
                value={media.sttProvider}
                onValueChange={(v) => setMedia({ sttProvider: v as typeof media.sttProvider })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="google">Google Cloud Speech</SelectItem>
                  <SelectItem value="deepgram">Deepgram</SelectItem>
                  <SelectItem value="assemblyai">AssemblyAI</SelectItem>
                  <SelectItem value="azure">Azure Cognitive Services</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">Text-to-speech</CardTitle>
            <CardDescription>Convert Gemini output to voice (Step 7).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>TTS provider</Label>
              <Select
                value={media.ttsProvider}
                onValueChange={(v) => setMedia({ ttsProvider: v as typeof media.ttsProvider })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="elevenlabs">ElevenLabs</SelectItem>
                  <SelectItem value="google">Google TTS</SelectItem>
                  <SelectItem value="azure">Azure TTS</SelectItem>
                  <SelectItem value="cartesia">Cartesia</SelectItem>
                  <SelectItem value="openai">OpenAI TTS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Voice</Label>
              <Input
                value={media.voiceName}
                onChange={(e) => setMedia({ voiceName: e.target.value })}
                placeholder="Voice display name"
              />
            </div>
            <div className="space-y-2">
              <Label>Language / locale</Label>
              <Input
                value={media.languageCode}
                onChange={(e) => setMedia({ languageCode: e.target.value })}
                placeholder="en-BD, bn-BD, …"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
