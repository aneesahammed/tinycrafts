const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const html = fs.readFileSync("index.html", "utf8");

function cspContent() {
  const match = html.match(
    /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/,
  );
  assert.ok(match, "Could not find CSP meta tag");
  return match[1];
}

test("markdown media allows exact trusted GitHub hosts only", () => {
  const csp = cspContent();

  assert.match(csp, /img-src[^;]*https:\/\/github\.com/);
  assert.match(csp, /img-src[^;]*https:\/\/raw\.githubusercontent\.com/);
  assert.match(csp, /media-src[^;]*https:\/\/github\.com/);
  assert.match(csp, /media-src[^;]*https:\/\/raw\.githubusercontent\.com/);
  assert.doesNotMatch(csp, /\*\.githubusercontent\.com/);

  assert.match(html, /const TRUSTED_EXTERNAL_MEDIA_HOSTS = Object\.freeze/);
  assert.match(html, /"github\.com"/);
  assert.match(html, /"raw\.githubusercontent\.com"/);
  assert.match(html, /TRUSTED_EXTERNAL_MEDIA_HOST_SET\.has/);
});

test("markdown media renders videos and blocks external svg URLs", () => {
  assert.match(html, /const IMAGE_MEDIA_EXTENSION_PATTERN/);
  assert.match(html, /const VIDEO_MEDIA_EXTENSION_PATTERN/);
  assert.match(html, /const EXTERNAL_SVG_EXTENSION_PATTERN/);
  assert.match(html, /<video src="/);
  assert.match(html, /controls preload="metadata" playsinline/);
  assert.match(html, /Remote media blocked for privacy/);
});
