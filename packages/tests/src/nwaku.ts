import fs from "fs";

import type { PeerId } from "@libp2p/interface-peer-id";
import { peerIdFromString } from "@libp2p/peer-id";
import { Multiaddr, multiaddr } from "@multiformats/multiaddr";
import { DefaultPubSubTopic } from "@waku/core";
import { isDefined } from "@waku/utils";
import { bytesToHex, hexToBytes } from "@waku/utils/bytes";
import debug from "debug";
import Docker from "dockerode";
import portfinder from "portfinder";

import { existsAsync, mkdirAsync, openAsync } from "./async_fs.js";
import { delay } from "./delay.js";
import waitForLine from "./log_file.js";

const log = debug("waku:nwaku");

const WAKU_SERVICE_NODE_PARAMS =
  process.env.WAKU_SERVICE_NODE_PARAMS ?? undefined;
const NODE_READY_LOG_LINE = "Node setup complete";

const DOCKER_IMAGE_NAME =
  process.env.WAKUNODE_IMAGE || "statusteam/nim-waku:v0.16.0";

const isGoWaku = DOCKER_IMAGE_NAME.includes("go-waku");

const LOG_DIR = "./log";

const OneMillion = BigInt(1_000_000);

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
BigInt.prototype.toJSON = function toJSON() {
  return Number(this);
};

export interface Args {
  staticnode?: string;
  nat?: "none";
  listenAddress?: string;
  relay?: boolean;
  rpc?: boolean;
  rpcAdmin?: boolean;
  nodekey?: string;
  portsShift?: number;
  logLevel?: LogLevel;
  lightpush?: boolean;
  filter?: boolean;
  store?: boolean;
  peerExchange?: boolean;
  discv5Discovery?: boolean;
  storeMessageDbUrl?: string;
  topics?: string;
  rpcPrivate?: boolean;
  websocketSupport?: boolean;
  tcpPort?: number;
  rpcPort?: number;
  websocketPort?: number;
  discv5BootstrapNode?: string;
  discv5UdpPort?: number;
}

export enum LogLevel {
  Error = "ERROR",
  Info = "INFO",
  Warn = "WARN",
  Debug = "DEBUG",
  Trace = "TRACE",
  Notice = "NOTICE",
  Fatal = "FATAL",
}

export interface KeyPair {
  privateKey: string;
  publicKey: string;
}

export interface MessageRpcQuery {
  payload: string; // Hex encoded data string without `0x` prefix.
  contentTopic?: string;
  timestamp?: bigint; // Unix epoch time in nanoseconds as a 64-bits integer value.
}

export interface MessageRpcResponse {
  payload: string;
  contentTopic?: string;
  version?: number;
  timestamp?: bigint; // Unix epoch time in nanoseconds as a 64-bits integer value.
}

export class Nwaku {
  private docker: Docker;
  private containerId?: string;
  private peerId?: PeerId;
  private multiaddrWithId?: Multiaddr;
  private websocketPort?: number;
  private readonly logPath: string;
  private rpcPort?: number;

  /**
   * Convert a [[WakuMessage]] to a [[WakuRelayMessage]]. The latter is used
   * by the nwaku JSON-RPC API.
   */
  static toMessageRpcQuery(message: {
    payload: Uint8Array;
    contentTopic: string;
    timestamp?: Date;
  }): MessageRpcQuery {
    if (!message.payload) {
      throw "Attempting to convert empty message";
    }

    let timestamp;
    if (message.timestamp) {
      timestamp = BigInt(message.timestamp.valueOf()) * OneMillion;
    }

    return {
      payload: Buffer.from(message.payload).toString("base64"),
      contentTopic: message.contentTopic,
      timestamp,
    };
  }

  constructor(logName: string) {
    this.docker = new Docker();
    this.logPath = `${LOG_DIR}/nwaku_${logName}.log`;
  }

  async start(args: Args = {}): Promise<void> {
    try {
      await existsAsync(LOG_DIR);
    } catch (e) {
      try {
        await mkdirAsync(LOG_DIR);
      } catch (e) {
        // Looks like 2 tests tried to create the director at the same time,
        // it can be ignored
      }
    }

    await openAsync(this.logPath, "w");

    const mergedArgs = defaultArgs();

    // nwaku takes some time to bind port so to decrease chances of conflict
    // we also randomize the first port that portfinder will try
    const startPort = Math.floor(Math.random() * (65535 - 1025) + 1025);

    const ports: number[] = await new Promise((resolve, reject) => {
      portfinder.getPorts(4, { port: startPort }, (err, ports) => {
        if (err) reject(err);
        resolve(ports);
      });
    });

    if (isGoWaku && !args.logLevel) {
      args.logLevel = LogLevel.Debug;
    }

    const [rpcPort, tcpPort, websocketPort, discv5UdpPort] = ports;
    this.rpcPort = rpcPort;
    this.websocketPort = websocketPort;

    // Object.assign overrides the properties with the source (if there are conflicts)
    Object.assign(
      mergedArgs,
      {
        rpcPort,
        tcpPort,
        websocketPort,
        ...(args?.peerExchange && { discv5UdpPort }),
      },
      args
    );

    process.env.WAKUNODE2_STORE_MESSAGE_DB_URL = "";

    const argsArray = argsToArray(mergedArgs);

    const natExtIp = "--nat=extip:127.0.0.1";
    const rpcAddress = "--rpc-address=0.0.0.0";
    argsArray.push(natExtIp, rpcAddress);

    if (WAKU_SERVICE_NODE_PARAMS) {
      argsArray.push(WAKU_SERVICE_NODE_PARAMS);
    }
    log(`nwaku args: ${argsArray.join(" ")}`);

    if (this.containerId) {
      this.stop();
    }

    try {
      await this.confirmImageExistsOrPull();
      const container = await this.docker.createContainer({
        Image: DOCKER_IMAGE_NAME,
        HostConfig: {
          PortBindings: {
            [`${rpcPort}/tcp`]: [{ HostPort: rpcPort.toString() }],
            [`${tcpPort}/tcp`]: [{ HostPort: tcpPort.toString() }],
            [`${websocketPort}/tcp`]: [{ HostPort: websocketPort.toString() }],
            ...(args?.peerExchange && {
              [`${discv5UdpPort}/udp`]: [
                { HostPort: discv5UdpPort.toString() },
              ],
            }),
          },
        },
        ExposedPorts: {
          [`${rpcPort}/tcp`]: {},
          [`${tcpPort}/tcp`]: {},
          [`${websocketPort}/tcp`]: {},
          ...(args?.peerExchange && {
            [`${discv5UdpPort}/udp`]: {},
          }),
        },
        Cmd: argsArray,
      });
      await container.start();

      const logStream = fs.createWriteStream(this.logPath);

      container.logs(
        { follow: true, stdout: true, stderr: true },
        (err, stream) => {
          if (err) {
            throw err;
          }
          if (stream) {
            stream.pipe(logStream);
          }
        }
      );

      this.containerId = container.id;

      log(
        `nwaku ${
          this.containerId
        } started at ${new Date().toLocaleTimeString()}`
      );

      log(`Waiting to see '${NODE_READY_LOG_LINE}' in nwaku logs`);
      await this.waitForLog(NODE_READY_LOG_LINE, 15000);
      if (process.env.CI) await delay(100);
      log("nwaku node has been started");
    } catch (error) {
      log(`Error starting nwaku: ${error}`);
      if (this.containerId) await this.stop();
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (!this.containerId) throw "nwaku containerId not set";

    const container = this.docker.getContainer(this.containerId);

    log(
      `Shutting down nwaku container ID ${
        this.containerId
      } at ${new Date().toLocaleTimeString()}`
    );

    await container.remove({ force: true });

    this.containerId = undefined;
  }

  async waitForLog(msg: string, timeout: number): Promise<void> {
    return waitForLine(this.logPath, msg, timeout);
  }

  /** Calls nwaku JSON-RPC API `get_waku_v2_admin_v1_peers` to check
   * for known peers
   * @throws if nwaku isn't started.
   */
  async peers(): Promise<string[]> {
    this.checkProcess();

    return this.rpcCall<string[]>("get_waku_v2_admin_v1_peers", []);
  }

  async info(): Promise<RpcInfoResponse> {
    this.checkProcess();

    return this.rpcCall<RpcInfoResponse>("get_waku_v2_debug_v1_info", []);
  }

  async sendMessage(
    message: MessageRpcQuery,
    pubSubTopic: string = DefaultPubSubTopic
  ): Promise<boolean> {
    this.checkProcess();

    if (typeof message.timestamp === "undefined") {
      message.timestamp = BigInt(new Date().valueOf()) * OneMillion;
    }

    return this.rpcCall<boolean>("post_waku_v2_relay_v1_message", [
      pubSubTopic,
      message,
    ]);
  }

  async messages(
    pubsubTopic: string = DefaultPubSubTopic
  ): Promise<MessageRpcResponse[]> {
    this.checkProcess();

    const msgs = await this.rpcCall<MessageRpcResponse[]>(
      "get_waku_v2_relay_v1_messages",
      [pubsubTopic]
    );

    return msgs.filter(isDefined);
  }

  async getAsymmetricKeyPair(): Promise<KeyPair> {
    this.checkProcess();

    const { privateKey, publicKey, seckey, pubkey } = await this.rpcCall<{
      seckey: string;
      pubkey: string;
      privateKey: string;
      publicKey: string;
    }>("get_waku_v2_private_v1_asymmetric_keypair", []);

    // To be removed once https://github.com/vacp2p/rfc/issues/507 is fixed
    if (seckey) {
      return { privateKey: seckey, publicKey: pubkey };
    } else {
      return { privateKey, publicKey };
    }
  }

  async postAsymmetricMessage(
    message: MessageRpcQuery,
    publicKey: Uint8Array,
    pubSubTopic?: string
  ): Promise<boolean> {
    this.checkProcess();

    if (!message.payload) {
      throw "Attempting to send empty message";
    }

    return this.rpcCall<boolean>("post_waku_v2_private_v1_asymmetric_message", [
      pubSubTopic ? pubSubTopic : DefaultPubSubTopic,
      message,
      "0x" + bytesToHex(publicKey),
    ]);
  }

  async getAsymmetricMessages(
    privateKey: Uint8Array,
    pubSubTopic?: string
  ): Promise<MessageRpcResponse[]> {
    this.checkProcess();

    return await this.rpcCall<MessageRpcResponse[]>(
      "get_waku_v2_private_v1_asymmetric_messages",
      [
        pubSubTopic ? pubSubTopic : DefaultPubSubTopic,
        "0x" + bytesToHex(privateKey),
      ]
    );
  }

  async getSymmetricKey(): Promise<Uint8Array> {
    this.checkProcess();

    return this.rpcCall<string>(
      "get_waku_v2_private_v1_symmetric_key",
      []
    ).then(hexToBytes);
  }

  async postSymmetricMessage(
    message: MessageRpcQuery,
    symKey: Uint8Array,
    pubSubTopic?: string
  ): Promise<boolean> {
    this.checkProcess();

    if (!message.payload) {
      throw "Attempting to send empty message";
    }

    return this.rpcCall<boolean>("post_waku_v2_private_v1_symmetric_message", [
      pubSubTopic ? pubSubTopic : DefaultPubSubTopic,
      message,
      "0x" + bytesToHex(symKey),
    ]);
  }

  async getSymmetricMessages(
    symKey: Uint8Array,
    pubSubTopic?: string
  ): Promise<MessageRpcResponse[]> {
    this.checkProcess();

    return await this.rpcCall<MessageRpcResponse[]>(
      "get_waku_v2_private_v1_symmetric_messages",
      [
        pubSubTopic ? pubSubTopic : DefaultPubSubTopic,
        "0x" + bytesToHex(symKey),
      ]
    );
  }

  async getPeerId(): Promise<PeerId> {
    if (this.peerId) return this.peerId;
    this.peerId = await this._getPeerId();
    return this.peerId;
  }

  async getMultiaddrWithId(): Promise<Multiaddr> {
    if (this.multiaddrWithId) return this.multiaddrWithId;

    const peerId = await this.getPeerId();

    this.multiaddrWithId = multiaddr(
      `/ip4/127.0.0.1/tcp/${this.websocketPort}/ws/p2p/${peerId.toString()}`
    );
    return this.multiaddrWithId;
  }

  private async _getPeerId(): Promise<PeerId> {
    if (this.peerId) {
      return this.peerId;
    }
    const res = await this.info();
    const multiaddrWithId = res.listenAddresses
      .map((ma) => multiaddr(ma))
      .find((ma) => ma.protoNames().includes("ws"));
    if (!multiaddrWithId) throw "Nwaku did not return a ws multiaddr";
    const peerIdStr = multiaddrWithId.getPeerId();
    if (!peerIdStr) throw "Nwaku multiaddr does not contain peerId";
    this.peerId = peerIdFromString(peerIdStr);

    return this.peerId;
  }

  get rpcUrl(): string {
    return `http://127.0.0.1:${this.rpcPort}/`;
  }

  private async rpcCall<T>(
    method: string,
    params: Array<string | number | unknown>
  ): Promise<T> {
    log("RPC Query: ", method, params);
    const res = await fetch(this.rpcUrl, {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method,
        params,
      }),
      headers: new Headers({ "Content-Type": "application/json" }),
    });
    const json = await res.json();
    log(`RPC Response: `, JSON.stringify(json));
    return json.result;
  }

  private checkProcess(): void {
    if (!this.containerId || !this.docker.getContainer(this.containerId)) {
      throw "Nwaku container hasn't started";
    }
  }

  async confirmImageExistsOrPull(): Promise<void> {
    log(`Confirming that image ${DOCKER_IMAGE_NAME} exists`);

    const doesImageExist = this.docker.getImage(DOCKER_IMAGE_NAME);
    if (!doesImageExist) {
      await new Promise<void>((resolve, reject) => {
        this.docker.pull(DOCKER_IMAGE_NAME, {}, (err, stream) => {
          if (err) {
            reject(err);
          }
          this.docker.modem.followProgress(stream, (err, result) => {
            if (err) {
              reject(err);
            }
            if (result) {
              resolve();
            }
          });
        });
      });
    }
    log(`Image ${DOCKER_IMAGE_NAME} successfully found`);
  }
}

export function argsToArray(args: Args): Array<string> {
  const array = [];

  for (const [key, value] of Object.entries(args)) {
    // Change the key from camelCase to kebab-case
    const kebabKey = key.replace(/([A-Z])/g, (_, capital) => {
      return "-" + capital.toLowerCase();
    });

    const arg = `--${kebabKey}=${value}`;
    array.push(arg);
  }

  return array;
}

export function defaultArgs(): Args {
  return {
    listenAddress: "0.0.0.0",
    rpc: true,
    relay: false,
    rpcAdmin: true,
    websocketSupport: true,
    logLevel: LogLevel.Trace,
  };
}

interface RpcInfoResponse {
  // multiaddrs including peer id.
  listenAddresses: string[];
  enrUri?: string;
}

export function base64ToUtf8(b64: string): string {
  return Buffer.from(b64, "base64").toString("utf-8");
}
