import { FilterProtocolOptions } from "@waku/interfaces";

import * as C from "./constants.js";

export const buildConfig = (
  config?: Partial<FilterProtocolOptions>
): FilterProtocolOptions => {
  return {
    keepAliveIntervalMs: config?.keepAliveIntervalMs || C.DEFAULT_KEEP_ALIVE,
    pingsBeforePeerRenewed:
      config?.pingsBeforePeerRenewed || C.DEFAULT_MAX_PINGS,
    enableLightPushFilterCheck:
      config?.enableLightPushFilterCheck || C.DEFAULT_LIGHT_PUSH_FILTER_CHECK
  };
};
