export interface CameraTrackLike { stop(): void; }
export interface CameraStreamLike { getTracks(): CameraTrackLike[]; }
export interface VideoSinkLike { srcObject: unknown; }

export interface CameraLifecycleDependencies {
  acquire(): Promise<CameraStreamLike>;
  requestFrame(callback: FrameRequestCallback): number;
  cancelFrame(id: number): void;
  setInterval(callback: () => void, milliseconds: number): number;
  clearInterval(id: number): void;
  revokeObjectUrl(url: string): void;
}

export class CameraLifecycleController {
  private readonly video: VideoSinkLike;
  private readonly dependencies: CameraLifecycleDependencies;
  private generation = 0;
  private acquisition: Promise<CameraStreamLike> | null = null;
  private stream: CameraStreamLike | null = null;
  private rafId: number | null = null;
  private intervals = new Set<number>();
  private objectUrls = new Set<string>();
  private disposed = false;

  constructor(video: VideoSinkLike, dependencies: CameraLifecycleDependencies) {
    this.video = video;
    this.dependencies = dependencies;
  }

  start(): Promise<CameraStreamLike> {
    if (this.disposed) return Promise.reject(new Error("Camera lifecycle is disposed"));
    if (this.stream) return Promise.resolve(this.stream);
    return this.acquireSerialized();
  }

  reconnect(): Promise<CameraStreamLike> {
    if (this.disposed) return Promise.reject(new Error("Camera lifecycle is disposed"));
    if (this.acquisition) return this.acquisition;
    this.stopStream();
    return this.acquireSerialized();
  }

  scheduleFrame(callback: FrameRequestCallback): number {
    if (this.rafId !== null) this.dependencies.cancelFrame(this.rafId);
    this.rafId = this.dependencies.requestFrame(callback);
    return this.rafId;
  }

  registerInterval(callback: () => void, milliseconds: number): number {
    const id = this.dependencies.setInterval(callback, milliseconds);
    this.intervals.add(id);
    return id;
  }

  registerObjectUrl(url: string): string { this.objectUrls.add(url); return url; }

  clearScheduledWork(): void {
    if (this.rafId !== null) this.dependencies.cancelFrame(this.rafId);
    this.rafId = null;
    for (const id of this.intervals) this.dependencies.clearInterval(id);
    this.intervals.clear();
  }

  stop(): void {
    this.generation++;
    this.acquisition = null;
    this.clearScheduledWork();
    this.stopStream();
    for (const url of this.objectUrls) this.dependencies.revokeObjectUrl(url);
    this.objectUrls.clear();
  }

  dispose(): void { this.stop(); this.disposed = true; }

  private acquireSerialized(): Promise<CameraStreamLike> {
    if (this.acquisition) return this.acquisition;
    const requestedGeneration = ++this.generation;
    const acquisition = this.dependencies.acquire().then((stream) => {
      if (this.disposed || requestedGeneration !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("Stale camera acquisition discarded");
      }
      this.stream = stream;
      this.video.srcObject = stream;
      return stream;
    }).finally(() => {
      if (this.acquisition === acquisition) this.acquisition = null;
    });
    this.acquisition = acquisition;
    return acquisition;
  }

  private stopStream(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
  }
}
