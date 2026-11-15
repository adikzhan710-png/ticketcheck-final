import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import hre from "hardhat";

const connection = await hre.network.create();
const { viem } = connection;
const [organizer, alice, bob, gate] = await viem.getWalletClients();
const client = await viem.getPublicClient();
type Log = { time: string; message: string; ok: boolean; hash?: string };
let logs: Log[] = [];
let busy = false;
const record = (message: string, ok = true, hash?: string) => {
  logs.unshift({ time: new Date().toISOString(), message, ok, hash });
  logs = logs.slice(0, 40);
};

async function deploy() {
  const c = await viem.deployContract("TicketCheck");
  await c.write.createEvent([1n]);
  await c.write.setGateStaff([1n, gate.account.address, true]);
  logs = [];
  record("Contract deployed. Event created and gate operator appointed.");
  return c;
}
let contract = await deploy();
const name = (address: string) => address.toLowerCase() === alice.account.address ? "Alice"
  : address.toLowerCase() === bob.account.address ? "Bob" : address;

async function state() {
  const [, owner, status, exists] = await contract.read.tickets([101n]);
  const [authorizedOwner, authorizedGate, validUntil] = await contract.read.entryAuthorizations([101n]);
  const timestamp = (await client.getBlock()).timestamp;
  return {
    contract: contract.address, eventId: 1, ticketId: 101,
    owner: exists ? name(owner) : "—",
    status: exists ? ["Active", "Used", "Revoked"][status] : "Not issued",
    authorization: validUntil >= timestamp && validUntil > 0n
      ? { owner: name(authorizedOwner), gate: authorizedGate, validUntil: Number(validUntil) } : null,
    logs,
    accounts: { organizer: organizer.account.address, alice: alice.account.address, bob: bob.account.address, gate: gate.account.address },
  };
}

async function action(actionName: string) {
  let hash: `0x${string}`;
  let message: string;
  switch (actionName) {
    case "reset": contract = await deploy(); return;
    case "issue":
      hash = await contract.write.issueTicket([1n, 101n, alice.account.address]);
      message = "The organizer issued ticket #101 to Alice."; break;
    case "transfer":
      hash = await contract.write.transferTicket([101n, bob.account.address], { account: alice.account });
      message = "Alice transferred the ticket to Bob. The previous entry permission was cleared."; break;
    case "authorizeAlice":
    case "authorizeBob": {
      const wallet = actionName === "authorizeAlice" ? alice : bob;
      const deadline = (await client.getBlock()).timestamp + 300n;
      hash = await contract.write.authorizeEntry([101n, gate.account.address, deadline], { account: wallet.account });
      message = `${actionName === "authorizeAlice" ? "Alice" : "Bob"} authorizes the gate operator to redeem the ticket within 5 minutes.`;
      break;
    }
    case "redeem":
      hash = await contract.write.redeemTicket([101n], { account: gate.account });
      message = "The gate operator redeemed the ticket. Repeated entry is rejected."; break;
    case "revoke":
      hash = await contract.write.revokeTicket([101n]);
      message = "The organizer revoked the ticket."; break;
    default: throw new Error("Unknown action");
  }
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Transaction rejected");
  record(message, true, hash);
}

function explain(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error);
  const reasons: Record<string, string> = {
    "Ticket does not exist": "The ticket has not been issued yet.",
    "Ticket already exists": "Ticket #101 already exists. Start a new scenario to issue it again.",
    "Caller is not ticket owner": "Rejected: this account is no longer the ticket owner.",
    "Ticket is not active": "Rejected: the ticket has already been used or revoked.",
    "Owner did not authorize entry": "Rejected: the current owner has not authorized entry.",
    "Entry authorization expired": "Rejected: permission has expired. The owner must authorize entry again.",
    "Cannot transfer to current owner": "The recipient already owns this ticket.",
  };
  for (const [reason, explanation] of Object.entries(reasons)) if (raw.includes(reason)) return explanation;
  return "Action rejected. Check the ticket status and try the scenario again.";
}

const port = 4317;
const origin = `http://127.0.0.1:${port}`;
const html = await readFile(new URL("../ui/index.html", import.meta.url));
const server = createServer(async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'");
  const json = (code: number, value: unknown) => {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(value));
  };
  if (req.headers.host !== `127.0.0.1:${port}` && req.headers.host !== `localhost:${port}`) {
    json(403, { error: "Invalid host" }); return;
  }
  try {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); res.end(html); return;
    }
    if (req.method === "GET" && req.url === "/api/state") { json(200, await state()); return; }
    if (req.method !== "POST" || req.url !== "/api/action") { json(404, { error: "Not found" }); return; }
    if (req.headers.origin && req.headers.origin !== origin && req.headers.origin !== `http://localhost:${port}`) {
      json(403, { error: "Cross-origin action rejected" }); return;
    }
    if (req.headers["content-type"] !== "application/json") { json(415, { error: "JSON required" }); return; }
    if (busy) { json(409, { error: "Wait for the previous action to finish." }); return; }
    busy = true;
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk.toString();
        if (body.length > 1024) { json(413, { error: "Request too large" }); return; }
      }
      let parsed: { action?: unknown };
      try { parsed = JSON.parse(body); } catch { json(400, { error: "Invalid JSON" }); return; }
      const allowed = ["issue", "transfer", "authorizeAlice", "authorizeBob", "redeem", "revoke", "reset"];
      if (!parsed || typeof parsed.action !== "string" || !allowed.includes(parsed.action)) {
        json(400, { error: "Unknown action" }); return;
      }
      try {
        await action(parsed.action);
        json(200, await state());
      } catch (error) {
        const message = explain(error);
        record(message, false);
        json(422, { error: message, state: await state() });
      }
    } finally { busy = false; }
  } catch {
    if (!res.headersSent) json(500, { error: "Local network unavailable. Restart the demo." });
    else res.end();
  }
});
server.listen(port, "127.0.0.1", () => console.log(`TicketCheck local demo: ${origin}`));
const close = () => server.close(() => { void connection.close().then(() => process.exit(0)); });
process.on("SIGINT", close);
process.on("SIGTERM", close);
