# Changelog

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @waku/core bumped from 0.0.12 to 0.0.13
    - @waku/enr bumped from 0.0.7 to 0.0.8
    - @waku/proto bumped from 0.0.3 to 0.0.4
    - @waku/utils bumped from \* to 0.0.3
  - devDependencies
    - @waku/interfaces bumped from 0.0.9 to 0.0.10

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @waku/enr bumped from 0.0.8 to 0.0.9

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @waku/core bumped from 0.0.14 to 0.0.15

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @waku/core bumped from 0.0.15 to 0.0.16
    - @waku/enr bumped from 0.0.9 to 0.0.10
    - @waku/utils bumped from 0.0.3 to 0.0.4
  - devDependencies
    - @waku/interfaces bumped from 0.0.10 to 0.0.11

## [0.0.5](https://github.com/waku-org/js-waku/compare/peer-exchange-v0.0.4...peer-exchange-v0.0.5) (2023-03-23)

### Features

- Compliance test for peer-exchange discovery ([#1186](https://github.com/waku-org/js-waku/issues/1186)) ([5b0c3c3](https://github.com/waku-org/js-waku/commit/5b0c3c3cac3ddb5687d8f59457d6056527a8666c))

### Bug Fixes

- @waku/peer-exchange uses @waku/core and should depend on it ([e922ed4](https://github.com/waku-org/js-waku/commit/e922ed49ec70553227751518251152c765efd07c))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @waku/core bumped from \* to 0.0.12
    - @waku/enr bumped from 0.0.6 to 0.0.7
  - devDependencies
    - @waku/interfaces bumped from 0.0.8 to 0.0.9

## [0.0.4](https://github.com/waku-org/js-waku/compare/peer-exchange-v0.0.3...peer-exchange-v0.0.4) (2023-03-16)

### ⚠ BREAKING CHANGES

- directly convert from ENR to `PeerInfo`, remove unneeded utility
- extract decoder code
- bump typescript
- bump all prod dependencies
- bump libp2p dependencies

### Features

- Codec as a property of the protocol implementations ([a5ff788](https://github.com/waku-org/js-waku/commit/a5ff788eed419556e11319f22ca9e3109c81df92))
- DNS discovery as default bootstrap discovery ([#1114](https://github.com/waku-org/js-waku/issues/1114)) ([11819fc](https://github.com/waku-org/js-waku/commit/11819fc7b14e18385d421facaf2af0832cad1da8))

### Bug Fixes

- **dns-discovery/peer-exchange:** Check if peer is already tagged ([952aadd](https://github.com/waku-org/js-waku/commit/952aadd7bbbe1a7265c5126c1678f552bef0648d))
- Prettier and cspell ignore CHANGELOG ([#1235](https://github.com/waku-org/js-waku/issues/1235)) ([4d7b3e3](https://github.com/waku-org/js-waku/commit/4d7b3e39e6761afaf5d05a13cc4b3c23e15f9bd5))
- Remove initialising peer-exchange while creating a node ([#1158](https://github.com/waku-org/js-waku/issues/1158)) ([1b41569](https://github.com/waku-org/js-waku/commit/1b4156902387ea35b24b3d6f5d22e4635ea8cf18))

### Miscellaneous Chores

- Bump all prod dependencies ([88cc76d](https://github.com/waku-org/js-waku/commit/88cc76d2b811e1fa4460207f38704ecfe18fb260))
- Bump libp2p dependencies ([803ae7b](https://github.com/waku-org/js-waku/commit/803ae7bd8ed3de665026446c23cde90e7eba9d36))
- Bump typescript ([12d86e6](https://github.com/waku-org/js-waku/commit/12d86e6abcc68e27c39ca86b4f0dc2b68cdd6000))
- Directly convert from ENR to `PeerInfo`, remove unneeded utility ([6dbcde0](https://github.com/waku-org/js-waku/commit/6dbcde041ab8fa8c2df75cc25319a0eccf6b0454))
- Extract decoder code ([130c49b](https://github.com/waku-org/js-waku/commit/130c49b636807063364f309da0da2a24a68f2178))

### Dependencies

- The following workspace dependencies were updated
  - dependencies
    - @waku/enr bumped from \* to 0.0.6
    - @waku/proto bumped from \* to 0.0.3
  - devDependencies
    - @waku/interfaces bumped from \* to 0.0.8

## Changelog

All notable changes to this project will be documented in this file.

The file is maintained by [Release Please](https://github.com/googleapis/release-please) based on [Conventional Commits](https://www.conventionalcommits.org) specification,
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
