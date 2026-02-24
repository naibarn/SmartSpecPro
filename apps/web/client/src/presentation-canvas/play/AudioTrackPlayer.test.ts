import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AudioTrackPlayer } from "./AudioTrackPlayer";

// Mock the Audio constructor — JSDOM does not implement HTMLAudioElement.
const mockAudioInstance = {
  src: "",
  volume: 1,
  loop: false,
  currentTime: 0,
  play: vi.fn().mockResolvedValue(undefined),
  pause: vi.fn(),
};
const MockAudio = vi.fn(() => mockAudioInstance);

describe("AudioTrackPlayer", () => {
  beforeEach(() => {
    vi.stubGlobal("Audio", MockAudio);
    vi.clearAllMocks();
    // Restore default mock implementation after clearing (tests 11/12 override it)
    MockAudio.mockImplementation(() => mockAudioInstance);
    // Reset mock instance state between tests
    mockAudioInstance.src = "";
    mockAudioInstance.volume = 1;
    mockAudioInstance.loop = false;
    mockAudioInstance.currentTime = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // --- onSlideEnter ---

  it("onSlideEnter(null) does not create an audio element", () => {
    const player = new AudioTrackPlayer(null);
    player.onSlideEnter(null);
    // Audio was never constructed for per-slide track
    expect(MockAudio).not.toHaveBeenCalled();
    player.destroy();
  });

  it("onSlideEnter(track) creates audio element with correct src and volume", () => {
    const player = new AudioTrackPlayer(null);
    player.onSlideEnter({ url: "https://cdn.example.com/audio.mp3", volume: 0.7, startAtMs: 0 });
    expect(MockAudio).toHaveBeenCalledWith("https://cdn.example.com/audio.mp3");
    expect(mockAudioInstance.volume).toBe(0.7);
    player.destroy();
  });

  it("onSlideEnter(track) calls audio.play()", () => {
    const player = new AudioTrackPlayer(null);
    player.onSlideEnter({ url: "https://cdn.example.com/audio.mp3", volume: 0.8, startAtMs: 0 });
    expect(mockAudioInstance.play).toHaveBeenCalledOnce();
    player.destroy();
  });

  it("onSlideEnter(track) sets currentTime to startAtMs / 1000", () => {
    const player = new AudioTrackPlayer(null);
    player.onSlideEnter({ url: "https://cdn.example.com/audio.mp3", volume: 1.0, startAtMs: 3000 });
    expect(mockAudioInstance.currentTime).toBe(3);
    player.destroy();
  });

  it("onSlideEnter() called twice without onSlideExit pauses the first audio immediately", () => {
    const firstSlideMock = { src: "", volume: 1, loop: false, currentTime: 0, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() };
    const secondSlideMock = { src: "", volume: 1, loop: false, currentTime: 0, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() };
    let callCount = 0;
    MockAudio.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? firstSlideMock : secondSlideMock;
    });
    const player = new AudioTrackPlayer(null);
    player.onSlideEnter({ url: "https://cdn.example.com/slide1.mp3", volume: 1.0, startAtMs: 0 });
    player.onSlideEnter({ url: "https://cdn.example.com/slide2.mp3", volume: 1.0, startAtMs: 0 });
    // First slide audio should be paused when second onSlideEnter is called
    expect(firstSlideMock.pause).toHaveBeenCalledOnce();
    expect(secondSlideMock.play).toHaveBeenCalledOnce();
    player.destroy();
  });

  // --- onSlideExit ---

  it("onSlideExit() calls audio.pause() on the per-slide audio element", () => {
    const player = new AudioTrackPlayer(null);
    player.onSlideEnter({ url: "https://cdn.example.com/audio.mp3", volume: 1.0, startAtMs: 0 });
    player.onSlideExit();
    expect(mockAudioInstance.pause).toHaveBeenCalledOnce();
    player.destroy();
  });

  it("onSlideExit() resets per-slide audio currentTime to 0", () => {
    const player = new AudioTrackPlayer(null);
    player.onSlideEnter({ url: "https://cdn.example.com/audio.mp3", volume: 1.0, startAtMs: 0 });
    mockAudioInstance.currentTime = 5; // simulate mid-play
    player.onSlideExit();
    expect(mockAudioInstance.currentTime).toBe(0);
    player.destroy();
  });

  it("onSlideExit() is a no-op when no per-slide audio was started", () => {
    const player = new AudioTrackPlayer(null);
    // Should not throw
    expect(() => player.onSlideExit()).not.toThrow();
    player.destroy();
  });

  // --- project-wide audio ---

  it("project audio with loop: true sets audio.loop = true", () => {
    const player = new AudioTrackPlayer({
      url: "https://cdn.example.com/bg.mp3",
      volume: 0.4,
      loop: true,
      fadeOutMs: null,
    });
    expect(MockAudio).toHaveBeenCalledWith("https://cdn.example.com/bg.mp3");
    expect(mockAudioInstance.loop).toBe(true);
    player.destroy();
  });

  it("project audio with loop: false does not set audio.loop = true", () => {
    const player = new AudioTrackPlayer({
      url: "https://cdn.example.com/bg.mp3",
      volume: 0.4,
      loop: false,
      fadeOutMs: null,
    });
    expect(mockAudioInstance.loop).toBe(false);
    player.destroy();
  });

  it("project audio volume is set from projectAudioTrack.volume", () => {
    const player = new AudioTrackPlayer({
      url: "https://cdn.example.com/bg.mp3",
      volume: 0.3,
      loop: true,
      fadeOutMs: null,
    });
    expect(mockAudioInstance.volume).toBe(0.3);
    player.destroy();
  });

  // --- pause / resume ---

  it("pause() pauses both per-slide and project audio elements", () => {
    // Use separate mock instances for per-slide vs project audio
    const projectAudioMock = { src: "", volume: 0.5, loop: true, currentTime: 0, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() };
    const slideAudioMock = { src: "", volume: 1.0, loop: false, currentTime: 0, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() };
    let callCount = 0;
    MockAudio.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? projectAudioMock : slideAudioMock;
    });

    const player = new AudioTrackPlayer({ url: "https://cdn.example.com/bg.mp3", volume: 0.5, loop: true, fadeOutMs: null });
    player.onSlideEnter({ url: "https://cdn.example.com/slide.mp3", volume: 1.0, startAtMs: 0 });
    player.pause();

    expect(projectAudioMock.pause).toHaveBeenCalledOnce();
    expect(slideAudioMock.pause).toHaveBeenCalledOnce();
    player.destroy();
  });

  it("resume() calls play() on both per-slide and project audio elements", () => {
    const projectAudioMock = { src: "", volume: 0.5, loop: true, currentTime: 0, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() };
    const slideAudioMock = { src: "", volume: 1.0, loop: false, currentTime: 0, play: vi.fn().mockResolvedValue(undefined), pause: vi.fn() };
    let callCount = 0;
    MockAudio.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? projectAudioMock : slideAudioMock;
    });

    const player = new AudioTrackPlayer({ url: "https://cdn.example.com/bg.mp3", volume: 0.5, loop: true, fadeOutMs: null });
    player.onSlideEnter({ url: "https://cdn.example.com/slide.mp3", volume: 1.0, startAtMs: 0 });
    player.pause();
    // Clear play call count from initial play()
    projectAudioMock.play.mockClear();
    slideAudioMock.play.mockClear();
    player.resume();

    expect(projectAudioMock.play).toHaveBeenCalledOnce();
    expect(slideAudioMock.play).toHaveBeenCalledOnce();
    player.destroy();
  });

  it("resume() is a no-op when no audio is active", () => {
    const player = new AudioTrackPlayer(null);
    expect(() => player.resume()).not.toThrow();
    player.destroy();
  });

  // --- destroy ---

  it("destroy() pauses all audio elements as cleanup", () => {
    const player = new AudioTrackPlayer({
      url: "https://cdn.example.com/bg.mp3",
      volume: 0.5,
      loop: true,
      fadeOutMs: null,
    });
    player.destroy();
    expect(mockAudioInstance.pause).toHaveBeenCalled();
  });
});
