import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// These tests guard the Dokploy build-speed setup:
//   - the Docker build must use Turbopack (Next.js 16 default), not Webpack;
//   - Turbopack's filesystem build cache must be enabled;
//   - the Dockerfile must mount .next/cache so that cache survives deploys.
// A regression in any of these silently brings back 10-minute cold builds.

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFileSync(join(projectRoot, relativePath), "utf8");

test("package.json: build:docker uses Turbopack, not Webpack", () => {
  const pkg = JSON.parse(read("package.json"));

  assert.equal(
    pkg.scripts["build:docker"],
    "next build",
    'build:docker must run "next build" (Turbopack is the Next.js 16 default)',
  );
  assert.doesNotMatch(
    pkg.scripts["build:docker"],
    /--webpack/,
    "build:docker must not opt back into the slower Webpack bundler",
  );
});

test("package.json: build script does not force Webpack", () => {
  const pkg = JSON.parse(read("package.json"));

  assert.doesNotMatch(pkg.scripts.build, /--webpack/);
});

test("next.config.ts: Turbopack filesystem build cache is enabled", () => {
  const config = read("next.config.ts");

  assert.match(
    config,
    /turbopackFileSystemCacheForBuild:\s*true/,
    "experimental.turbopackFileSystemCacheForBuild must be true for warm sub-minute rebuilds",
  );
});

test("next.config.ts: standalone output is kept for the Docker runtime", () => {
  const config = read("next.config.ts");

  assert.match(config, /output:\s*["']standalone["']/);
});

test("Dockerfile: .next/cache is mounted as a BuildKit cache for the build step", () => {
  const dockerfile = read("Dockerfile");

  assert.match(
    dockerfile,
    /--mount=type=cache[^\n]*target=\/app\/\.next\/cache/,
    "the .next/cache mount is what persists Turbopack's FS cache across deploys",
  );
  assert.match(
    dockerfile,
    /pnpm run build:docker/,
    "the builder stage should run the build:docker script",
  );
});

// Slow end-to-end check: actually run a Turbopack build and verify it produces
// the standalone server and writes its filesystem cache. Opt-in because it
// compiles the whole app. Run with: RUN_BUILD_TEST=1 node --test scripts/build-config.test.mjs
test(
  "turbopack build produces standalone output and a filesystem cache",
  {
    skip:
      process.env.RUN_BUILD_TEST === "1"
        ? false
        : "set RUN_BUILD_TEST=1 to run the full build (slow)",
  },
  () => {
    rmSync(join(projectRoot, ".next"), { recursive: true, force: true });

    execFileSync("corepack", ["pnpm", "exec", "next", "build"], {
      cwd: projectRoot,
      stdio: "inherit",
    });

    assert.ok(
      existsSync(join(projectRoot, ".next/standalone/server.js")),
      "standalone server.js must exist for the Docker runner stage",
    );
    assert.ok(
      existsSync(join(projectRoot, ".next/cache/turbopack")),
      "Turbopack must write its filesystem cache under .next/cache",
    );
  },
);
