import { waitForRemotePeer } from "@waku/core";
import { createRelayNode } from "@waku/create";
import { EnrDecoder } from "@waku/enr";
import type { RelayNode } from "@waku/interfaces";
import { Protocols } from "@waku/interfaces";
import { expect } from "chai";

import { makeLogFileName, NOISE_KEY_1, Nwaku } from "../src/index.js";

describe("ENR Interop: nwaku", function () {
  let waku: RelayNode;
  let nwaku: Nwaku;

  afterEach(async function () {
    !!nwaku &&
      nwaku.stop().catch((e) => console.log("Nwaku failed to stop", e));
    !!waku && waku.stop().catch((e) => console.log("Waku failed to stop", e));
  });

  it("Relay", async function () {
    this.timeout(20_000);
    nwaku = new Nwaku(makeLogFileName(this));
    await nwaku.start({
      relay: true,
      store: false,
      filter: false,
      lightpush: false,
    });
    const multiAddrWithId = await nwaku.getMultiaddrWithId();

    waku = await createRelayNode({
      staticNoiseKey: NOISE_KEY_1,
    });
    await waku.start();
    await waku.dial(multiAddrWithId);
    await waitForRemotePeer(waku, [Protocols.Relay]);

    const nwakuInfo = await nwaku.info();
    const nimPeerId = await nwaku.getPeerId();

    expect(nwakuInfo.enrUri).to.not.be.undefined;
    const dec = await EnrDecoder.fromString(nwakuInfo.enrUri ?? "");
    expect(dec.peerId?.toString()).to.eq(nimPeerId.toString());
    expect(dec.waku2).to.deep.eq({
      relay: true,
      store: false,
      filter: false,
      lightPush: false,
    });
  });

  it("Relay + Store", async function () {
    this.timeout(20_000);
    nwaku = new Nwaku(makeLogFileName(this));
    await nwaku.start({
      relay: true,
      store: true,
      filter: false,
      lightpush: false,
    });
    const multiAddrWithId = await nwaku.getMultiaddrWithId();

    waku = await createRelayNode({
      staticNoiseKey: NOISE_KEY_1,
    });
    await waku.start();
    await waku.dial(multiAddrWithId);
    await waitForRemotePeer(waku, [Protocols.Relay]);

    const nwakuInfo = await nwaku.info();
    const nimPeerId = await nwaku.getPeerId();

    expect(nwakuInfo.enrUri).to.not.be.undefined;
    const dec = await EnrDecoder.fromString(nwakuInfo.enrUri ?? "");
    expect(dec.peerId?.toString()).to.eq(nimPeerId.toString());
    expect(dec.waku2).to.deep.eq({
      relay: true,
      store: true,
      filter: false,
      lightPush: false,
    });
  });

  it("All", async function () {
    this.timeout(20_000);
    nwaku = new Nwaku(makeLogFileName(this));
    await nwaku.start({
      relay: true,
      store: true,
      filter: true,
      lightpush: true,
    });
    const multiAddrWithId = await nwaku.getMultiaddrWithId();

    waku = await createRelayNode({
      staticNoiseKey: NOISE_KEY_1,
    });
    await waku.start();
    await waku.dial(multiAddrWithId);
    await waitForRemotePeer(waku, [Protocols.Relay]);

    const nwakuInfo = await nwaku.info();
    const nimPeerId = await nwaku.getPeerId();

    expect(nwakuInfo.enrUri).to.not.be.undefined;
    const dec = await EnrDecoder.fromString(nwakuInfo.enrUri ?? "");
    expect(dec.peerId?.toString()).to.eq(nimPeerId.toString());
    expect(dec.waku2).to.deep.eq({
      relay: true,
      store: true,
      filter: true,
      lightPush: true,
    });
  });
});
