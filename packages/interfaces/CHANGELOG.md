# Changelog

All notable changes to this project will be documented in this file.

The file is maintained by [Release Please](https://github.com/googleapis/release-please) based on [Conventional Commits](https://www.conventionalcommits.org) specification,
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.11](https://github.com/waku-org/js-waku/compare/interfaces-v0.0.10...interfaces-v0.0.11) (2023-04-03)

### ⚠ BREAKING CHANGES

- add and implement IReceiver ([#1219](https://github.com/waku-org/js-waku/issues/1219))

### Features

- Add and implement IReceiver ([#1219](https://github.com/waku-org/js-waku/issues/1219)) ([e11e5b4](https://github.com/waku-org/js-waku/commit/e11e5b4870aede7813b3ee4b60f5e625f6eac5a2))

## [0.0.10](https://github.com/waku-org/js-waku/compare/interfaces-v0.0.9...interfaces-v0.0.10) (2023-03-24)

### Bug Fixes

- **utils:** Include all ts files ([#1267](https://github.com/waku-org/js-waku/issues/1267)) ([c284159](https://github.com/waku-org/js-waku/commit/c284159ac8eab5bed2313fa5bc7fbea0e83d390f))

## [0.0.9](https://github.com/waku-org/js-waku/compare/interfaces-v0.0.8...interfaces-v0.0.9) (2023-03-23)

### ⚠ BREAKING CHANGES

- add and implement IReceiver ([#1219](https://github.com/waku-org/js-waku/issues/1219))

### Features

- Add and implement IReceiver ([#1219](https://github.com/waku-org/js-waku/issues/1219)) ([e11e5b4](https://github.com/waku-org/js-waku/commit/e11e5b4870aede7813b3ee4b60f5e625f6eac5a2))

## [0.0.10](https://github.com/waku-org/js-waku/compare/interfaces-v0.0.9...interfaces-v0.0.10) (2023-03-24)

### Bug Fixes

- **utils:** Include all ts files ([#1267](https://github.com/waku-org/js-waku/issues/1267)) ([c284159](https://github.com/waku-org/js-waku/commit/c284159ac8eab5bed2313fa5bc7fbea0e83d390f))

## [0.0.9](https://github.com/waku-org/js-waku/compare/interfaces-v0.0.8...interfaces-v0.0.9) (2023-03-23)

### ⚠ BREAKING CHANGES

- use ISender and deprecate Light Push .push ([#1217](https://github.com/waku-org/js-waku/issues/1217))

### Features

- Add getActiveSubscriptions method ([#1249](https://github.com/waku-org/js-waku/issues/1249)) ([45284db](https://github.com/waku-org/js-waku/commit/45284db963d6d4c90a014391551604c236906b88))
- Use ISender and deprecate Light Push .push ([#1217](https://github.com/waku-org/js-waku/issues/1217)) ([0f6a594](https://github.com/waku-org/js-waku/commit/0f6a59464426b94dd14841de075ff10a4ad52e33))

## [0.0.8](https://github.com/waku-org/js-waku/compare/interfaces-v0.0.7...interfaces-v0.0.8) (2023-03-16)

### ⚠ BREAKING CHANGES

- add custom events to Relay and make observers private ([#1213](https://github.com/waku-org/js-waku/issues/1213))
- enable encoding of `meta` field
- expose pubsub topic in `IDecodedMessage`
- directly convert from ENR to `PeerInfo`, remove unneeded utility
- extract encoder code
- update store.proto
- update message.proto: payload and content topic are always defined
- ConnectionManager and KeepAliveManager ([#1135](https://github.com/waku-org/js-waku/issues/1135))
- bump typescript
- bump libp2p dependencies

### Features

- Add custom events to Relay and make observers private ([#1213](https://github.com/waku-org/js-waku/issues/1213)) ([275b166](https://github.com/waku-org/js-waku/commit/275b16641e620956a5f8ebbb3a8c4156149d489e))
- Codec as a property of the protocol implementations ([a5ff788](https://github.com/waku-org/js-waku/commit/a5ff788eed419556e11319f22ca9e3109c81df92))
- ConnectionManager and KeepAliveManager ([#1135](https://github.com/waku-org/js-waku/issues/1135)) ([24c24cc](https://github.com/waku-org/js-waku/commit/24c24cc27d83ec12de45ef3cf3d00f6eb817e4ca))
- Enable encoding of `meta` field ([bd983ea](https://github.com/waku-org/js-waku/commit/bd983ea48ee73fda5a7137d5ef681965aeabb4a5))
- Expose pubsub topic in `IDecodedMessage` ([628ac50](https://github.com/waku-org/js-waku/commit/628ac50d7104ec3c1dff44db58077a85db6b6aa1)), closes [#1208](https://github.com/waku-org/js-waku/issues/1208)

### Bug Fixes

- Prettier and cspell ignore CHANGELOG ([#1235](https://github.com/waku-org/js-waku/issues/1235)) ([4d7b3e3](https://github.com/waku-org/js-waku/commit/4d7b3e39e6761afaf5d05a13cc4b3c23e15f9bd5))
- Remove initialising peer-exchange while creating a node ([#1158](https://github.com/waku-org/js-waku/issues/1158)) ([1b41569](https://github.com/waku-org/js-waku/commit/1b4156902387ea35b24b3d6f5d22e4635ea8cf18))

### Miscellaneous Chores

- Bump libp2p dependencies ([803ae7b](https://github.com/waku-org/js-waku/commit/803ae7bd8ed3de665026446c23cde90e7eba9d36))
- Bump typescript ([12d86e6](https://github.com/waku-org/js-waku/commit/12d86e6abcc68e27c39ca86b4f0dc2b68cdd6000))
- Directly convert from ENR to `PeerInfo`, remove unneeded utility ([6dbcde0](https://github.com/waku-org/js-waku/commit/6dbcde041ab8fa8c2df75cc25319a0eccf6b0454))
- Extract encoder code ([22ffcf5](https://github.com/waku-org/js-waku/commit/22ffcf571aa3998267f0f3b59576abc38f3f4281))
- Update message.proto: payload and content topic are always defined ([5cf8ed2](https://github.com/waku-org/js-waku/commit/5cf8ed2030c9efbc4c4b66aa801827482c1e4249))
- Update store.proto ([967e6ff](https://github.com/waku-org/js-waku/commit/967e6ffc7ec6f780094e29599c47b723fa222dcc))

## [Unreleased]

### Added

- `multicodec` property on protocol interfaces.

## [0.0.7] - 2023-01-18

### Added

- `IPeerExchange` interface.
- `IEnr` interface.

## [0.0.6] - 2022-12-15

### Changed

- Add `I` prefix to protocol and messages interfaces.
- Renamed node interfaces to include `Node`.
- Renamed `WakuPrivacy` to `RelayNode`.

## [0.0.5] - 2022-11-18

### Added

- Alpha version of `@waku/interfaces`.

[unreleased]: https://github.com/waku-org/js-waku/compare/@waku/interfaces@0.0.7...HEAD
[0.0.7]: https://github.com/waku-org/js-waku/compare/@waku/interfaces@0.0.6...@waku/interfaces@0.0.7
[0.0.6]: https://github.com/waku-org/js-waku/compare/@waku/interfaces@0.0.5...@waku/interfaces@0.0.6
[0.0.5]: https://github.com/waku-org/js-waku/compare/@waku/interfaces@0.0.4...@waku/interfaces@0.0.5
[0.0.4]: https://github.com/waku-org/js-waku/compare/@waku/interfaces@0.0.3...@waku/interfaces@0.0.4
[0.0.3]: https://github.com/waku-org/js-waku/compare/@waku/interfaces@0.0.2...%40waku/create@0.0.3
[0.0.2]: https://github.com/waku-org/js-waku/compare/@waku/interfaces@0.0.1...%40waku/create@0.0.2
[0.0.1]: https://github.com/status-im/js-waku/compare/a20b7809d61ff9a9732aba82b99bbe99f229b935...%40waku/create%400.0.2
