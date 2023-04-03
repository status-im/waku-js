import { expect } from "chai";

import { argsToArray, defaultArgs } from "../src/index.js";

describe("nwaku", () => {
  it("Correctly serialized arguments", function () {
    const args = defaultArgs();
    Object.assign(args, { portsShift: 42 });

    const actual = argsToArray(args);

    const expected = [
      "--listen-address=0.0.0.0",
      "--rpc=true",
      "--relay=false",
      "--rpc-admin=true",
      "--websocket-support=true",
      "--log-level=TRACE",
      "--ports-shift=42",
    ];

    expect(actual).to.deep.equal(expected);
  });
});
