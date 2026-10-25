import { useState, useEffect } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { audioNotifier } from "@/lib/audioNotification.ts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";

interface Props {
  className?: string;
  showLabel?: boolean;
}

export function SoundToggle({ className, showLabel = false }: Props) {
  const [muted, setMuted] = useState(audioNotifier.isMuted());

  useEffect(() => {
    return audioNotifier.subscribe((newMuted) => {
      setMuted(newMuted);
    });
  }, []);

  const toggleSound = () => {
    const next = !muted;
    audioNotifier.setMuted(next);
    if (!next) {
      audioNotifier.testSound();
      toast.success("Sound notifications enabled", { duration: 2000 });
    } else {
      toast.info("Sound notifications muted", { duration: 2000 });
    }
  };

  return (
    <Button
      variant="ghost"
      size={showLabel ? "sm" : "icon"}
      onClick={toggleSound}
      className={className}
      title={muted ? "Sound muted — Click to enable" : "Sound enabled — Click to mute"}
      aria-label={muted ? "Enable sound notifications" : "Mute sound notifications"}
    >
      {muted ? (
        <VolumeX className="size-4 text-muted-foreground" />
      ) : (
        <Volume2 className="size-4 text-primary" />
      )}
      {showLabel && (
        <span className="text-xs ml-1.5 font-medium">
          {muted ? "Muted" : "Sound On"}
        </span>
      )}
    </Button>
  );
}
