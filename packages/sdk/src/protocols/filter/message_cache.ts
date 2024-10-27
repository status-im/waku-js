import type { IProtoMessage, Libp2p } from "@waku/interfaces";
import { messageHashStr } from "@waku/message-hash";

type Hash = string;
type Timestamp = number;

export class MessageCache {
  private intervalID: number | undefined = undefined;
  private readonly messages: Map<Hash, Timestamp> = new Map();

  public constructor(libp2p: Libp2p) {
    this.onStart = this.onStart.bind(this);
    this.onStop = this.onStop.bind(this);

    libp2p.addEventListener("start", this.onStart);
    libp2p.addEventListener("stop", this.onStop);
  }

  public set(pubsubTopic: string, message: IProtoMessage): void {
    const hash = messageHashStr(pubsubTopic, message);
    this.messages.set(hash, Date.now());
  }

  public has(pubsubTopic: string, message: IProtoMessage): boolean {
    const hash = messageHashStr(pubsubTopic, message);
    return this.messages.has(hash);
  }

  private onStart(): void {
    if (this.intervalID) {
      return;
    }

    this.intervalID = setInterval(() => {
      this.prune();
    }, 60_000) as unknown as number;
  }

  private onStop(): void {
    if (!this.intervalID) {
      return;
    }

    clearInterval(this.intervalID);
  }

  private prune(): void {
    Array.from(this.messages.entries())
      .filter(([_, seenTimestamp]) => Date.now() - seenTimestamp >= 60_000)
      .map(([hash, _]) => hash)
      .forEach((hash) => this.messages.delete(hash));
  }
}
