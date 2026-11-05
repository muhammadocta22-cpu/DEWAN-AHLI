// Gerbang Syndicate: Telegram -> Netlify -> GitHub Actions.
// Menolak semua yang bukan dari Telegram asli & bukan dari Bos.
exports.handler = async (event) => {
  const OK = { statusCode: 200, body: "ok" };
  try {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "no" };

    const secret = event.headers["x-telegram-bot-api-secret-token"];
    if (!process.env.TG_SECRET || secret !== process.env.TG_SECRET) {
      return { statusCode: 401, body: "no" };
    }

    const update = JSON.parse(event.body || "{}");
    const msg = update.message || (update.callback_query && update.callback_query.message);
    const chatId = msg && msg.chat && msg.chat.id;
    if (!chatId) return OK;

    const token = process.env.TELEGRAM_TOKEN;
    const tg = (method, payload) =>
      fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => null);

    // Mode setup: OWNER_CHAT_ID belum diisi -> bot memberi tahu chat ID Bos
    const owner = String(process.env.OWNER_CHAT_ID || "").trim();
    if (!owner) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `Mode setup. Isi OWNER_CHAT_ID dengan angka ini: ${chatId}`,
      });
      return OK;
    }
    if (String(chatId) !== owner) return OK; // orang asing diabaikan total

    // Umpan balik instan agar Bos tidak menunggu dalam gelap
    if (update.callback_query) {
      await tg("answerCallbackQuery", {
        callback_query_id: update.callback_query.id,
        text: "Titah diterima. Dewan memproses...",
      });
    } else if (update.message && (update.message.text || update.message.photo)) {
      await tg("sendChatAction", { chat_id: chatId, action: "typing" });
    } else {
      return OK;
    }

    const res = await fetch(
      `https://api.github.com/repos/${process.env.GH_REPO}/dispatches`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GH_TOKEN}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          "User-Agent": "syndicate-gateway",
        },
        body: JSON.stringify({ event_type: "telegram_update", client_payload: { update } }),
      }
    );

    if (!res.ok) {
      await tg("sendMessage", {
        chat_id: chatId,
        text: `⚠️ Gerbang gagal membangunkan Dewan (kode ${res.status}). Periksa GH_TOKEN dan GH_REPO.`,
      });
    }
    return OK;
  } catch (e) {
    return OK; // selalu 200 supaya Telegram tidak mengulang kiriman
  }
};
