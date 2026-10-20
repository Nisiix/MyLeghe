// Notifiche push: iscrizione del dispositivo e preferenze per la propria squadra.

import type { NotifyPrefs } from "@footballlite/core";
import { api } from "./api";

const DEVICE_KEY = "footballlite.device";

export function deviceId(): string | null {
  try { return localStorage.getItem(DEVICE_KEY); } catch { return null; }
}

export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlB64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const raw = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Chiede il permesso, iscrive il dispositivo e lo registra sul backend. */
export async function enablePush(): Promise<string> {
  if (!pushSupported()) throw new Error("Questo browser non supporta le notifiche push. Su iPhone aggiungi FootballLite alla schermata Home e aprila da lì.");
  if ((await Notification.requestPermission()) !== "granted") throw new Error("Permesso per le notifiche negato.");
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api<{ publicKey: string }>("/push/vapid");
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(publicKey) }));
  const { deviceId: id } = await api<{ deviceId: string }>("/push/register", { method: "POST", body: { deviceId: deviceId(), subscription: sub.toJSON() } });
  try { localStorage.setItem(DEVICE_KEY, id); } catch { /* ignora */ }
  return id;
}

export async function getNotify(): Promise<{ teamId: number; prefs: NotifyPrefs } | null> {
  const id = deviceId();
  return id ? api(`/league/notify?deviceId=${encodeURIComponent(id)}`) : null;
}

export async function saveNotify(teamId: number, prefs: NotifyPrefs): Promise<void> {
  const id = deviceId() ?? (await enablePush());
  await api("/league/notify", { method: "PUT", body: { deviceId: id, teamId, prefs } });
}
