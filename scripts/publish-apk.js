// Builds the Android preview APK via EAS and republishes it to a fixed
// GitHub Release ("latest-apk") so the download URL never changes between
// builds — useful for a QR code / install link that should always point at
// the newest code without needing to be regenerated.
//
// The stable URL is:
//   https://github.com/<owner>/<repo>/releases/download/latest-apk/lunchhub.apk
//
// Requires the repo to be public (private repos require auth to download
// release assets, which defeats the point of a public install link), `eas`
// logged in, and `gh` (GitHub CLI) authenticated with `repo` scope.
//
// Usage:
//   node scripts/publish-apk.js [existing-build-id]

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TAG = 'latest-apk';
const ASSET_NAME = 'lunchhub.apk';

// On Windows, npm-installed CLIs (eas) are .cmd shims, which execFileSync
// can only run through a shell — gh ships a real .exe and doesn't need one.
// All args here come from our own parsed EAS/git output, not external
// input, so shell interpolation isn't an injection concern in this script.
function sh(cmd, args, opts = {}) {
  console.log(`$ ${cmd} ${args.join(' ')}`);
  return execFileSync(cmd, args, {
    stdio: ['inherit', 'pipe', 'inherit'],
    encoding: 'utf8',
    shell: process.platform === 'win32' && cmd === 'eas',
    ...opts,
  });
}

function repoSlug() {
  const url = execFileSync('git', ['remote', 'get-url', 'origin'], { encoding: 'utf8' }).trim();
  const m = url.match(/[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!m) throw new Error(`Could not parse owner/repo from remote: ${url}`);
  return `${m[1]}/${m[2]}`;
}

async function main() {
  // Pass an existing build ID as argv[2] to skip queuing a new build and
  // just wait for/publish one already in progress (e.g. after a crash here).
  let buildId = process.argv[2];
  if (buildId) {
    console.log(`Resuming existing build: ${buildId}`);
  } else {
    console.log('Building Android preview APK via EAS (this takes ~10-15 min)...');
    const out = sh('eas', [
      'build',
      '--platform', 'android',
      '--profile', 'preview',
      '--non-interactive',
      '--no-wait',
      '--json',
    ]);
    const build = JSON.parse(out.trim());
    buildId = Array.isArray(build) ? build[0].id : build.id;
    console.log(`Build queued: ${buildId}. Waiting for it to finish...`);
  }

  sh('eas', ['build:view', buildId]);

  // Poll until the build leaves the in-progress states.
  let status = '';
  let artifactUrl = '';
  for (;;) {
    const infoRaw = sh('eas', ['build:view', buildId, '--json']);
    const info = JSON.parse(infoRaw.trim());
    status = info.status;
    if (status === 'FINISHED') {
      artifactUrl = info.artifacts?.buildUrl || info.artifacts?.applicationArchiveUrl;
      break;
    }
    if (status === 'ERRORED' || status === 'CANCELED') {
      throw new Error(`EAS build ${buildId} ended with status ${status}`);
    }
    console.log(`  status: ${status} — checking again in 30s...`);
    await new Promise((r) => setTimeout(r, 30_000));
  }

  if (!artifactUrl) throw new Error('Build finished but no artifact URL was returned.');
  console.log(`Build finished: ${artifactUrl}`);

  const tmpFile = path.join(os.tmpdir(), ASSET_NAME);
  console.log(`Downloading APK to ${tmpFile}...`);
  const res = await fetch(artifactUrl);
  if (!res.ok) throw new Error(`Failed to download APK: ${res.status}`);
  fs.writeFileSync(tmpFile, Buffer.from(await res.arrayBuffer()));

  const repo = repoSlug();
  console.log(`Publishing to GitHub Release "${TAG}" on ${repo}...`);
  try {
    sh('gh', ['release', 'view', TAG, '--repo', repo]);
  } catch {
    sh('gh', ['release', 'create', TAG, '--repo', repo, '--title', 'Latest Android build', '--notes', 'Always points at the most recently built APK. Auto-updated by scripts/publish-apk.js.']);
  }
  sh('gh', ['release', 'upload', TAG, `${tmpFile}#${ASSET_NAME}`, '--repo', repo, '--clobber']);

  fs.unlinkSync(tmpFile);
  console.log(`\nDone. Stable install link:\n  https://github.com/${repo}/releases/download/${TAG}/${ASSET_NAME}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
