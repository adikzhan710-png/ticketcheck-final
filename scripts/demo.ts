import assert from "node:assert/strict";
import hre from "hardhat";

const connection = await hre.network.create();
try {
  const { viem } = connection;
  const [organizer, alice, bob, gate] = await viem.getWalletClients();
  const client = await viem.getPublicClient();
  console.log("TicketCheck | local educational demonstration | no real funds");
  const c = await viem.deployContract("TicketCheck");
  console.log("1. Contract deployed:", c.address);
  await c.write.createEvent([1n], { account: organizer.account });
  await c.write.setGateStaff([1n, gate.account.address, true]);
  await c.write.issueTicket([1n, 101n, alice.account.address]);
  console.log("2. Organizer issued ticket 101 to Alice.");
  await c.write.transferTicket([101n, bob.account.address], { account: alice.account });
  console.log("3. Alice transferred the ticket to Bob.");
  const validUntil = (await client.getBlock()).timestamp + 300n;
  await assert.rejects(c.write.authorizeEntry([101n, gate.account.address, validUntil], { account: alice.account }), /Caller is not ticket owner/);
  console.log("4. Alice's old-owner entry attempt was rejected.");
  await c.write.authorizeEntry([101n, gate.account.address, validUntil], { account: bob.account });
  await c.write.redeemTicket([101n], { account: gate.account });
  assert.equal((await c.read.tickets([101n]))[2], 1);
  console.log("5. Bob authorized entry; gate staff marked the ticket USED.");
  await assert.rejects(c.write.redeemTicket([101n], { account: gate.account }), /Ticket is not active/);
  console.log("6. Second entry rejected. Demonstration passed.");
} finally {
  await connection.close();
}
