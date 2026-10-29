import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRelationKey, relationKey, schemaWithoutComments } from "./fga";

test("schema comments are stripped: the Descope DSL rejects them", () => {
  const dsl = [
    "model AuthZ 1.0",
    "// who can see a document",
    "type document",
    "  relation owner: user",
    "    // indented comment",
    "  permission can_view: owner",
  ].join("\n");
  assert.equal(
    schemaWithoutComments(dsl),
    [
      "model AuthZ 1.0",
      "type document",
      "  relation owner: user",
      "  permission can_view: owner",
    ].join("\n"),
  );
});

test("relation keys round-trip, including ids with separators", () => {
  const r = {
    resourceType: "doc",
    resource: "reports:q3",
    relation: "owner",
    targetType: "user",
    target: "U2abc:def",
  };
  assert.equal(relationKey(r), "doc:reports:q3#owner@user:U2abc:def");
  assert.deepEqual(parseRelationKey(relationKey(r)), r);
  assert.throws(() => parseRelationKey("nonsense"));
});
