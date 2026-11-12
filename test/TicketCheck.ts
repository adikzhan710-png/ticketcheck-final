import assert from "node:assert/strict";
import { describe, it } from "node:test";
import hre from "hardhat";
import { zeroAddress } from "viem";

const { viem, networkHelpers } = await hre.network.create();
const [organizer, alice, bob, gate, outsider, secondGate] = await viem.getWalletClients();
const publicClient = await viem.getPublicClient();
const options = (wallet: typeof alice) => ({ account: wallet.account });

async function fixture() {
  const contract = await viem.deployContract("TicketCheck");
  await contract.write.createEvent([1n]);
  await contract.write.setGateStaff([1n, gate.account.address, true]);
  await contract.write.issueTicket([1n, 101n, alice.account.address]);
  return contract;
}

async function expires() {
  return (await publicClient.getBlock()).timestamp + 300n;
}

describe("TicketCheck local prototype", () => {
  it("issues an active ticket to its owner and records the event", async () => {
    const c = await fixture();
    const [eventId, owner, status, exists] = await c.read.tickets([101n]);
    assert.equal(eventId, 1n);
    assert.equal(owner.toLowerCase(), alice.account.address);
    assert.equal(status, 0);
    assert.equal(exists, true);
  });

  it("rejects duplicate event and ticket identifiers", async () => {
    const c = await fixture();
    await assert.rejects(c.write.createEvent([1n]), /Event already exists/);
    await assert.rejects(c.write.issueTicket([1n, 101n, bob.account.address]), /Ticket already exists/);
  });

  it("prevents outsiders from issuing tickets or appointing gate staff", async () => {
    const c = await fixture();
    await assert.rejects(c.write.issueTicket([1n, 102n, bob.account.address], options(outsider)), /Caller is not event organizer/);
    await assert.rejects(c.write.setGateStaff([1n, outsider.account.address, true], options(outsider)), /Caller is not event organizer/);
  });

  it("rejects zero owners, zero gates and missing records", async () => {
    const c = await fixture();
    await assert.rejects(c.write.issueTicket([1n, 102n, zeroAddress]), /Owner address is zero/);
    await assert.rejects(c.write.setGateStaff([1n, zeroAddress, true]), /Gate address is zero/);
    await assert.rejects(c.write.issueTicket([999n, 102n, alice.account.address]), /Event does not exist/);
    await assert.rejects(c.write.transferTicket([999n, bob.account.address], options(alice)), /Ticket does not exist/);
  });

  it("lets only the current owner transfer and emits the ownership change", async () => {
    const c = await fixture();
    await assert.rejects(c.write.transferTicket([101n, bob.account.address], options(outsider)), /Caller is not ticket owner/);
    await viem.assertions.emitWithArgs(
      c.write.transferTicket([101n, bob.account.address], options(alice)), c, "TicketTransferred",
      [101n, alice.account.address, bob.account.address],
    );
    assert.equal((await c.read.tickets([101n]))[1].toLowerCase(), bob.account.address);
  });

  it("rejects transfer to zero and self", async () => {
    const c = await fixture();
    await assert.rejects(c.write.transferTicket([101n, zeroAddress], options(alice)), /New owner address is zero/);
    await assert.rejects(c.write.transferTicket([101n, alice.account.address], options(alice)), /Cannot transfer to current owner/);
  });

  it("clears old authorization on transfer, including transfer back", async () => {
    const c = await fixture();
    await c.write.authorizeEntry([101n, gate.account.address, await expires()], options(alice));
    await c.write.transferTicket([101n, bob.account.address], options(alice));
    assert.equal((await c.read.entryAuthorizations([101n]))[0], zeroAddress);
    await assert.rejects(c.write.authorizeEntry([101n, gate.account.address, await expires()], options(alice)), /Caller is not ticket owner/);
    await assert.rejects(c.write.redeemTicket([101n], options(gate)), /Owner did not authorize entry/);
    await c.write.transferTicket([101n, alice.account.address], options(bob));
    await assert.rejects(c.write.redeemTicket([101n], options(gate)), /Owner did not authorize entry/);
  });

  it("requires explicit owner authorization before admission", async () => {
    const c = await fixture();
    await assert.rejects(c.write.redeemTicket([101n], options(gate)), /Owner did not authorize entry/);
  });

  it("redeems once and rejects a second scan and subsequent transfer", async () => {
    const c = await fixture();
    await c.write.authorizeEntry([101n, gate.account.address, await expires()], options(alice));
    await c.write.redeemTicket([101n], options(gate));
    assert.equal((await c.read.tickets([101n]))[2], 1);
    assert.equal((await c.read.entryAuthorizations([101n]))[0], zeroAddress);
    await assert.rejects(c.write.redeemTicket([101n], options(gate)), /Ticket is not active/);
    await assert.rejects(c.write.transferTicket([101n, bob.account.address], options(alice)), /Ticket is not active/);
  });

  it("does not permit an unauthorized or different gate to admit", async () => {
    const c = await fixture();
    await c.write.setGateStaff([1n, secondGate.account.address, true]);
    await c.write.authorizeEntry([101n, gate.account.address, await expires()], options(alice));
    await assert.rejects(c.write.redeemTicket([101n], options(outsider)), /Caller is not authorized gate staff/);
    await assert.rejects(c.write.redeemTicket([101n], options(secondGate)), /Entry authorized for another gate/);
  });

  it("enforces authorization expiry", async () => {
    const c = await fixture();
    const deadline = await expires();
    await c.write.authorizeEntry([101n, gate.account.address, deadline], options(alice));
    await networkHelpers.time.increaseTo(deadline + 1n);
    await assert.rejects(c.write.redeemTicket([101n], options(gate)), /Entry authorization expired/);
    assert.equal((await c.read.tickets([101n]))[2], 0);
  });

  it("rejects already expired and excessively long authorizations", async () => {
    const c = await fixture();
    const now = (await publicClient.getBlock()).timestamp;
    await assert.rejects(c.write.authorizeEntry([101n, gate.account.address, now], options(alice)), /Authorization already expired/);
    await assert.rejects(c.write.authorizeEntry([101n, gate.account.address, now + 3600n], options(alice)), /Authorization exceeds 10 minutes/);
    await assert.rejects(c.write.authorizeEntry([101n, outsider.account.address, now + 300n], options(alice)), /Gate is not authorized for event/);
  });

  it("lets the owner cancel entry permission", async () => {
    const c = await fixture();
    await c.write.authorizeEntry([101n, gate.account.address, await expires()], options(alice));
    await assert.rejects(c.write.cancelEntryAuthorization([101n], options(bob)), /Caller is not ticket owner/);
    await c.write.cancelEntryAuthorization([101n], options(alice));
    await assert.rejects(c.write.redeemTicket([101n], options(gate)), /Owner did not authorize entry/);
  });

  it("immediately disables a removed gate", async () => {
    const c = await fixture();
    await c.write.authorizeEntry([101n, gate.account.address, await expires()], options(alice));
    await c.write.setGateStaff([1n, gate.account.address, false]);
    await assert.rejects(c.write.redeemTicket([101n], options(gate)), /Caller is not authorized gate staff/);
  });

  it("does not revive old permission when a removed gate is reappointed", async () => {
    const c = await fixture();
    await c.write.authorizeEntry([101n, gate.account.address, await expires()], options(alice));
    await c.write.setGateStaff([1n, gate.account.address, false]);
    await c.write.setGateStaff([1n, gate.account.address, true]);
    await assert.rejects(c.write.redeemTicket([101n], options(gate)), /Gate authorization changed/);
    await c.write.authorizeEntry([101n, gate.account.address, await expires()], options(alice));
    await c.write.redeemTicket([101n], options(gate));
    assert.equal((await c.read.tickets([101n]))[2], 1);
  });

  it("lets only the event organizer revoke and clears entry permission", async () => {
    const c = await fixture();
    await c.write.authorizeEntry([101n, gate.account.address, await expires()], options(alice));
    await assert.rejects(c.write.revokeTicket([101n], options(outsider)), /Caller is not event organizer/);
    await c.write.revokeTicket([101n]);
    assert.equal((await c.read.tickets([101n]))[2], 2);
    assert.equal((await c.read.entryAuthorizations([101n]))[0], zeroAddress);
    await assert.rejects(c.write.redeemTicket([101n], options(gate)), /Ticket is not active/);
    await assert.rejects(c.write.transferTicket([101n, bob.account.address], options(alice)), /Ticket is not active/);
    await assert.rejects(c.write.authorizeEntry([101n, gate.account.address, await expires()], options(alice)), /Ticket is not active/);
  });

  it("isolates organizers and gate permissions across events", async () => {
    const c = await fixture();
    await c.write.createEvent([2n], options(outsider));
    await c.write.issueTicket([2n, 202n, alice.account.address], options(outsider));
    await assert.rejects(c.write.issueTicket([2n, 203n, alice.account.address]), /Caller is not event organizer/);
    await assert.rejects(c.write.revokeTicket([202n]), /Caller is not event organizer/);
    await assert.rejects(c.write.authorizeEntry([202n, gate.account.address, await expires()], options(alice)), /Gate is not authorized for event/);
  });
});
