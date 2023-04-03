# Contributing

Contributors are welcomed!

We try to keep a number of [`good first issue`](https://github.com/status-im/js-waku/labels/good%20first%20issue) for new contributors.
If you feel confident, you can also check out the [`help wanted`](https://github.com/status-im/js-waku/labels/help%20wanted) issues.

To have an idea of the work in the pipeline, feel free to view the [js-waku project board](https://github.com/status-im/js-waku/projects/1).
This project board is to prioritize the work of core contributors so do not be deterred by issues in the `Icebox` or bottom of the `Backlog`.

Do note that we have a [CI](./.github/workflows/ci.yml) powered by GitHub Action.
To help ensure your PR passes, just run before committing:

- `npm run fix`: To format your code,
- `npm run check`: To check your code for linting errors,
- `npm run test`: To run all tests

## Build & Test

To build and test this repository, you need:

- [Node.js & npm](https://nodejs.org/en/).
- Chrome (for browser testing).

To ensure interoperability with [nim-waku](https://github.com/status-im/nim-waku/), some tests are run against a nim-waku node.
This is why the relevant docker images for the node is pulled as part of the `pretest` script that runs before `npm run test`.

If you do not want to run `npm run test`, you can still pull the relevant nim-waku docker image by running `npm run pretest`.

Note that we run tests in both NodeJS and browser environments (using [karma](https://karma-runner.github.io/)).
Files named `*.node.spec.ts` are only run in NodeJS environment;
Files named `*.spec.ts` are run in both NodeJS and browser environment.

## Guidelines

- Please follow [Chris Beam's commit message guide](https://chris.beams.io/posts/git-commit/) for commit patches,
- Please test new code, we use [mocha](https://mochajs.org/),
  [chai](https://www.chaijs.com/),
  [fast-check](https://github.com/dubzzz/fast-check)
  and [karma](https://karma-runner.github.io/).

### Committing Patches

In general, [commits should be atomic](https://en.wikipedia.org/wiki/Atomic_commit#Atomic_commit_convention)
and diffs should be easy to read.
For this reason, do not mix any formatting fixes or code moves with actual code changes.

Commit messages should be verbose by default consisting of a short subject line (50 chars max),
a blank line and detailed explanatory text as separate paragraph(s),
unless the title alone is self-explanatory in which case a single title line is sufficient.

Commit messages should be helpful to people reading your code in the future, so explain the reasoning for
your decisions.

If a particular commit references another issue, please add the reference.
For example: `refs #1234` or `fixes #4321`.
Using the `fixes` or `closes` keywords will cause the corresponding issue to be closed when the pull request is merged.

Commit messages should never contain any `@` mentions (usernames prefixed with "@").

Please refer to the [Git manual](https://git-scm.com/doc) for more information
about Git.
