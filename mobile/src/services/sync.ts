import { Network } from "@capacitor/network";
import { apiFetch } from "./api";
import { getToken, qAll, qRun } from "./db";
import { pullProducts } from "./productsSync";

let timer: ReturnType<typeof setInterval> | null = null;

export function startSyncLoop(): void {
  if (timer) return;
  timer = setInterval(() => {
    void runSyncOnce();
  }, 10000);
  void runSyncOnce();
}

export function stopSyncLoop(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export async function runSyncOnce(): Promise<void> {
  const status = await Network.getStatus();
  if (!status.connected) return;

  const token = await getToken();

  try {
    await pullProducts(token);
  } catch (e) {
    console.warn("pull products", e);
  }

  if (!token) return;

  const pending = await qAll<{ id: number; entity_type: string; entity_id: string; payload_json: string }>(
    `SELECT id, entity_type, entity_id, payload_json FROM sync_queue WHERE status = 'pending' ORDER BY id ASC LIMIT 20`
  );

  for (const row of pending) {
    try {
      const payload = JSON.parse(row.payload_json);
      if (row.entity_type === "sale") {
        await apiFetch("/sales", { method: "POST", body: JSON.stringify(payload), token });
      } else if (row.entity_type === "expense") {
        await apiFetch("/expenses", { method: "POST", body: JSON.stringify(payload), token });
      }
      await qRun(`UPDATE sync_queue SET status = 'synced' WHERE id = ?`, [row.id]);
      if (row.entity_type === "sale") {
        await qRun(`UPDATE sales SET sync_status = 'synced' WHERE local_id = ?`, [row.entity_id]);
      } else {
        await qRun(`UPDATE expenses SET sync_status = 'synced' WHERE local_id = ?`, [row.entity_id]);
      }
    } catch (e) {
      console.warn("sync item", row.id, e);
      await qRun(`UPDATE sync_queue SET status = 'error' WHERE id = ?`, [row.id]);
    }
  }
}
