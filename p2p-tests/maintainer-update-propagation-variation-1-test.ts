#!/usr/bin/env -S node --require ts-node/register/transpile-only --require tsconfig-paths/register

// Copyright © 2021 The Radicle Upstream Contributors
//
// This file is part of radicle-upstream, distributed under the GPLv3
// with Radicle Linking Exception. For full terms see the included
// LICENSE file.

import execa from "execa";

import { sleep } from "ui/src/sleep";
import * as source from "proxy-client/source";
import { strict as strictAssert } from "assert";

import {
  commit,
  gracefullyStopProcess,
  keyPath,
  killProcesses,
  p2pTestPath,
  pushRad,
  startPeer,
  startSeed,
  withRetry,
  workspacePath,
} from "./lib/p2p";

const processes: execa.ExecaChildProcess[] = [];

async function runTestcase() {
  let maintainer = startPeer(
    "maintainer",
    "10.0.0.101",
    [
      "--key-passphrase",
      "maintainer",
      "--seed",
      "hybfoqx9wrdjhnr9jyb74zpduph57z99f67bjgfnsf83p1rk7z1diy@10.0.0.1:8776",
    ],
    true
  );
  processes.push(maintainer.childProcess);

  await withRetry(async () => {
    await maintainer.proxyClient.project.create({
      repo: {
        type: "new",
        path: workspacePath(["maintainer", "project-checkouts"]),
        name: "my-fancy-project",
      },
      description: "",
      defaultBranch: "main",
    });
  });

  await gracefullyStopProcess(maintainer.childProcess);

  const seed = startSeed(
    "seed",
    [
      "--identity-key",
      keyPath(
        "seed-hybfoqx9wrdjhnr9jyb74zpduph57z99f67bjgfnsf83p1rk7z1diy.key"
      ),
      "--project",
      "rad:git:hnrkrhhs1goaawo7db1gpyct8hd7mif5q8c3o",
    ],
    true
  );

  processes.push(seed);

  maintainer = startPeer(
    "maintainer",
    "10.0.0.101",
    [
      "--key-passphrase",
      "maintainer",
      "--seed",
      "hybfoqx9wrdjhnr9jyb74zpduph57z99f67bjgfnsf83p1rk7z1diy@10.0.0.1:8776",
    ],
    false
  );

  // Wait for seed to replicate project.
  await sleep(1000);

  await gracefullyStopProcess(maintainer.childProcess);

  let contributor = startPeer(
    "contributor",
    "10.0.0.102",
    [
      "--key-passphrase",
      "contributor",
      "--seed",
      "hybfoqx9wrdjhnr9jyb74zpduph57z99f67bjgfnsf83p1rk7z1diy@10.0.0.1:8776",
    ],
    true
  );
  processes.push(contributor.childProcess);

  await withRetry(async () => {
    await contributor.proxyClient.project.requestSubmit(
      "rad:git:hnrkrhhs1goaawo7db1gpyct8hd7mif5q8c3o"
    );
  });

  await withRetry(async () => {
    const project = await contributor.proxyClient.project.get(
      "rad:git:hnrkrhhs1goaawo7db1gpyct8hd7mif5q8c3o"
    );

    strictAssert.deepStrictEqual(project, {
      urn: "rad:git:hnrkrhhs1goaawo7db1gpyct8hd7mif5q8c3o",
      metadata: {
        name: "my-fancy-project",
        description: "",
        defaultBranch: "main",
        maintainers: ["rad:git:hnrkeiq6qo4d96m13nxud3qgfzbahmwsfmdwy"],
      },
      stats: { commits: 1, branches: 0, contributors: 1 },
    });
  });

  await gracefullyStopProcess(contributor.childProcess);

  maintainer = startPeer(
    "maintainer",
    "10.0.0.101",
    [
      "--key-passphrase",
      "maintainer",
      "--seed",
      "hybfoqx9wrdjhnr9jyb74zpduph57z99f67bjgfnsf83p1rk7z1diy@10.0.0.1:8776",
    ],
    false
  );
  processes.push(maintainer.childProcess);

  commit(
    "maintainer",
    workspacePath(["maintainer", "project-checkouts", "my-fancy-project"])
  );

  pushRad(
    workspacePath(["maintainer"]),
    workspacePath(["maintainer", "project-checkouts", "my-fancy-project"]),
    "maintainer"
  );

  // Wait for maintainer to replicate commit to seed.
  await sleep(1000);

  await gracefullyStopProcess(maintainer.childProcess);

  contributor = startPeer(
    "contributor",
    "10.0.0.102",
    [
      "--key-passphrase",
      "contributor",
      "--seed",
      "hybfoqx9wrdjhnr9jyb74zpduph57z99f67bjgfnsf83p1rk7z1diy@10.0.0.1:8776",
    ],
    false
  );
  processes.push(contributor.childProcess);

  await withRetry(async () => {
    const commitList = await contributor.proxyClient.source.commitsGet({
      projectUrn: "rad:git:hnrkrhhs1goaawo7db1gpyct8hd7mif5q8c3o",
      peerId: "hybhe78oy41yzux5d6rk8fdtek881de76wuwy7mga1imzoj7p17pnw",
      revision: { type: source.RevisionType.Branch, name: "main" },
    });

    strictAssert.deepStrictEqual(commitList?.stats, {
      commits: 2,
      branches: 0,
      contributors: 2,
    });
  });
}

async function main() {
  const start = execa.commandSync(p2pTestPath("star-topology.sh start"));
  console.log(start.stdout);

  const maybeError: Error | void = await runTestcase().catch(err => err);
  if (maybeError) {
    console.log("\nTEST FAILED ❌\n");
    console.log(maybeError);
  } else {
    console.log("\nTEST PASSED ✅\n");
  }

  await killProcesses(processes);
  const stop = execa.commandSync(p2pTestPath("star-topology.sh stop"));
  console.log(stop.stdout);

  if (maybeError) {
    process.exit(1);
  }
}

main();
