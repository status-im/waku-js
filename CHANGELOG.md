# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- `addPeerToAddressBook` is now async.

## [0.26.0] - 2022-09-08

### Added

- Simple connection management that selects the most recent connection for store, light push and filter requests.
- `createLightNode` to create a Waku node for resource restricted environment with Light Push, Filter and Relay.
- `createPrivacyNode` to create a Waku node for privacy preserving usage with Relay only.
- `createFullNode` to create a Waku node for with all protocols, for **testing purposes only**.

### Changed

- **breaking**: `DecryptionParams` may be passed when using `queryHistory` instead of just keys.
- Examples have been moved to https://github.com/waku-org/js-waku-examples.
- `Waku` is now defined as an interface with `WakuNode` an implementation of it.
- `createWaku` is deprecated in favour of `createLightNode` and `createPrivacyNode`.
- `waitForRemotePeer` can throw, default behaviour has changed.

### Fixed

- doc: add missing modules.

## [0.25.0] - 2022-09-05

### Changed

- Published files moved from `build` to `dist/`.
- Migrate from ts-proto to protons;
  the latter does not bring Buffer/Long deps, is ESM compatible and remove the need for bufbuild and protoc.
- Move package to `"type": "module"`, it is now a [pure ESM package](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c).
- Use ESM code in Mocha and Karma tests.
- Upgrade `dns-query` dependency, breaking change on `DnsNodeDiscovery` API.
- Bump many libp2p libraries to their latest version (which usually are pure ESM).
- Replace webpack with parcel for bundling
- Examples: Updated store-js and relay-js to demonstrate usage of ESM bundle in `<script>` tag.
- Remove need to polyfill `buffer`.
- **breaking**: Various API changes. Refer to tests to check proper usage of the new API.
- **breaking**: `createWaku` is in separate exports path.
- **breaking**: Bootstrap class split: dns discovery, static list.
- **breaking**: bundled files are now under `bundle/`.

### Fixed

- size-limit config to test several usages of Waku.
- `buffer` is not needed in the browser.

### Removed

- `terser` minification and `gzip` compressions have been removed.

## [0.24.0] - 2022-05-27

### Added

- `waitForRemotePeer` now accepts a `timeoutMs` parameter that rejects the promise if it is reached. By default, no timeout is applied.
- **Experimental** support for the [Waku Filter](https://rfc.vac.dev/spec/12/) protocol (client side) added, currently only works in NodeJS.

### Changed

- `waitForRemotePeer` waits for a Relay peer by default instead of Relay and Store.
- **Breaking**: Removed dupe secp256k1 code, removed some unused APIs.

## [0.23.0] - 2022-05-19

### Added

- Some dependencies that were used but not declared (often transient).

### Changed

- Replaced deprecated `multihashes` with `multiformats`.

### Removed

- No more `assert` usage.

## [0.22.0] - 2022-05-10

### Changed

- Replaced `secp256k1` and hence `elliptic` dependencies with `@noble/secp256k1`,
  reducing package size, number of dependency and removing need for `crypto-browserify` polyfill.

## [0.21.0] - 2022-05-5

### Added

- Support of the `waku2` ENR key: When using DNS Discovery, wanted node capabilities (e.g. relay, store) must be passed. 

### Changed

- Prefer the use of `BigInt` over integer literal (`n` postfix) to facilitate the use of a polyfill.

### Fixed

- Declare `it-pipe` dependency, import as per `it-pipe@2.0.0` convention.

## [0.20.0] - 2022-03-29

### Changed

- Examples: Add Relay JavaScript example.
- **Breaking**: Moved utf-8 conversion functions to `utils`.
- Froze `libp2p-gossipsub` to `0.13.0` as new patch version bring breaking changes.

### Fixed

- Replace Base 64 buggy conversion functions with `uint8arrays`.

### Removed

- **Breaking**: Removed `equalByteArrays`, use `uint8arrays/equals` instead.
  See changes in `eth-pm` example.
- **Breaking**: Removed deprecated utils functions.

## [0.19.2] - 2022-03-21

### Fixed

- Enable usage in NodeJS by fixing `exports` field and usage of the `crypto` module.

## [0.19.1] - 2022-03-10

### Added

- When using `Waku.create`, `bootstrap.peers` now accepts an array of `Multiaddr`.
- Exports `Protocols` for easy usage with `waitForRemotePeer`.

## [0.19.0] - 2022-03-09

### Added

- New `pubsub_topic` field on the `cursor` of Waku Store queries ([#585](https://github.com/status-im/js-waku/issues/595)).

### Changed

- Add `exports` to `package.json` for NodeJS usage (not officially supported but helpful for experiments).

### Fixed

- Handle errors thrown by `bytesToUtf8`.
- `WakuMessage.timestamp` field must use nanoseconds (was using microseconds).

### Removed

- Removed `ecies-geth` dependency.

## [0.18.0] - 2022-02-24

### Changed

- Replaced `rlp` dependency with `@ethersproject/rlp`.
- **Breaking**: `staticNoiseKey` changed from `Buffer` to `Uint8Array`.
- Implement Waku Store 2.0.0-beta4. The `WakuMessage.timestamp` field now stores nanoseconds over the wire.
- **Breaking**: `HistoryRPC.createQuery` takes `Date` instead of `number` for `startTime` and `endTime`.

### Removed

- `base64url` and `bigint-buffer` dependencies.

## [0.17.0] - 2022-02-16

### Changed

- **Breaking**: Upgrade `libp2p` to `0.36.2` & `libp2p-gossipsub` to `0.13.0`. Some APIs are now async.
- docs: Various improvements.
- Ran `npm audit fix`.
- `Waku.dial` accepts protocols expected from the peer. Defaults to Waku Relay only.
- Deprecated `hexToBuf` & `bufToHex` in favour of `hexToBytes` & `bytesToHex` to move towards removing the `buffer` polyfill.
- **Breaking**: Replaced `getNodesFromHostedJson` with `getPredefinedBootstrapNodes`. Now, it uses a hardcoded list of nodes.

### Removed

- `axios` dependency in favour of fetch.

## [0.16.0] - 2022-01-31

### Changed

- Test: Upgrade nim-waku node to v0.7. 
- Doc: Renamed "DappConnect" to "Waku Connect".
- Docs: API Docs are now available at https://js-waku.wakuconnect.dev/.
- **Breaking**: Replace `waitForConnectedPeer` with `waitForRemotePeer`; the new method checks that the peer is ready before resolving the promise.

## [0.15.0] - 2022-01-17

### Added

- Implement DNS Discovery as per [EIP-1459](https://eips.ethereum.org/EIPS/eip-1459),
  with ENR records as defined in [31/WAKU2-ENR](https://rfc.vac.dev/spec/31/);
  Available by passing `{ bootstrap: { enrUrl: enrtree://... } }` to `Waku.create`.
- When using `addDecryptionKey`,
  it is now possible to specify the decryption method and the content topics of the messages to decrypt;
  this is to reduce the number of decryption attempt done and improve performance.

### Changed

- Test: Upgrade nim-waku node to v0.6.
- **Breaking**: Renamed `getBootstrapNodes` to `getNodesFromHostedJson`.
- Minimum node version changed to 16.
- **Breaking**: Changed `Waku.create` bootstrap option from `{ bootstrap: boolean }` to `{ bootstrap: BootstrapOptions }`.
  Replace `{ boostrap: true }` with `{ boostrap: { default: true } }` to retain same behaviour.
- **Breaking**: `WakuMessage.decode` and `WakuMessage.decodeProto` now accepts method and content topics for the decryption key.
  `WakuMessage.decode(bytes, [key])` becomes `WakuMessage.decode(bytes, [{key: key}])`.

### Fixed

- Doc: Some broken links.

## [0.14.2] - 2021-11-30

### Changed

- Examples: JS examples uses local ESM folder to replicate behaviour of js-waku publish package.

### Fixed

- `TypeError` issue related to constructors using js-waku in a JS project
  ([#323](https://github.com/status-im/js-waku/issues/323)).

## [0.14.1] - 2021-10-22

### Fixed
- Issue when importing the `utils` module.

## [0.14.0] - 2021-10-13

### Added
- If the `callback` function passed to`WakuStore.queryHistory` returns `true`, then no further pages are retrieved from the store.
- Use webpack to build UMD bundle of the library, see [README](./README.md) for usage.

### Changed
- **Breaking**: Renamed `WakuStore.QueryOptions`'s `direction` to `pageDirection` (and its type) as it only affects the page ordering,
  not the ordering of messages with the page.

### Fixed
- Docs: Ensure that `WakuStore`'s `QueryOptions` documentation is available [online](https://js-waku.wakuconnect.dev/).

## [0.13.1] - 2021-09-21

### Fixed

- `Error: Bootstrap requires a list of peer addresses` error when using `bootstrap: true` in `Waku.create`.

## [0.13.0] - 2021-09-16

### Changed
- Upgrade libp2p libraries: @chainsafe/libp2p-noise@4.1.1, libp2p@0.32.4, libp2p-gossipsub@0.11.1.
- Connects to a limited number of bootstrap nodes, defaults to 1. 

## [0.12.2] - 2021-09-21

### Fixed

- **hot fix**: `Error: Bootstrap requires a list of peer addresses` error when using `bootstrap: true` in `Waku.create`.

## [0.12.1] - 2021-09-16

### Changed
- **hot fix**: Connects to a limited number of bootstrap nodes, defaults to 1.

## [0.12.0] - 2021-09-2

### Added
- Examples (eth-pm): Encrypt Public Key Messages using symmetric encryption. 
- Guides: Encrypt messages using Waku Message Version 1.
- Allow passing decryption keys in hex string format.
- Allow passing decryption keys to `WakuStore` instance to avoid having to pass them at every `queryHistory` call.
- Allow passing decryption keys to `Waku` instance to avoid having to pass them to both `WakuRelay` and `WakuStore`.
- `Waku.waitForConnectedPeer` helper to ensure that we are connected to Waku peers when using the bootstrap option.

### Changed
- **Breaking**: Moved `startTime` and `endTime` for history queries to a `timeFilter` property as both or neither must be passed; passing only one parameter is not supported.
- Renamed and promote the usage of `generateSymmetricKey()` to generate random symmetric keys.
- Improved errors thrown by `WakuStore.queryHistory`.

### Fixed
- Buffer concat error when using symmetric encryption in the browser.

## [0.11.0] - 2021-08-20

### Added
- Examples: New [Ethereum Private Message Using Wallet Encryption Web App](./examples/eth-pm-wallet-encryption/README.md)
  example that demonstrates the usage of `eth_encrypt` API (available on Metamask) and EIP-712 for typed structured data signing.
- New `bootstrap` option for `Waku.create` to easily connect to Waku nodes upon start up.
- Support for `startTime` and `endTime` in Store queries to filter by time window as per [21/WAKU2-FTSTORE](https://rfc.vac.dev/spec/21/).

### Changed
- Renamed `discover.getStatusFleetNodes` to `discovery.getBootstrapNodes`; 
  Changed the API to allow retrieval of bootstrap nodes from other sources.
- Examples: Renamed `eth-dm` to `eth-pm`; "Direct Message" can lead to confusion with "Direct Connection" that
  refers to low latency network connections.
- Examples (eth-pm): Use sign typed data EIP-712 instead of personal sign. 
- Upgraded dependencies to remove warning at installation.
- **Breaking**: Moved `DefaultPubSubTopic` to `waku.ts` and fixed the casing.
- **Breaking**: Rename all `pubsubTopic` occurrences to `pubSubTopic`, across all interfaces.

### Removed
- Examples (cli-chat): The focus of this library is Web environment;
  Several examples now cover usage of Waku Relay and Waku Store making cli-chat example obsolete;
  web-chat POC should be preferred to use the [TOY-CHAT](https://rfc.vac.dev/spec/22/) protocol.
- `ChatMessage` has been moved from js-waku to web-chat example;
  it is a type used for the [TOY-CHAT](https://rfc.vac.dev/spec/22/) protocol;
  js-waku users should not build on top if this toy protocol and instead design message data structures appropriate to their use case.
- Unused dependencies & scripts.

## [0.10.0] - 2021-08-06

### Added
- Relay and ReactJS guides and examples
  ([#56](https://github.com/status-im/js-waku/issues/56)).

### Changed
- **Breaking**: The `WakuMessage` APIs have been changed to move `contentTopic` out of the optional parameters.
- **Breaking**: Move `contentTopics` out the `WakuStore.queryHistory`'s optional parameters.
- **Breaking**: `WakuStore.queryHistory` throws when encountering an error instead of returning a `null` value.

### Removed
- Examples (web-chat): Remove broken `/fleet` command.
- **Breaking**: Removed `DefaultContentTopic` as developers must choose a content topic for their app;
  recommendations for content topic can be found at https://rfc.vac.dev/spec/23/.

### Fixed
- `WakuMessage.payloadAsUtf8` returning garbage on utf-8 non-ascii characters.
- `ChatMessage.payloadAsUtf8` returning garbage on utf-8 non-ascii characters.

## [0.9.0] - 2021-07-26

### Changed
- **Breaking**: Store Response Protobuf changed to align with nim-waku v0.5
  ([nim-waku#676](https://github.com/status-im/nim-waku/pull/676)).

## [0.8.1] - 2021-07-16

### Added
- Examples (web-chat): New `/fleet` command to switch connection between Status prod and test fleets.
- Export `generatePrivateKey` and `getPublicKey` directly from the root.
- Usage of the encryption and signature APIs to the readme.
- Support multiple protocol ids for Waku Relay, allowing interoperability with nim-waku v0.4 and latest master
  ([#238](https://github.com/status-im/js-waku/issues/238)).

### Changed
- **Breaking**: Renamed `WakuRelay.(add|delete)PrivateDecryptionKey` to `WakuRelay.(add|delete)DecryptionKey` to make it clearer that it accepts both symmetric keys and asymmetric private keys.
- Upgrade libp2p to 0.32.0.
- **Breaking**: Rename `keepAlive` option to `pingKeepAlive`.
- Introduced new `relayKeepAlive` option on `Waku` with a default to 59s to send ping messages over relay to ensure the relay stream stays open.
  This is a workaround until [js-libp2p#744](https://github.com/libp2p/js-libp2p/issues/744) is done as there are issues when TCP(?) timeouts and the stream gets closed
  ([#185](https://github.com/status-im/js-waku/issues/185), [js-libp2p#939](https://github.com/libp2p/js-libp2p/issues/939))

### Fixed
- Align `WakuMessage` readme example with actual code behaviour.
- Remove infinite loop when an error with Waku Store is encountered.

## [0.8.0] - 2021-07-15

### Added
- `WakuRelay.deleteObserver` to allow removal of observers, useful when a React component add observers when mounting and needs to delete it when unmounting. 
- Keep alive feature that pings host regularly, reducing the chance of connections being dropped due to idle.
  Can be disabled or default frequency (10s) can be changed when calling `Waku.create`.
- New `lib/utils` module for easy, dependency-less hex/bytes conversions.
- New `peers` and `randomPeer` methods on `WakuStore` and `WakuLightPush` to have a better idea of available peers;
  Note that it does not check whether Waku node is currently connected to said peers.
- Enable passing decryption private keys to `WakuStore.queryHistory`.
- Test: Introduce testing in browser environment (Chrome) using Karma.
- Add support for Waku Message version 1: Asymmetric encryption, symmetric encryption, and signature of the data.

### Changed
- **Breaking**: Auto select peer if none provided for store and light push protocols.
- Upgrade to `libp2p@0.31.7` and `libp2p-gossipsub@0.10.0` to avoid `TextEncoder` errors in ReactJS tests.
- Disable keep alive by default as latest nim-waku release does not support ping protocol.
- **Breaking**: Optional parameters for `WakuMessage.fromBytes` and `WakuMessage.fromUtf8String` are now passed in a single `Options` object.
- **Breaking**: `WakuMessage` static functions are now async to allow for encryption and decryption.
- **Breaking**: `WakuMessage` constructor is now private, `from*` and `decode*` function should be used.
- `WakuMessage` version 1 is partially supported, enabling asymmetrical encryption and signature of messages;
  this can be done by passing keys to `WakuMessage.from*` and `WakuMessage.decode*` methods.
- Examples (eth-dm): Use Waku Message version 1 encryption scheme instead of `eth-crypto`.
- Examples (eth-dm): Use Protobuf for direct messages instead of JSON ([#214](https://github.com/status-im/js-waku/issues/214)).

### Fixed
- Disable `keepAlive` if set to `0`.

## [0.7.0] - 2021-06-15

### Changed
- Test: Upgrade nim-waku node to v0.4.
- Waku Light Push upgraded to `2.0.0-beta1`.
- Examples (web chat): Catch error if chat message decoding fails.
- Examples (web chat): Do not send message if shift/alt/ctrl is pressed, enabling multiline messages.

## [0.6.0] - 2021-06-09

### Changed
- **Breaking**: Websocket protocol is not automatically added anymore if the user specifies a protocol in `libp2p.modules`
  when using `Waku.create`.
- **Breaking**: Options passed to `Waku.create` used to be passed to `Libp2p.create`;
  Now, only the `libp2p` property is passed to `Libp2p.create`, allowing for a cleaner interface.
- Examples (cli chat): Use tcp protocol instead of websocket.  

### Added
- Enable access to `WakuMessage.timestamp`.
- Examples (web chat): Use `WakuMessage.timestamp` as unique key for list items.
- Doc: Link to new [topic guidelines](https://rfc.vac.dev/spec/23/) in README.
- Doc: Link to [Waku v2 Toy Chat specs](https://rfc.vac.dev/spec/22/) in README.
- Examples (web chat): Persist nick.
- Support for custom PubSub Topics to `Waku`, `WakuRelay`, `WakuStore` and `WakuLightPush`;
  Passing a PubSub Topic is optional and still defaults to `/waku/2/default-waku/proto`;
  JS-Waku currently supports one, and only, PubSub topic per instance.  

## [0.5.0] - 2021-05-21

### Added
- Implement [Waku v2 Light Push protocol](https://rfc.vac.dev/spec/19/).
- Expose `Direction` enum from js-waku root (it was only accessible via the proto module).
- Examples (cli chat): Use light push to send messages if `--lightPush` is passed.
- Examples (cli chat): Print usage if `--help` is passed.

## [0.4.0] - 2021-05-18

### Added
- `callback` argument to `WakuStore.queryHistory()`, called as messages are retrieved
  ; Messages are retrieved using pagination, and it may take some time to retrieve all messages,
  with the `callback` function, messages are processed as soon as they are received. 

### Changed
- Testing: Upgrade nim-waku node to v0.3.
- **Breaking**: Modify `WakuStore.queryHistory()` to accept one `Object` instead of multiple individual arguments.
- `getStatusFleetNodes` return prod nodes by default, instead of test nodes.
- Examples (web chat): Connect to prod fleet by default, test fleet for local development.
- Examples (cli chat): Connect to test fleet by default, use `--prod` to connect to prod fleet.

### Fixed
- Expose `Enviroment` and `Protocol` enums to pass to `getStatusFleetNodes`.

## [0.3.0] - 2021-05-15

### Added
- `getStatusFleetNodes` to connect to Status' nim-waku nodes.

### Changed
- Clarify content topic format in README.md.

## Removed
- Unused dependencies.

## [0.2.0] - 2021-05-14

### Added
- `WakuRelay.getPeers` method.
- Use `WakuRelay.getPeers` in web chat app example to disable send button.

### Changed
- Enable passing `string`s to `addPeerToAddressBook`.
- Use `addPeerToAddressBook` in examples and usage doc.
- Settle on `js-waku` name across the board.
- **Breaking**: `RelayDefaultTopic` renamed to `DefaultPubsubTopic`.

## [0.1.0] - 2021-05-12

### Added
- Add usage section to the README.
- Support of [Waku v2 Relay](https://rfc.vac.dev/spec/11/).
- Support of [Waku v2 Store](https://rfc.vac.dev/spec/13/).
- [Node Chat App example]().
- [ReactJS Chat App example](./examples/web-chat).
- [Typedoc Documentation](https://js-waku.wakuconnect.dev/).

[Unreleased]: https://github.com/status-im/js-waku/compare/v0.26.0...HEAD
[0.26.0]: https://github.com/status-im/js-waku/compare/v0.25.0...v0.26.0
[0.25.0]: https://github.com/status-im/js-waku/compare/v0.24.0...v0.25.0
[0.24.0]: https://github.com/status-im/js-waku/compare/v0.23.0...v0.24.0
[0.23.0]: https://github.com/status-im/js-waku/compare/v0.22.0...v0.23.0
[0.22.0]: https://github.com/status-im/js-waku/compare/v0.21.0...v0.22.0
[0.21.0]: https://github.com/status-im/js-waku/compare/v0.20.0...v0.21.0
[0.20.0]: https://github.com/status-im/js-waku/compare/v0.19.2...v0.20.0
[0.19.2]: https://github.com/status-im/js-waku/compare/v0.19.0...v0.19.2
[0.19.1]: https://github.com/status-im/js-waku/compare/v0.19.0...v0.19.1
[0.19.0]: https://github.com/status-im/js-waku/compare/v0.18.0...v0.19.0
[0.18.0]: https://github.com/status-im/js-waku/compare/v0.17.0...v0.18.0
[0.17.0]: https://github.com/status-im/js-waku/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/status-im/js-waku/compare/v0.15.0...v0.16.0
[0.15.0]: https://github.com/status-im/js-waku/compare/v0.14.2...v0.15.0
[0.14.2]: https://github.com/status-im/js-waku/compare/v0.14.1...v0.14.2
[0.14.1]: https://github.com/status-im/js-waku/compare/v0.14.0...v0.14.1
[0.14.0]: https://github.com/status-im/js-waku/compare/v0.13.1...v0.14.0
[0.13.1]: https://github.com/status-im/js-waku/compare/v0.13.0...v0.13.1
[0.13.0]: https://github.com/status-im/js-waku/compare/v0.12.0...v0.13.0
[0.12.2]: https://github.com/status-im/js-waku/compare/v0.12.1...v0.12.2
[0.12.1]: https://github.com/status-im/js-waku/compare/v0.12.0...v0.12.1
[0.12.0]: https://github.com/status-im/js-waku/compare/v0.11.0...v0.12.0
[0.11.0]: https://github.com/status-im/js-waku/compare/v0.10.0...v0.11.0
[0.10.0]: https://github.com/status-im/js-waku/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/status-im/js-waku/compare/v0.8.1...v0.9.0
[0.8.1]: https://github.com/status-im/js-waku/compare/v0.8.0...v0.8.1
[0.8.1]: https://github.com/status-im/js-waku/compare/v0.8.0...v0.8.1
[0.8.0]: https://github.com/status-im/js-waku/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/status-im/js-waku/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/status-im/js-waku/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/status-im/js-waku/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/status-im/js-waku/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/status-im/js-waku/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/status-im/js-waku/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/status-im/js-waku/compare/f46ce77f57c08866873b5c80acd052e0ddba8bc9...v0.1.0
