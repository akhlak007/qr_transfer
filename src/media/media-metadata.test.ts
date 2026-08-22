import assert from "node:assert/strict";
import test from "node:test";
import { classifyMedia } from "./media-metadata";

test("classifies supported media from MIME types", () => {
  assert.equal(classifyMedia("asset.bin", "image/webp"), "image");
  assert.equal(classifyMedia("asset.bin", "audio/mpeg"), "audio");
  assert.equal(classifyMedia("asset.bin", "video/mp4"), "video");
});

test("uses extension fallback without rejecting arbitrary files", () => {
  assert.equal(classifyMedia("photo.JPG", ""), "image");
  assert.equal(classifyMedia("track.m4a", ""), "audio");
  assert.equal(classifyMedia("clip.mov", ""), "video");
  assert.equal(classifyMedia("archive.zip", "application/zip"), "other");
});
