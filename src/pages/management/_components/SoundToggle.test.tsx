import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SoundToggle } from "./SoundToggle.tsx";
import { audioNotifier } from "@/lib/audioNotification.ts";

describe("SoundToggle Component", () => {
  beforeEach(() => {
    localStorage.clear();
    audioNotifier.resetForTesting();
    audioNotifier.setMuted(false);
  });

  it("1. renders sound enabled button initially", () => {
    render(<SoundToggle />);
    const button = screen.getByRole("button", { name: /mute sound notifications/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("title", "Sound enabled — Click to mute");
  });

  it("2. toggling mutes sound and updates button state and localStorage", () => {
    render(<SoundToggle />);
    const button = screen.getByRole("button");

    fireEvent.click(button);
    expect(audioNotifier.isMuted()).toBe(true);
    expect(localStorage.getItem("smartdine_sound_muted")).toBe("true");

    // Click again to unmute
    fireEvent.click(button);
    expect(audioNotifier.isMuted()).toBe(false);
    expect(localStorage.getItem("smartdine_sound_muted")).toBe("false");
  });

  it("3. renders label when showLabel is true", () => {
    render(<SoundToggle showLabel />);
    expect(screen.getByText("Sound On")).toBeInTheDocument();

    const button = screen.getByRole("button");
    fireEvent.click(button);

    expect(screen.getByText("Muted")).toBeInTheDocument();
  });
});
