import { describe, it, expect, beforeEach, vi } from "vitest";
import { audioNotifier } from "./audioNotification.ts";

describe("Audio Notification Service", () => {
  let mockOscillator: {
    type: string;
    frequency: { setValueAtTime: ReturnType<typeof vi.fn> };
    connect: ReturnType<typeof vi.fn>;
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
  };

  let mockGain: {
    gain: {
      setValueAtTime: ReturnType<typeof vi.fn>;
      linearRampToValueAtTime: ReturnType<typeof vi.fn>;
      exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
    };
    connect: ReturnType<typeof vi.fn>;
  };

  let mockAudioContext: {
    currentTime: number;
    state: AudioContextState;
    destination: Record<string, unknown>;
    createOscillator: ReturnType<typeof vi.fn>;
    createGain: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    localStorage.clear();
    audioNotifier.resetForTesting();
    audioNotifier.setMuted(false);

    mockOscillator = {
      type: "sine",
      frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };

    mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    };

    mockAudioContext = {
      currentTime: 10,
      state: "running" as AudioContextState,
      destination: {},
      createOscillator: vi.fn(() => mockOscillator),
      createGain: vi.fn(() => mockGain),
      resume: vi.fn().mockResolvedValue(undefined),
    };

    // Attach mock AudioContext to window
    function MockAudioContext() {
      return mockAudioContext;
    }
    (window as unknown as { AudioContext: unknown }).AudioContext = MockAudioContext;
  });

  it("1. initial state is unmuted by default", () => {
    expect(audioNotifier.isMuted()).toBe(false);
  });

  it("2. setMuted toggles mute state and persists to localStorage", () => {
    audioNotifier.setMuted(true);
    expect(audioNotifier.isMuted()).toBe(true);
    expect(localStorage.getItem("smartdine_sound_muted")).toBe("true");

    audioNotifier.setMuted(false);
    expect(audioNotifier.isMuted()).toBe(false);
    expect(localStorage.getItem("smartdine_sound_muted")).toBe("false");
  });

  it("3. subscriber callbacks receive mute status updates", () => {
    const listener = vi.fn();
    const unsubscribe = audioNotifier.subscribe(listener);

    audioNotifier.setMuted(true);
    expect(listener).toHaveBeenCalledWith(true);

    audioNotifier.setMuted(false);
    expect(listener).toHaveBeenCalledWith(false);

    unsubscribe();
    audioNotifier.setMuted(true);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("4. playOrderChime synthesizes two-tone bell when unmuted", () => {
    audioNotifier.setMuted(false);
    audioNotifier.playOrderChime();

    // Two tones should be created
    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(2);
    expect(mockAudioContext.createGain).toHaveBeenCalledTimes(2);
    expect(mockOscillator.start).toHaveBeenCalledTimes(2);
    expect(mockOscillator.stop).toHaveBeenCalledTimes(2);
  });

  it("5. playOrderChime does not play when muted", () => {
    audioNotifier.setMuted(true);
    audioNotifier.playOrderChime();

    expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
    expect(mockAudioContext.createGain).not.toHaveBeenCalled();
  });

  it("6. playRequestChime synthesizes tones when unmuted and silent when muted", () => {
    audioNotifier.setMuted(false);
    audioNotifier.playRequestChime();

    expect(mockAudioContext.createOscillator).toHaveBeenCalledTimes(2);
    expect(mockAudioContext.createGain).toHaveBeenCalledTimes(2);

    mockAudioContext.createOscillator.mockClear();
    mockAudioContext.createGain.mockClear();

    audioNotifier.setMuted(true);
    audioNotifier.playRequestChime();
    expect(mockAudioContext.createOscillator).not.toHaveBeenCalled();
  });

  it("7. testSound creates a preview tone even if muted, for user testing", () => {
    audioNotifier.testSound();
    expect(mockAudioContext.createOscillator).toHaveBeenCalled();
  });
});
