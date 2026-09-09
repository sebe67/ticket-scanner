import assert from "node:assert/strict";
import test from "node:test";
import { lookupAirport } from "../src/airportLookup.js";

test("resolves a known Philippine airport", () => {
  const result = lookupAirport("MNL");
  assert.ok(result);
  assert.equal(result!.country, "Philippines");
});

test("resolves a known international airport", () => {
  const result = lookupAirport("NRT");
  assert.ok(result);
  assert.equal(result!.country, "Japan");
});

test("is case-insensitive", () => {
  assert.equal(lookupAirport("mnl")?.country, "Philippines");
});

test("returns null for an unrecognized code rather than guessing", () => {
  assert.equal(lookupAirport("ZZZ"), null);
});

test("returns null for a malformed code", () => {
  assert.equal(lookupAirport("M1L"), null);
  assert.equal(lookupAirport("MANILA"), null);
});
