import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import renderer from "react-test-renderer";
import { fixture, ids, load } from "./helpers/solution-brief-fixture.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

for (const linked of [false, true, "premium"]) test(`${linked ? "Source-linked" : "Standalone"} presentation exposes per-slide PNG upload and replacement in both review modes`, async () => {
  let resource = { id: ids.request, title: "Controlled presentation", resource_type: "presentation", created_at: "2026-10-20", source_solution_brief_id: linked ? ids.foreign : null, content: { slides: [{ slide_title: "One", layout: linked ? "hero" : undefined, bullets: ["Visible"], speaker_notes: "Private" }, { slide_title: "Two", bullets: ["Untouched"] }] } };
  if (linked === "premium") { const c = load("lib/creativeDirection.ts"); resource.content.creative_direction = c.ROOT_PRESET; resource.content.slides[0].creative_direction = c.rootCreative("hero"); resource.content.slides[0].speaker_notes = "**Script:** Private instruction"; }
  const calls = [];
  const request = async (url, options = {}) => {
    calls.push({ url, options });
    if (url === "/api/social-accounts") return Response.json({ organisationId: ids.org });
    if (url === "/api/usage") return Response.json({ usage: 0, limit: 10 });
    if (url === "/api/resource-artwork") return Response.json({ success: true, imageUrl: `https://assets.invalid/${calls.length}.png` });
    if (options.method === "PATCH") {
      const body = JSON.parse(options.body);
      assert.equal(body.resourceId, ids.request); assert.equal(body.organisationId, ids.org);
      resource = { ...resource, content: { ...resource.content, slides: resource.content.slides.map((slide, i) => i === body.slideIndex ? { ...slide, ...body.slidePatch } : slide) } };
      return Response.json({ success: true, resource });
    }
    return Response.json({ resources: [resource] });
  };
  const Page = load("app/dashboard/resources/page.tsx", {
    "@/lib/tenantFetch": { tenantFetch: request }, "@/lib/organisationProfileClient": { fetchOrganisationProfile: async () => ({ organisationId: ids.org, profile: {} }) },
    "@/lib/brandGrowthProfile": { emptyProfile: {} }, "./ResourceOrigin": () => null, "./SolutionSlide": () => null,
  }, { fetch: request, FormData, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, window: { location: { search: `?resourceId=${ids.request}` } }, setInterval: () => 1, clearInterval() {} }).default;
  let tree;
  try {
    await renderer.act(async () => { tree = renderer.create(React.createElement(Page)); });
    const inputs = () => tree.root.findAll(n => n.type === "input" && n.props.type === "file");
    assert.equal(inputs().length, 2); assert.equal(inputs()[0].props.accept, "image/png");
    const button = label => tree.root.findAllByType("button").find(n => n.children.join("").trim() === label);
    await renderer.act(async () => button("Presenter View").props.onClick()); assert.equal(inputs().length, 2);
    if (linked === "premium") { assert.match(JSON.stringify(tree.toJSON()), /Private presenter guidance/); assert.doesNotMatch(JSON.stringify(tree.toJSON()), /\*\*Script/); }
    for (let i = 0; i < 2; i++) {
      const target = { files: [new File(["synthetic png"], "controlled.png", { type: "image/png" })], value: "controlled.png" };
      await renderer.act(async () => { inputs()[0].props.onChange({ currentTarget: target }); });
      assert.equal(target.value, "");
      const upload = calls.filter(c => c.url === "/api/resource-artwork").at(-1);
      assert.equal(upload.options.body.get("resourceId"), ids.request);
      assert.equal(upload.options.body.get("organisationId"), ids.org);
      assert.equal(upload.options.body.get("slideIndex"), "0");
      assert.equal(resource.content.slides[0].active_image_source, "upload");
      assert.deepEqual(resource.content.slides[1], { slide_title: "Two", bullets: ["Untouched"] });
    }
    assert.equal(calls.filter(c => c.url === "/api/resource-artwork").length, 2);
    await renderer.act(async () => button("Edit").props.onClick()); assert.equal(inputs().length, 0, "do not discard unsaved resource edits during an upload");
  } finally { if (tree) await renderer.act(async () => tree.unmount()); }
});

test("Existing upload route enforces tenant ownership, image types and 10MB before isolated storage writes", async () => {
  const f = await fixture();
  const uploads = [];
  f.db.storage = { from: bucket => ({ upload: async (path, bytes, options) => { uploads.push({ bucket, path, bytes: bytes.length, options }); return { error: null }; }, getPublicUrl: path => ({ data: { publicUrl: `https://assets.invalid/${path}` } }) }) };
  try {
    await f.sql.query("insert into resource_library(id,organisation_id,title,resource_type,content) values ($1,$2,'Controlled','presentation','{}'),($3,$4,'Foreign','presentation','{}')", [ids.request, ids.org, ids.foreign, ids.other]);
    const route = f.route("app/api/resource-artwork/route.ts").POST;
    const send = (resourceId, file, organisationId = ids.org) => {
      const body = new FormData();
      for (const [k, v] of Object.entries({ resourceId, organisationId, resourceTitle: "Controlled", slideTitle: "One", slideIndex: "0" })) body.set(k, v);
      body.set("file", file);
      const req = new Request(`http://localhost/api/resource-artwork?organisationId=${organisationId}`, { method: "POST", body }); req.nextUrl = new URL(req.url);
      return route(req);
    };
    const png = new File(["synthetic"], "controlled.png", { type: "image/png" });
    assert.equal((await send(ids.foreign, png)).status, 404);
    assert.equal((await send(ids.request, png, ids.other)).status, 403);
    assert.equal((await send(ids.request, new File(["bad"], "bad.txt", { type: "text/plain" }))).status, 400);
    assert.equal((await send(ids.request, new File([new Uint8Array(10 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }))).status, 400);
    assert.equal(uploads.length, 0);
    const result = await send(ids.request, png); assert.equal(result.status, 200);
    assert.equal(uploads[0].bucket, "resource-library-images"); assert.ok(uploads[0].path.startsWith(`${ids.org}/${ids.request}/uploaded-artwork/`)); assert.equal(uploads[0].options.upsert, false);
  } finally { await f.close(); }
});
