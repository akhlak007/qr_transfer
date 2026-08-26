import type { TransportId } from "../core/transport";

export interface SoftwareTransportPipeline<TConfig = unknown, TResult = unknown> {
  readonly transport: TransportId;
  run(config: TConfig): Promise<TResult>;
}

export class TransportPipelineRegistry {
  private readonly pipelines = new Map<TransportId, SoftwareTransportPipeline<any, any>>();

  register<TConfig, TResult>(pipeline: SoftwareTransportPipeline<TConfig, TResult>): this {
    this.pipelines.set(pipeline.transport, pipeline);
    return this;
  }

  get<TConfig, TResult>(transport: TransportId): SoftwareTransportPipeline<TConfig, TResult> {
    const pipeline = this.pipelines.get(transport);
    if (!pipeline) throw new Error(`No transmitter/receiver pipeline registered for ${transport}`);
    return pipeline;
  }

  run<TConfig, TResult>(transport: TransportId, config: TConfig): Promise<TResult> {
    return this.get<TConfig, TResult>(transport).run(config);
  }
}
