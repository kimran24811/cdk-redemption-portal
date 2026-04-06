import { Router } from "express";
import {
  ActivateKeyBody,
  GetOrderParams,
  GetOrdersQueryParams,
  PurchaseKeysBody,
  ValidateKeyBody,
} from "@workspace/api-zod";

const router = Router();

const KEYS_OVH_BASE = "https://keys.ovh/api/v1";

function getApiKey(): string {
  const key = process.env.KEYS_OVH_API_KEY;
  if (!key) throw new Error("KEYS_OVH_API_KEY is not set");
  return key;
}

async function keysOvhFetch(path: string, options: RequestInit = {}) {
  const apiKey = getApiKey();
  const res = await fetch(`${KEYS_OVH_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function findKeyInOrders(key: string): Promise<{ product?: string; subscription?: string } | null> {
  try {
    const ordersRes = await keysOvhFetch("/orders?per_page=100");
    const orders: Array<{ order_number: string }> = ordersRes.data?.data ?? [];
    if (!orders.length) return null;

    const recent = orders.slice(0, 30);
    const details = await Promise.all(
      recent.map((o) => keysOvhFetch(`/orders/${o.order_number}`).catch(() => null))
    );

    for (const detail of details) {
      if (!detail) continue;
      const d = detail.data?.data;
      if (!d) continue;
      const keys: string[] = d.keys ?? [];
      if (keys.includes(key)) {
        return {
          product: d.product,
          subscription: d.subscription,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

router.post("/keys/validate", async (req, res) => {
  const parsed = ValidateKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: "Invalid request body" });
    return;
  }

  const { key } = parsed.data;

  try {
    const { data } = await keysOvhFetch("/activate", {
      method: "POST",
      body: JSON.stringify({ key, user_token: "__validate_probe__", async: false }),
    });

    if (data.success === true && data.data) {
      const orderInfo = await findKeyInOrders(key);
      res.json({
        success: true,
        data: {
          status: "valid",
          product: data.data.product ?? orderInfo?.product,
          subscription: data.data.subscription ?? orderInfo?.subscription,
          email: data.data.email,
          activated_at: data.data.activated_at,
          message: data.message,
        },
      });
      return;
    }

    const errorCode: string = (data.error ?? "").toLowerCase();
    const errorMsg: string = (data.message ?? "").toLowerCase();
    const dataEmail: string | undefined = data.data?.email;
    const dataActivatedAt: string | undefined = data.data?.activated_at;
    const combined = errorCode + " " + errorMsg;

    if (
      combined.includes("already") ||
      combined.includes("used") ||
      combined.includes("consumed")
    ) {
      const orderInfo = !dataEmail ? await findKeyInOrders(key) : null;
      res.json({
        success: true,
        data: {
          status: "already_used",
          email: dataEmail,
          activated_at: dataActivatedAt,
          product: data.data?.product ?? orderInfo?.product,
          subscription: data.data?.subscription ?? orderInfo?.subscription,
          message: data.message ?? data.error,
        },
      });
      return;
    }

    if (
      combined.includes("key not found") ||
      combined.includes("not found") ||
      combined.includes("not available") ||
      errorCode === "key_not_found"
    ) {
      const orderInfo = await findKeyInOrders(key);
      res.json({
        success: true,
        data: {
          status: "already_used",
          email: dataEmail,
          activated_at: dataActivatedAt,
          product: data.data?.product ?? orderInfo?.product,
          subscription: data.data?.subscription ?? orderInfo?.subscription,
          message: data.message ?? "This key has already been used or does not exist",
        },
      });
      return;
    }

    if (
      combined.includes("token") ||
      combined.includes("user") ||
      combined.includes("session") ||
      combined.includes("auth") ||
      errorCode === "token_invalid"
    ) {
      const orderInfo = await findKeyInOrders(key);
      res.json({
        success: true,
        data: {
          status: "valid",
          product: orderInfo?.product,
          subscription: orderInfo?.subscription,
          message: "Key is valid and ready to activate",
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        status: "invalid",
        message: data.message ?? data.error ?? "Key is invalid or could not be verified",
      },
    });
  } catch (err) {
    req.log.error({ err }, "Failed to validate key");
    res.status(500).json({ success: false, error: "Failed to validate key" });
  }
});

router.get("/keys/products", async (req, res) => {
  try {
    const { status, data } = await keysOvhFetch("/products");
    res.status(status).json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch products");
    res.status(500).json({ success: false, error: "Failed to fetch products" });
  }
});

router.get("/keys/balance", async (req, res) => {
  try {
    const { status, data } = await keysOvhFetch("/balance");
    res.status(status).json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch balance");
    res.status(500).json({ success: false, error: "Failed to fetch balance" });
  }
});

router.post("/keys/activate", async (req, res) => {
  const parsed = ActivateKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: "Invalid request body", message: parsed.error.message });
    return;
  }

  try {
    const { status, data } = await keysOvhFetch("/activate", {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
    res.status(status).json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to activate key");
    res.status(500).json({ success: false, error: "Failed to activate key" });
  }
});

router.get("/keys/orders", async (req, res) => {
  const parsed = GetOrdersQueryParams.safeParse(req.query);
  const params = parsed.success ? parsed.data : { page: 1, per_page: 20 };

  try {
    const qs = new URLSearchParams({
      page: String(params.page ?? 1),
      per_page: String(params.per_page ?? 20),
    });
    const { status, data } = await keysOvhFetch(`/orders?${qs}`);
    res.status(status).json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch orders");
    res.status(500).json({ success: false, error: "Failed to fetch orders" });
  }
});

router.get("/keys/orders/:orderNumber", async (req, res) => {
  const parsed = GetOrderParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: "Invalid order number" });
    return;
  }

  try {
    const { status, data } = await keysOvhFetch(`/orders/${parsed.data.orderNumber}`);
    res.status(status).json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to fetch order");
    res.status(500).json({ success: false, error: "Failed to fetch order" });
  }
});

router.post("/keys/purchase", async (req, res) => {
  const parsed = PurchaseKeysBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: "Invalid request body", message: parsed.error.message });
    return;
  }

  try {
    const { status, data } = await keysOvhFetch("/purchase", {
      method: "POST",
      body: JSON.stringify(parsed.data),
    });
    res.status(status).json(data);
  } catch (err) {
    req.log.error({ err }, "Failed to purchase keys");
    res.status(500).json({ success: false, error: "Failed to purchase keys" });
  }
});

export default router;
