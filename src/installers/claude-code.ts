import { writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import type { BundleManifest } from "../types.js";
import {
  cronToLaunchdInterval,
  ensureDirCreated,
  plistFor,
  readBundleManifest,
  readClaudeSettings,
  readTrigger,
  shellQuote,
  validateLoopId,
  writeBundleManifest,
  writeClaudeSettings,
  type InstallContext
} from "./shared.js";

/**
 * Install an approved loop bundle into the Claude Code surface.
 * Additive-only: every path written (including directories the installer
 * creates) is recorded in the bundle manifest so the install can be fully
 * reversed via uninstallLoop. The manifest is persisted before any process is
 * spawned, so a failing `ctx.exec` never leaves an untracked plist on disk.
 */
export async function installClaudeCodeLoop(
  bundleDir: string,
  ctx: InstallContext
): Promise<BundleManifest> {
  const manifest = readBundleManifest(bundleDir);
  const trigger = readTrigger(bundleDir);
  const loopId = manifest.loopId;
  validateLoopId(loopId);
  const loopPath = join(bundleDir, "loop.md");

  if (trigger.kind === "schedule") {
    if (typeof trigger.schedule !== "string") {
      throw new Error("schedule trigger missing 'schedule' field");
    }
    const label = `com.loopy.${loopId}`;
    const plistPath = join(ctx.launchAgentsDir, `${label}.plist`);
    const resolvedPlist = resolve(plistPath);
    const resolvedDir = resolve(ctx.launchAgentsDir) + sep;
    if (!resolvedPlist.startsWith(resolvedDir)) {
      throw new Error(`plist path escapes launchAgentsDir: ${plistPath}`);
    }
    const command = `claude -p "$(cat ${shellQuote(loopPath)})"`;
    const intervals = cronToLaunchdInterval(trigger.schedule);
    const plist = plistFor(label, ["/bin/sh", "-c", command], intervals);

    const createdDirs = ensureDirCreated(ctx.launchAgentsDir);
    writeFileSync(plistPath, plist, "utf8");

    // Record every touched path (plist first, then created dirs deepest-first)
    // and persist the manifest BEFORE spawning launchctl.
    manifest.installedPaths.push(plistPath, ...createdDirs);
    manifest.uninstallNotes.push(`launchctl unload ${plistPath}`);
    writeBundleManifest(bundleDir, manifest);

    await ctx.exec("launchctl", ["load", plistPath]);
    return manifest;
  }

  if (trigger.kind === "hook") {
    if (typeof trigger.hookEvent !== "string") {
      throw new Error("hook trigger missing 'hookEvent' field");
    }
    const settings = readClaudeSettings(ctx.claudeSettingsPath);

    const hooks =
      typeof settings.hooks === "object" && settings.hooks !== null
        ? (settings.hooks as Record<string, unknown>)
        : {};
    settings.hooks = hooks;

    const eventArray = Array.isArray(hooks[trigger.hookEvent])
      ? (hooks[trigger.hookEvent] as unknown[])
      : [];
    hooks[trigger.hookEvent] = eventArray;

    const innerScript = `claude -p "$(cat ${shellQuote(loopPath)})"`;
    const command = `sh -c ${shellQuote(innerScript)} # loopy:${loopId}`;
    eventArray.push({
      matcher: "*",
      hooks: [{ type: "command", command }]
    });

    writeClaudeSettings(ctx.claudeSettingsPath, settings);
    manifest.installedPaths.push(ctx.claudeSettingsPath);
    writeBundleManifest(bundleDir, manifest);
    return manifest;
  }

  manifest.uninstallNotes.push("manual loop — run via: claude -p loop.md");
  writeBundleManifest(bundleDir, manifest);
  return manifest;
}
