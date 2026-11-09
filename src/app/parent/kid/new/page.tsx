import Link from "next/link";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { ensureHousehold } from "@/lib/ensure-household";
import { ensureSchema } from "@/lib/ensure-schema";
import { createChild } from "../../actions";
import { removeKid, addGameAccount, removeGameAccount, approveGameRequest, rejectGameRequest } from "../actions";
import { toggleSelfPurchase, toggleFullCatalog } from "../../purchase-actions";
import { setKidPin } from "../pin-actions";
import { joinClassByCode } from "@/app/teacher/actions";
import { RemoveKidForm } from "./remove-kid-form";
import { PinForm } from "./pin-form";

export default async function FamilyAdminPage({
  searchParams
}: {
  searchParams: Promise<{ permission?: string; name?: string; account?: string; game?: string; catalog?: string; pin?: string; join?: string; class?: string }>;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  const params = await searchParams;
  const permission = params.permission;
  const changedName = params.name ? decodeURIComponent(params.name) : "";
  const accountNotice = params.account;
  const accountGame = params.game ? decodeURIComponent(params.game) : "";
  const catalog = params.catalog;
  const join = params.join;
  const joinedClass = params.class ? decodeURIComponent(params.class) : "";

  const user = await currentUser();
  const email =
    user?.primaryEmailAddress?.emailAddress ?? `${userId}@users.invalid`;
  const household = await ensureHousehold({ clerkUserId: userId, email });
  const db = sql();
  await ensureSchema();

  const kids = (await db`
    SELECT id, display_name,
           COALESCE(can_self_purchase, false) AS can_self_purchase,
           COALESCE(can_browse_adult, false) AS can_browse_adult,
           (pin_hash IS NOT NULL) AS has_pin
    FROM children
    WHERE household_id = ${household.household_id}::uuid
    ORDER BY created_at
  `) as { id: string; display_name: string; can_self_purchase: boolean; can_browse_adult: boolean; has_pin: boolean }[];

  const accounts = (await db`
    SELECT a.id::text AS id, a.child_id::text AS child_id, a.provider, a.identifier
    FROM kid_game_accounts a
    JOIN children c ON c.id = a.child_id
    WHERE c.household_id = ${household.household_id}::uuid
    ORDER BY a.provider
  `) as { id: string; child_id: string; provider: string; identifier: string }[];

  const requests = (await db`
    SELECT r.id::text AS id, r.child_id::text AS child_id, r.provider, r.identifier
    FROM kid_game_requests r
    JOIN children c ON c.id = r.child_id
    WHERE c.household_id = ${household.household_id}::uuid
      AND r.status = 'pending'
    ORDER BY r.created_at
  `) as { id: string; child_id: string; provider: string; identifier: string }[];

  const banner =
    params.pin === "set"
      ? `Set a PIN for ${changedName || "kid"}. They can sign in on their own device.`
      : permission === "allowed"
        ? `${changedName || "Kid"} can now buy books.`
        : permission === "removed"
          ? `${changedName || "Kid"} can no longer buy books.`
          : catalog === "on"
            ? `${changedName || "Kid"} can now search the full catalog.`
            : catalog === "off"
              ? `${changedName || "Kid"} can no longer search the full catalog.`
              : accountNotice === "saved"
                ? `Saved ${accountGame || "account"} for ${changedName || "kid"}.`
                : accountNotice === "approved"
                  ? `Approved ${accountGame || "account"} for ${changedName || "kid"}.`
                  : accountNotice === "rejected"
                    ? "Rejected a game account request."
                    : join === "ok"
                      ? `Enrolled ${changedName || "kid"} in ${joinedClass || "the class"}.`
                      : join === "bad"
                        ? "That class code was not found."
                        : join === "missing"
                          ? "Enter a class code and pick a kid."
                          : null;

  return (
    <main>
      <header className="top">
        <Link href="/parent">Back to parent</Link>
      </header>
      <h1>Family Administration</h1>
      <p>Add kids, set a PIN so they can sign in on their own device, control who can buy books, and store game account IDs for rewards.</p>
      {banner && (
        <div className="card" style={{ borderColor: join === "bad" || join === "missing" ? "#c62828" : "#2e7d32" }}>
          <p className={join === "bad" || join === "missing" ? "overdue" : "unlocked"}>{banner}</p>
        </div>
      )}

      <div className="card">
        <h2>Add a kid</h2>
        <form action={createChild} className="stack">
          <label>
            Name
            <input name="display_name" type="text" required maxLength={40} />
          </label>
          <button type="submit" className="btn">
            Add kid
          </button>
        </form>
      </div>

      <div className="card">
        <h2>Join a class</h2>
        <p className="muted">Enter the code the teacher gave you to enroll one of your kids.</p>
        {kids.length === 0 ? (
          <p>Add a kid first.</p>
        ) : (
          <form action={joinClassByCode} className="stack">
            <label>
              Class code
              <input name="code" required maxLength={12} placeholder="ABC123" style={{ textTransform: "uppercase" }} />
            </label>
            <label>
              Kid
              <select name="child_id" required>
                {kids.map((kid) => (
                  <option key={kid.id} value={kid.id}>
                    {kid.display_name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn">
              Enroll
            </button>
          </form>
        )}
      </div>

      <div className="card">
        <h2>Kids</h2>
        {kids.length === 0 ? (
          <p>No kids yet.</p>
        ) : (
          kids.map((kid) => (
            <div key={kid.id} className="kid-block">
              <p className="kid-name">{kid.display_name}</p>

              <p className="section-head">Sign-in PIN</p>
              <p className="muted">
                {kid.has_pin
                  ? "PIN is set. They sign in at the home page with their name and this PIN."
                  : "No PIN yet. Set a 4-digit PIN so they can sign in on their own device."}
              </p>
              <PinForm childId={kid.id} hasPin={!!kid.has_pin} action={setKidPin} />

              <form action={toggleSelfPurchase} className="stack">
                <input type="hidden" name="child_id" value={kid.id} />
                <label>
                  <input
                    type="checkbox"
                    name="can_self_purchase"
                    defaultChecked={!!kid.can_self_purchase}
                  />
                  Can buy books
                </label>
                <button type="submit" className="btn secondary">
                  Save buy permission
                </button>
              </form>
              <form action={toggleFullCatalog} className="stack">
                <input type="hidden" name="child_id" value={kid.id} />
                <label>
                  <input
                    type="checkbox"
                    name="can_browse_adult"
                    defaultChecked={!!kid.can_browse_adult}
                  />
                  Can search the full catalog
                </label>
                <button type="submit" className="btn secondary">
                  Save catalog permission
                </button>
              </form>

              <p className="section-head">Game accounts</p>
              <p className="muted">Usernames and player IDs used to send rewards.</p>
              {requests.filter((r) => r.child_id === kid.id).length > 0 && (
                <>
                  <p className="group-head">Waiting for approval</p>
                  <ul className="reward-list">
                    {requests
                      .filter((r) => r.child_id === kid.id)
                      .map((request) => (
                        <li key={request.id}>
                          <strong>{request.provider === "roblox" ? "Roblox" : request.provider === "clash_royale" ? "Clash Royale" : request.provider}</strong>
                          {" · "}
                          {request.identifier}
                          {" · "}
                          <form action={approveGameRequest} style={{ display: "inline" }}>
                            <input type="hidden" name="request_id" value={request.id} />
                            <button type="submit" className="btn" style={{ padding: "0.2rem 0.5rem", fontSize: "0.8rem" }}>
                              Approve
                            </button>
                          </form>
                          {" "}
                          <form action={rejectGameRequest} style={{ display: "inline" }}>
                            <input type="hidden" name="request_id" value={request.id} />
                            <button type="submit" className="btn secondary" style={{ padding: "0.2rem 0.5rem", fontSize: "0.8rem" }}>
                              Reject
                            </button>
                          </form>
                        </li>
                      ))}
                  </ul>
                </>
              )}
              {accounts.filter((a) => a.child_id === kid.id).length === 0 ? (
                <p className="muted">None yet.</p>
              ) : (
                <ul className="reward-list">
                  {accounts
                    .filter((a) => a.child_id === kid.id)
                    .map((account) => (
                      <li key={account.id}>
                        <strong>{account.provider === "roblox" ? "Roblox" : account.provider === "clash_royale" ? "Clash Royale" : account.provider}</strong>
                        {" · "}
                        {account.identifier}
                        {" · "}
                        <form action={removeGameAccount} style={{ display: "inline" }}>
                          <input type="hidden" name="account_id" value={account.id} />
                          <button type="submit" className="btn secondary" style={{ padding: "0.2rem 0.5rem", fontSize: "0.8rem" }}>
                            Remove
                          </button>
                        </form>
                      </li>
                    ))}
                </ul>
              )}
              <form action={addGameAccount} className="stack">
                <input type="hidden" name="child_id" value={kid.id} />
                <label>
                  Game
                  <select name="provider" required defaultValue="roblox">
                    <option value="roblox">Roblox</option>
                    <option value="clash_royale">Clash Royale</option>
                  </select>
                </label>
                <label>
                  Username or player ID
                  <input name="identifier" required maxLength={80} placeholder="Roblox username or Clash Royale tag" />
                </label>
                <button type="submit" className="btn">
                  Save account
                </button>
              </form>

              <RemoveKidForm
                childId={kid.id}
                displayName={kid.display_name}
                action={removeKid}
              />
            </div>
          ))
        )}
      </div>
    </main>
  );
}
