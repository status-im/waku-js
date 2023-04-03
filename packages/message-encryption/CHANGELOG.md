# Changelog

All notable changes to this project will be documented in this file.

The file is maintained by [Release Please](https://github.com/googleapis/release-please) based on [Conventional Commits](https://www.conventionalcommits.org) specification,
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @waku/core bumped from 0.0.11 to 0.0.12
    - @waku/interfaces bumped from 0.0.8 to 0.0.9

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @waku/core bumped from 0.0.12 to 0.0.13
    - @waku/interfaces bumped from 0.0.9 to 0.0.10
    - @waku/proto bumped from 0.0.3 to 0.0.4
    - @waku/utils bumped from 0.0.2 to 0.0.3

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @waku/core bumped from 0.0.14 to 0.0.15

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @waku/core bumped from 0.0.15 to 0.0.16
    - @waku/interfaces bumped from 0.0.10 to 0.0.11
    - @waku/utils bumped from 0.0.3 to 0.0.4

## [0.0.10](https://github.com/waku-org/js-waku/compare/message-encryption-v0.0.9...message-encryption-v0.0.10) (2023-03-16)

### ⚠ BREAKING CHANGES

- add exports map to @waku/utils ([#1201](https://github.com/waku-org/js-waku/issues/1201))
- enable encoding of `meta` field
- expose pubsub topic in `IDecodedMessage`
- update message.proto: payload and content topic are always defined
- bump typescript

### Features

- Enable encoding of `meta` field ([bd983ea](https://github.com/waku-org/js-waku/commit/bd983ea48ee73fda5a7137d5ef681965aeabb4a5))
- Export `Decoder`, `Encoder` and `DecodedMessage` types from root ([da1b18d](https://github.com/waku-org/js-waku/commit/da1b18d9956259af4cb2e6f7c1f06de52b6ec3ac)), closes [#1010](https://github.com/waku-org/js-waku/issues/1010)
- Expose pubsub topic in `IDecodedMessage` ([628ac50](https://github.com/waku-org/js-waku/commit/628ac50d7104ec3c1dff44db58077a85db6b6aa1)), closes [#1208](https://github.com/waku-org/js-waku/issues/1208)

### Bug Fixes

- Prettier and cspell ignore CHANGELOG ([#1235](https://github.com/waku-org/js-waku/issues/1235)) ([4d7b3e3](https://github.com/waku-org/js-waku/commit/4d7b3e39e6761afaf5d05a13cc4b3c23e15f9bd5))

### Miscellaneous Chores

- Add exports map to @waku/utils ([#1201](https://github.com/waku-org/js-waku/issues/1201)) ([a30b2bd](https://github.com/waku-org/js-waku/commit/a30b2bd747dedeef69b46cfafb88898ba35d8f67))
- Bump typescript ([12d86e6](https://github.com/waku-org/js-waku/commit/12d86e6abcc68e27c39ca86b4f0dc2b68cdd6000))
- Update message.proto: payload and content topic are always defined ([5cf8ed2](https://github.com/waku-org/js-waku/commit/5cf8ed2030c9efbc4c4b66aa801827482c1e4249))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @waku/core bumped from 0.0.12 to 0.0.13
    - @waku/interfaces bumped from 0.0.9 to 0.0.10
    - @waku/proto bumped from 0.0.3 to 0.0.4
    - @waku/utils bumped from 0.0.2 to 0.0.3

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @waku/core bumped from 0.0.14 to 0.0.15

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @waku/core bumped from 0.0.15 to 0.0.16
    - @waku/interfaces bumped from 0.0.10 to 0.0.11
    - @waku/utils bumped from 0.0.3 to 0.0.4

## [0.0.10](https://github.com/waku-org/js-waku/compare/message-encryption-v0.0.9...message-encryption-v0.0.10) (2023-03-16)

### ⚠ BREAKING CHANGES

- add exports map to @waku/utils ([#1201](https://github.com/waku-org/js-waku/issues/1201))
- enable encoding of `meta` field
- expose pubsub topic in `IDecodedMessage`
- update message.proto: payload and content topic are always defined
- bump typescript

### Features

- Enable encoding of `meta` field ([bd983ea](https://github.com/waku-org/js-waku/commit/bd983ea48ee73fda5a7137d5ef681965aeabb4a5))
- Export `Decoder`, `Encoder` and `DecodedMessage` types from root ([da1b18d](https://github.com/waku-org/js-waku/commit/da1b18d9956259af4cb2e6f7c1f06de52b6ec3ac)), closes [#1010](https://github.com/waku-org/js-waku/issues/1010)
- Expose pubsub topic in `IDecodedMessage` ([628ac50](https://github.com/waku-org/js-waku/commit/628ac50d7104ec3c1dff44db58077a85db6b6aa1)), closes [#1208](https://github.com/waku-org/js-waku/issues/1208)

### Bug Fixes

- Prettier and cspell ignore CHANGELOG ([#1235](https://github.com/waku-org/js-waku/issues/1235)) ([4d7b3e3](https://github.com/waku-org/js-waku/commit/4d7b3e39e6761afaf5d05a13cc4b3c23e15f9bd5))

### Miscellaneous Chores

- Add exports map to @waku/utils ([#1201](https://github.com/waku-org/js-waku/issues/1201)) ([a30b2bd](https://github.com/waku-org/js-waku/commit/a30b2bd747dedeef69b46cfafb88898ba35d8f67))
- Bump typescript ([12d86e6](https://github.com/waku-org/js-waku/commit/12d86e6abcc68e27c39ca86b4f0dc2b68cdd6000))
- Update message.proto: payload and content topic are always defined ([5cf8ed2](https://github.com/waku-org/js-waku/commit/5cf8ed2030c9efbc4c4b66aa801827482c1e4249))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @waku/core bumped from \* to 0.0.11
    - @waku/interfaces bumped from \* to 0.0.8
    - @waku/proto bumped from \* to 0.0.3
    - @waku/utils bumped from \* to 0.0.2

## [Unreleased]

### Changed

- `createEncoder` now take an object of type `EncoderOptions` instead of `contentTopic` and `ephemeral`
- For Ecies, `createEncoder` now take an object of type `EncoderOptions` instead of `contentTopic`, `ephemeral`, `publicKey` and `sigPrivKey`
- For Symmetric, `createEncoder` now take an object of type `EncoderOptions` instead of `contentTopic`, `ephemeral`, `symKey` and `sigPrivKey`

## [0.0.9] - 2023-01-25

### Fixed

- Moved `@chai` and `@fast-check` to `devDependencies` list.

## [0.0.8] - 2023-01-18

### Changed

- Export `Encoder` and `Decoder` types.
- Moved `@chai` and `@fast-check` to `dependencies` list.
- Added missing `@js-sha3` and `@debug` to `dependencies` list.

## [0.0.7] - 2022-12-19

### Fixed

- Incorrect `proto` import.

## [0.0.6] - 2022-12-16

### Fixed

- Type resolution when using `moduleResolution: node`.

## [0.0.5] - 2022-12-15

### Added

- Add `@multiformats/multiaddr` as peer dependency.
- New `createEncoder` and `createDecoder` functions so that the consumer does not deal with Encoder/Decoder classes.
-

### Changed

- `Asymmetric` renamed to `ECIES` to follow RFC terminology.
- Split `ECIES` and `symmetric` packages, all items are now export from two different paths: `@waku/message-encryption/ecies` and `@waku/message-encryption/symmetric`.
- remove `asym` and `sym` prefix from exported items as they are now differentiated from their export path: `createEncoder`, `createDecoder`, `DecodedMessage`.
- Remove usage for `Partial` with `Message` as `Message`'s field are all optional.

## [0.0.4] - 2022-11-18

### Added

- Alpha version of `@waku/message-encryption`.

[unreleased]: https://github.com/waku-org/js-waku/compare/@waku/message-encryption@0.0.9...HEAD
[0.0.9]: https://github.com/waku-org/js-waku/compare/@waku/message-encryption@0.0.8...@waku/message-encryption@0.0.9
[0.0.8]: https://github.com/waku-org/js-waku/compare/@waku/message-encryption@0.0.7...@waku/message-encryption@0.0.8
[0.0.7]: https://github.com/waku-org/js-waku/compare/@waku/message-encryption@0.0.6...@waku/message-encryption@0.0.7
[0.0.6]: https://github.com/waku-org/js-waku/compare/@waku/message-encryption@0.0.5...@waku/message-encryption@0.0.6
[0.0.5]: https://github.com/waku-org/js-waku/compare/@waku/message-encryption@0.0.4...@waku/message-encryption@0.0.5
[0.0.4]: https://github.com/waku-org/js-waku/compare/@waku/message-encryption@0.0.3...@waku/message-encryption@0.0.4
[0.0.3]: https://github.com/waku-org/js-waku/compare/@waku/message-encryption@0.0.2...%40waku/message-encryption@0.0.3
[0.0.2]: https://github.com/waku-org/js-waku/compare/@waku/message-encryption@0.0.1...%40waku/message-encryption@0.0.2
[0.0.1]: https://github.com/status-im/js-waku/compare/a20b7809d61ff9a9732aba82b99bbe99f229b935...%40waku/message-encryption%400.0.2
