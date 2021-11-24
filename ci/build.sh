#!/bin/bash

# Copyright © 2021 The Radicle Upstream Contributors
#
# This file is part of radicle-upstream, distributed under the GPLv3
# with Radicle Linking Exception. For full terms see the included
# LICENSE file.

source ci/env.sh

log-group-start "install toolcahin"
time rustup component add clippy rustfmt
if ! command -v cargo-deny >/dev/null; then
  declare -r cargo_deny_version="0.10.1"
  if [[ "${RUNNER_OS:-}" == "macOS" ]]; then
    declare -r target="x86_64-apple-darwin"
  else
    declare -r target="x86_64-unknown-linux-musl"
  fi
  echo "installing cargo-deny v${cargo_deny_version} for ${target}"
  curl -sSL \
    "https://github.com/EmbarkStudios/cargo-deny/releases/download/${cargo_deny_version}/cargo-deny-${cargo_deny_version}-${target}.tar.gz" |
    tar -xz -C /usr/local/bin --strip-components=1
fi
log-group-end

log-group-start "yarn install"
yarn install --immutable
yarn dedupe --check
log-group-end

log-group-start "Test setup"
./scripts/test-setup.sh
cp ci/gitconfig "$HOME/.gitconfig"
log-group-end

log-group-start "License compliance"
time ./scripts/license-header.ts check
time cargo deny check
log-group-end

log-group-start "cargo fmt"
time cargo fmt --all -- --check
log-group-end

log-group-start "cargo clippy"
cargo clippy --all --all-targets --all-features -- --deny warnings
log-group-end

log-group-start "cargo doc"
(
  export RUSTDOCFLAGS="-D broken-intra-doc-links"
  cargo doc --workspace --no-deps --all-features --document-private-items
)
log-group-end

log-group-start "cargo build"
cargo build --all --all-features --all-targets
log-group-end

log-group-start "cargo test"
(
  export RUST_TEST_TIME_UNIT=2000,4000
  export RUST_TEST_TIME_INTEGRATION=2000,8000
  cargo test --all --all-features --all-targets -- -Z unstable-options --report-time
)
log-group-end

# log-group-start "eslint"
# time yarn lint
# log-group-end

# log-group-start "prettier"
# time yarn prettier:check
# log-group-end

# log-group-start "Check TypeScript"
# time yarn typescript:check
# log-group-end

# log-group-start "Bundle electron main files"
# time yarn run webpack --config-name main
# log-group-end

# log-group-start "Starting proxy daemon and runing app tests"
# # We modify the output of the tests to add log groups to the cypress
# # tests.
# time FORCE_COLOR=1 ELECTRON_ENABLE_LOGGING=1 yarn test |
#   sed "
#     s/^\\s*Running:/$(log-group-end)\n$(log-group-start)Running:/
#     s/^.*Run Finished.*/$(log-group-end)\n$(log-group-start)Run Finished/
#   "
# log-group-end

clean-cargo-build-artifacts
