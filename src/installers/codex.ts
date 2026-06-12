import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { BundleManifest } from "../types.js";
import {
  cronToLaunchdInterval,
  ensureDirCreated,
  plistFor,
  readBundleManifest,
  readTrigger,
  shellQuote,
  writeBundleManifest,
  type InstallContext
} from "./shared.js";

/**
 * Install an approved loop bundle into the Codex surface.
 * Additive-only: every path written (including directories the installer
 * creates) is recorded in the bundle manifest so the install can be fully
 * reversed via uninstallLoop. The manifest is persisted before any process is
 * spawned. Codex has no hook surface.
 */
export async function installCodexLoop(
  bundleDir: string,
  ctx: InstallContext
): Promise<BundleManifest> {
  const manifest = readBundleManifest(bundleDir);
  const trigger = readTrigger(bundleDir);
  const loopId = manifest.loopId;
  const loopPath = join(bundleDir, "loop.md");

  if (trigger.kind === "schedule") {
    if (typeof trigger.schedule !== "string") {
      throw new Error("schedule trigger missing 'schedule' field");
    }
    const label = `com.loopy.${loopId}`;
    const plistPath = join(ctx.launchAgentsDir, `${label}.plist`);
    const command = `codex exec --sandbox workspace-write --skip-git-repo-check "$(cat ${shellQuote(loopPath)})"`;
    const intervals = cronToLaunchdInterval(trigger.schedule);
    const plist = plistFor(label, ["/bin/sh", "-c", command], intervals);

    const createdDirs = ensureDirCreated(ctx.launchAgentsDir);
    writeFileSync(plistPath, plist, "utf8");

    manifest.installedPaths.push(plistPath, ...createdDirs);
    manifest.uninstallNotes.push(`launchctl unload ${plistPath}`);
    writeBundleManifest(bundleDir, manifest);

    await ctx.exec("launchctl", ["load", plistPath]);
    return manifest;
  }

  if (trigger.kind === "hook") {
    throw new Error("codex does not support hook triggers");
  }

  manifest.uninstallNotes.push("manual loop — run via: codex exec loop.md");
  writeBundleManifest(bundleDir, manifest);
  return manifest;
}
