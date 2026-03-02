import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  Partials,
  AttachmentBuilder,
  ChannelType,
} from "discord.js";

import fs from "node:fs";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";

// ========= ENV / CONFIG =========
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;

const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID;
const GOODBYE_CHANNEL_ID = process.env.GOODBYE_CHANNEL_ID;

const WELCOME_BG = process.env.WELCOME_BG || "";
const GOODBYE_BG = process.env.GOODBYE_BG || "";

const SERVER_NAME_ENV = (process.env.SERVER_NAME || "").trim();

const BANNER_WIDTH = Number(process.env.BANNER_WIDTH || 1000);
const BANNER_HEIGHT = Number(process.env.BANNER_HEIGHT || 360);

if (!DISCORD_TOKEN) throw new Error("Missing DISCORD_TOKEN");
if (!GUILD_ID) throw new Error("Missing GUILD_ID");
if (!WELCOME_CHANNEL_ID) throw new Error("Missing WELCOME_CHANNEL_ID");
if (!GOODBYE_CHANNEL_ID) throw new Error("Missing GOODBYE_CHANNEL_ID");

// ========= HELPERS =========
function fmtDateID(d) {
  return new Date(d).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });
}

function shortTag(user) {
  // Discord username system bisa beda-beda, aman pakai globalName kalau ada
  const name = user.globalName || user.username;
  return `${name}`;
}

async function loadBgMaybe(bg) {
  if (!bg) return null;

  // URL
  if (/^https?:\/\//i.test(bg)) {
    return loadImage(bg);
  }

  // Local file path
  const p = path.resolve(bg);
  if (fs.existsSync(p)) {
    const buf = fs.readFileSync(p);
    return loadImage(buf);
  }

  return null;
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth, startFontSize, minFontSize = 18) {
  let size = startFontSize;
  while (size >= minFontSize) {
    ctx.font = `700 ${size}px Arial`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 2;
  }
  return minFontSize;
}

async function buildBanner({
  type, // "welcome" | "goodbye"
  guildName,
  member,
  bgImage,
}) {
  const canvas = createCanvas(BANNER_WIDTH, BANNER_HEIGHT);
  const ctx = canvas.getContext("2d");

  // Background
  if (bgImage) {
    // cover
    const iw = bgImage.width;
    const ih = bgImage.height;
    const cw = BANNER_WIDTH;
    const ch = BANNER_HEIGHT;

    const scale = Math.max(cw / iw, ch / ih);
    const nw = iw * scale;
    const nh = ih * scale;
    const nx = (cw - nw) / 2;
    const ny = (ch - nh) / 2;

    ctx.drawImage(bgImage, nx, ny, nw, nh);
  } else {
    // fallback gradient
    const g = ctx.createLinearGradient(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
    g.addColorStop(0, "#0b1020");
    g.addColorStop(1, "#141a2e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);
  }

  // Dark overlay
  ctx.fillStyle = "rgba(0,0,0,0.40)";
  ctx.fillRect(0, 0, BANNER_WIDTH, BANNER_HEIGHT);

  // Card panel
  const pad = 28;
  const cardX = pad;
  const cardY = pad;
  const cardW = BANNER_WIDTH - pad * 2;
  const cardH = BANNER_HEIGHT - pad * 2;

  ctx.save();
  drawRoundedRect(ctx, cardX, cardY, cardW, cardH, 24);
  ctx.clip();
  ctx.fillStyle = "rgba(20, 20, 28, 0.62)";
  ctx.fillRect(cardX, cardY, cardW, cardH);
  ctx.restore();

  // Accent bar
  ctx.save();
  drawRoundedRect(ctx, cardX, cardY, cardW, 10, 8);
  ctx.clip();
  ctx.fillStyle = type === "welcome" ? "#35f08c" : "#ff5c7a";
  ctx.fillRect(cardX, cardY, cardW, 10);
  ctx.restore();

  // Avatar circle
  const avatarSize = 190;
  const avatarX = cardX + 42;
  const avatarY = cardY + (cardH - avatarSize) / 2;

  // load avatar
  const avatarUrl = member.user.displayAvatarURL({ extension: "png", size: 256 });
  const avatarImg = await loadImage(avatarUrl);

  // avatar shadow
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 8, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fill();
  ctx.restore();

  // avatar border
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 4, 0, Math.PI * 2);
  ctx.strokeStyle = type === "welcome" ? "rgba(53, 240, 140, 0.9)" : "rgba(255, 92, 122, 0.9)";
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.restore();

  // draw avatar clipped
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(avatarImg, avatarX, avatarY, avatarSize, avatarSize);
  ctx.restore();

  // Text area
  const textX = avatarX + avatarSize + 42;
  const textY = cardY + 58;
  const textW = cardX + cardW - textX - 42;

  const headline = type === "welcome" ? "WELCOME!" : "GOODBYE!";
  const nameLine = shortTag(member.user);

  // Headline
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.font = "800 44px Arial";
  ctx.fillText(headline, textX, textY);

  // Name (auto fit)
  const nameSize = fitText(ctx, nameLine, textW, 46, 22);
  ctx.font = `800 ${nameSize}px Arial`;
  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.fillText(nameLine, textX, textY + 62);

  // Details
  const createdAt = member.user.createdAt;
  const joinedAt = member.joinedAt;
  const memberCount = member.guild.memberCount;

  const details = [
    `User: @${member.user.username}`,
    `ID: ${member.user.id}`,
    `Akun dibuat: ${fmtDateID(createdAt)}`,
    joinedAt ? `Join server: ${fmtDateID(joinedAt)}` : null,
    `Member ke: ${memberCount}`,
  ].filter(Boolean);

  ctx.font = "600 22px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.85)";

  let dy = textY + 110;
  for (const line of details) {
    // wrap sederhana kalau kepanjangan
    const words = line.split(" ");
    let current = "";
    for (const w of words) {
      const test = current ? `${current} ${w}` : w;
      if (ctx.measureText(test).width > textW) {
        ctx.fillText(current, textX, dy);
        dy += 30;
        current = w;
      } else {
        current = test;
      }
    }
    if (current) {
      ctx.fillText(current, textX, dy);
      dy += 30;
    }
  }

  // Footer server name
  const serverName = SERVER_NAME_ENV || guildName;
  ctx.font = "700 20px Arial";
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText(serverName, cardX + 38, cardY + cardH - 22);

  return canvas.toBuffer("image/png");
}

async function sendBanner({ channelId, type, member }) {
  try {
    const channel = await member.guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) return;

    const bg = await loadBgMaybe(type === "welcome" ? WELCOME_BG : GOODBYE_BG);

    const buffer = await buildBanner({
      type,
      guildName: member.guild.name,
      member,
      bgImage: bg,
    });

    const file = new AttachmentBuilder(buffer, { name: `${type}-${member.user.id}.png` });

    const content =
      type === "welcome"
        ? `👋 Selamat datang <@${member.user.id}>!`
        : `😢 Sampai jumpa **${shortTag(member.user)}**`;

    await channel.send({ content, files: [file] });
  } catch (e) {
    console.error("sendBanner error:", e);
  }
}

// ========= CLIENT =========
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember],
});

client.once("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on("guildMemberAdd", async (member) => {
  if (member.guild.id !== GUILD_ID) return;
  await sendBanner({ channelId: WELCOME_CHANNEL_ID, type: "welcome", member });
});

client.on("guildMemberRemove", async (member) => {
  if (member.guild.id !== GUILD_ID) return;
  await sendBanner({ channelId: GOODBYE_CHANNEL_ID, type: "goodbye", member });
});

client.login(DISCORD_TOKEN);