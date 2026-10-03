#!/usr/bin/env node
/**
 * Tag every release in CHANGELOG.md that has no git tag yet.
 *
 * A release's commit is the first commit on main (following first parents, so
 * a PR's merge commit rather than the commit inside the PR) where
 * package.json's version became that version. Existing tags are never moved.
 *
 *   npm run release:tag                 # dry run: show what would be tagged
 *   npm run release:tag -- --apply      # create the missing tags locally
 *   npm run release:tag -- --push       # create them and push them to origin
 *
 * Options: --remote <name> (default origin), --branch <name> (default main).
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const push = args.includes("--push");
const apply = push || args.includes("--apply");
const remote = option("remote", "origin");
const branch = option("branch", "main");
const ref = `${remote}/${branch}`;

const git = (...gitArgs) =>
  execFileSync("git", gitArgs, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

console.log(`Fetching ${ref}...`);
git("fetch", remote, branch);

// Tags on the remote and locally, as tag -> commit. Read with ls-remote rather
// than fetched, so a local tag that differs from the remote can't stop the run.
const tagCommits = (lines) =>
  new Map(
    lines
      .split("\n")
      .filter(Boolean)
      .map((line) => line.split(/\s+/))
      .filter(([, name]) => name.endsWith("^{}") || !lines.includes(`${name}^{}`))
      .map(([sha, name]) => [name.replace(/^refs\/tags\//, "").replace(/\^\{\}$/, ""), sha]),
  );
const remoteTags = tagCommits(git("ls-remote", "--tags", remote, "v*"));
let localRefs = "";
try {
  localRefs = git("show-ref", "--tags", "-d");
} catch {
  // show-ref exits non-zero when there are no tags.
}
const localTags = tagCommits(localRefs);

// Releases listed in the changelog, with each section's text for the tag message.
const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
const releases = [...changelog.matchAll(/^## \[(\d+\.\d+\.\d+)\](?: - (\S+))?\n([\s\S]*?)(?=^## \[|(?![\s\S]))/gm)].map(
  ([, version, date, notes]) => ({ version, date, notes: notes.trim() }),
);

// The first commit on the branch where package.json reached each version.
const releaseCommits = new Map();
let previous;
for (const sha of git("log", "--first-parent", "--reverse", "--format=%H", ref, "--", "package.json").split("\n")) {
  let version;
  try {
    version = JSON.parse(git("show", `${sha}:package.json`)).version;
  } catch {
    continue;
  }
  if (version !== previous && !releaseCommits.has(version)) releaseCommits.set(version, sha);
  previous = version;
}

const toTag = [];
const skipped = [];
for (const release of releases) {
  const tag = `v${release.version}`;
  if (remoteTags.has(tag)) {
    const local = localTags.get(tag);
    if (local && local !== remoteTags.get(tag)) {
      skipped.push(`${tag}: your local tag points at ${local.slice(0, 7)} but ${remote}'s points at ${remoteTags.get(tag).slice(0, 7)}; run \`git tag -d ${tag} && git fetch ${remote} tag ${tag}\` to use ${remote}'s`);
    }
    continue;
  }
  if (localTags.has(tag)) {
    skipped.push(`${tag}: tagged locally but not on ${remote}; push it with \`git push ${remote} ${tag}\` if it's right`);
    continue;
  }
  const sha = releaseCommits.get(release.version);
  if (!sha) {
    skipped.push(`${tag}: package.json was never set to ${release.version} on ${ref}`);
    continue;
  }
  toTag.push({ ...release, tag, sha });
}

if (toTag.length === 0) console.log("Every release that can be tagged already has a tag.");
for (const { tag, sha, notes } of toTag) {
  console.log(`${apply ? "Tagging" : "Would tag"} ${tag} -> ${git("log", "-1", "--format=%h %s", sha)}`);
  if (apply) git("tag", "-a", "--cleanup=whitespace", tag, sha, "-m", `${tag}\n\n${notes}`);
}
for (const line of skipped) console.log(`Skipped ${line}`);

if (push && toTag.length > 0) {
  console.log(`Pushing ${toTag.length} tag(s) to ${remote}...`);
  git("push", remote, ...toTag.map((r) => r.tag));
  console.log("Done.");
} else if (!apply && toTag.length > 0) {
  console.log("\nDry run. Re-run with --apply to create these tags, or --push to create and push them.");
} else if (apply && toTag.length > 0) {
  console.log(`\nCreated locally. Push with: git push ${remote} ${toTag.map((r) => r.tag).join(" ")}`);
}
