import { HealthStatus, type LightNode, Protocols } from "@waku/sdk";
import { expect } from "chai";

import {
  afterEachCustom,
  runMultipleNodes,
  ServiceNodesFleet,
  teardownNodesWithRedundancy
} from "../../src/index.js";

import {
  messagePayload,
  TestDecoder,
  TestEncoder,
  TestShardInfo
} from "./utils.js";

const NUM_NODES = [0, 1, 2, 3];

// TODO(weboko): resolve https://github.com/waku-org/js-waku/issues/2186
describe.skip("Health Manager", function () {
  this.timeout(10_000);

  let waku: LightNode;
  let serviceNodes: ServiceNodesFleet;

  afterEachCustom(this, async () => {
    await teardownNodesWithRedundancy(serviceNodes, waku);
  });

  describe("Should update the health status for protocols", () => {
    this.timeout(10_000);

    NUM_NODES.map((num) => {
      it(`LightPush with ${num} connections`, async function () {
        this.timeout(10_000);
        [serviceNodes, waku] = await runMultipleNodes(
          this.ctx,
          TestShardInfo,
          { lightpush: true, filter: true },
          undefined,
          num
        );

        await waku.lightPush.send(TestEncoder, messagePayload);

        const health = waku.health.getProtocolStatus(Protocols.LightPush);
        if (!health) {
          expect(health).to.not.equal(undefined);
        }

        if (num === 0) {
          expect(health?.status).to.equal(HealthStatus.Unhealthy);
        } else if (num < 2) {
          expect(health?.status).to.equal(HealthStatus.MinimallyHealthy);
        } else if (num >= 2) {
          expect(health?.status).to.equal(HealthStatus.SufficientlyHealthy);
        } else {
          throw new Error("Invalid number of connections");
        }
      });
      it(`Filter with ${num} connections`, async function () {
        [serviceNodes, waku] = await runMultipleNodes(
          this.ctx,
          TestShardInfo,
          { filter: true, lightpush: true },
          undefined,
          num
        );

        const { error } = await waku.filter.subscribe([TestDecoder], () => {});

        if (error) {
          expect(error).to.not.equal(undefined);
        }

        const health = waku.health.getProtocolStatus(Protocols.Filter);
        if (!health) {
          expect(health).to.not.equal(undefined);
        }

        if (num === 0) {
          expect(health?.status).to.equal(HealthStatus.Unhealthy);
        } else if (num < 2) {
          expect(health?.status).to.equal(HealthStatus.MinimallyHealthy);
        } else if (num >= 2) {
          expect(health?.status).to.equal(HealthStatus.SufficientlyHealthy);
        } else {
          throw new Error("Invalid number of connections");
        }
      });
    });
  });
});
