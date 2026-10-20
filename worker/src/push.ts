import { buildPushPayload, type PushSubscription } from "@block65/webcrypto-web-push";
import type { Env } from "./env";

export interface Device {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface Notice {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

/** Invia una notifica; se il push service risponde 404/410 l'iscrizione è scaduta e il dispositivo viene rimosso. */
export async function sendPush(env: Env, device: Device, notice: Notice): Promise<boolean> {
  const subscription: PushSubscription = {
    endpoint: device.endpoint,
    expirationTime: null,
    keys: { p256dh: device.p256dh, auth: device.auth },
  };
  const payload = await buildPushPayload(
    { data: JSON.stringify(notice), options: { ttl: 6 * 3600, urgency: "high", topic: notice.tag?.slice(0, 32) } },
    subscription,
    { subject: env.VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY },
  );
  const res = await fetch(device.endpoint, payload);
  if (res.status === 404 || res.status === 410) {
    await env.DB.prepare("DELETE FROM devices WHERE id = ?").bind(device.id).run();
    return false;
  }
  return res.ok;
}
