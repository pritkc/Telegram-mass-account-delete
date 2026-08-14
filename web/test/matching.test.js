const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

// Lightweight CommonJS harness: dynamically import ESM matching module.
async function load() {
  return import("../src/matching.js");
}

describe("matching", async () => {
  const { classifyDialog, displayTitle, isJoinedServiceMessage } = await load();

  const user = (overrides = {}) => ({
    className: "User",
    id: 42,
    firstName: "Jane",
    lastName: null,
    username: "jane",
    deleted: false,
    ...overrides,
  });

  const dialog = (entity) => ({ isUser: true, entity });
  const signup = { id: 99, action: { className: "MessageActionContactSignUp" } };
  const normal = { id: 100, action: null };

  it("detects contact signup service messages", () => {
    assert.equal(isJoinedServiceMessage(signup), true);
    assert.equal(isJoinedServiceMessage(normal), false);
  });

  it("accepts exactly one signup message", () => {
    const target = classifyDialog(dialog(user()), [signup]);
    assert.ok(target);
    assert.equal(target.title, "Jane");
    assert.equal(target.userId, "42");
    assert.equal(target.messageId, 99);
  });

  it("fails closed on normal messages", () => {
    assert.equal(classifyDialog(dialog(user()), [normal]), null);
  });

  it("fails closed when a second message exists", () => {
    assert.equal(classifyDialog(dialog(user()), [signup, normal]), null);
  });

  it("labels deleted accounts", () => {
    assert.equal(displayTitle(user({ deleted: true, firstName: null, username: null })), "*deleted account");
    const target = classifyDialog(dialog(user({ deleted: true, firstName: null, username: null })), [signup]);
    assert.ok(target);
    assert.equal(target.deleted, true);
    assert.equal(target.title, "*deleted account");
  });

  it("rejects non-user dialogs", () => {
    assert.equal(classifyDialog({ isUser: false, entity: user() }, [signup]), null);
    assert.equal(classifyDialog({ isUser: true, entity: { className: "Channel" } }, [signup]), null);
  });
});
