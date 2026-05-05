#!/usr/bin/env node
import { execFileSync } from "node:child_process";

function parseArgs(argv) {
  const options = {
    production: "",
    main: "origin/main",
    upstream: "upstream/main",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--production" && next) {
      options.production = next;
      i += 1;
    } else if (arg === "--main" && next) {
      options.main = next;
      i += 1;
    } else if (arg === "--upstream" && next) {
      options.upstream = next;
      i += 1;
    } else if (arg === "--help" || arg === "-h") {
      console.log([
        "Usage: node scripts/check-production-sync.mjs [--production <ref>] [--main <ref>] [--upstream <ref>]",
        "",
        "Checks that production contains main, main contains upstream when available,",
        "and production-only commits have not been merged back into main.",
      ].join("\n"));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.production) {
    options.production = git(["branch", "--show-current"]).trim();
  }
  return options;
}

function git(args, options = {}) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: options.quiet ? ["ignore", "pipe", "ignore"] : ["ignore", "pipe", "pipe"],
  });
}

function refExists(ref) {
  try {
    git(["rev-parse", "--verify", `${ref}^{commit}`], { quiet: true });
    return true;
  } catch {
    return false;
  }
}

function isAncestor(ancestor, descendant) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function countCommits(range) {
  return Number(git(["rev-list", "--count", range]).trim());
}

function shortSha(ref) {
  return git(["rev-parse", "--short", ref]).trim();
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const failures = [];
  const warnings = [];

  for (const [name, ref] of [
    ["production", options.production],
    ["main", options.main],
  ]) {
    if (!refExists(ref)) {
      failures.push(`${name} ref does not exist: ${ref}`);
    }
  }

  if (failures.length === 0) {
    if (options.production === options.main) {
      failures.push("production and main refs must be different");
    }

    if (!isAncestor(options.main, options.production)) {
      failures.push(`${options.production} does not contain ${options.main}; merge main into production before release`);
    }

    const productionOnlyCount = countCommits(`${options.main}..${options.production}`);
    const mainOnlyCount = countCommits(`${options.production}..${options.main}`);
    if (productionOnlyCount === 0) {
      failures.push(`${options.production} has no production-only commits beyond ${options.main}`);
    }
    if (mainOnlyCount > 0) {
      failures.push(`${options.production} is missing ${mainOnlyCount} commit(s) from ${options.main}`);
    }

    if (isAncestor(options.production, options.main)) {
      failures.push(`${options.main} contains all production commits; do not merge production back into main`);
    }
  }

  if (options.upstream) {
    if (refExists(options.upstream) && refExists(options.main)) {
      if (!isAncestor(options.upstream, options.main)) {
        failures.push(`${options.main} does not contain ${options.upstream}; sync fork main from upstream first`);
      }
    } else {
      warnings.push(`Skipping upstream containment check because ${options.upstream} is not available locally`);
    }
  }

  const dirty = git(["status", "--porcelain"]).trim();
  if (dirty) {
    warnings.push("Working tree is dirty; commit or stash before final production push");
  }

  console.log("Production sync check");
  console.log(`  production: ${options.production}${refExists(options.production) ? ` (${shortSha(options.production)})` : ""}`);
  console.log(`  main:       ${options.main}${refExists(options.main) ? ` (${shortSha(options.main)})` : ""}`);
  if (options.upstream) {
    console.log(`  upstream:   ${options.upstream}${refExists(options.upstream) ? ` (${shortSha(options.upstream)})` : " (not fetched)"}`);
  }

  if (warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warning of warnings) {
      console.log(`  - ${warning}`);
    }
  }

  if (failures.length > 0) {
    console.error("\nFailures:");
    for (const failure of failures) {
      console.error(`  - ${failure}`);
    }
    process.exit(1);
  }

  console.log("\nOK: production contains main, main does not contain production, and upstream containment is satisfied when available.");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
