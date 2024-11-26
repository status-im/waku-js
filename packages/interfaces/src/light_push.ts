import { IBaseProtocolCore } from "./protocols.js";
import type { ISender } from "./sender.js";

export type ILightPush = ISender & { protocol: IBaseProtocolCore };
