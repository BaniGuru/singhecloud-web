import { WebSocketServer } from "ws";
import fetch from "node-fetch";
import winston from "winston";
import "winston-daily-rotate-file";

import dotenv from 'dotenv';

dotenv.config();

const appUrl = process.env.APP_URL;

// ------------------------
// Winston logger with daily rotation
// ------------------------
const transport = new winston.transports.DailyRotateFile({
    filename: 'logs/server-%DATE%.log',
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: '20m',
    maxFiles: '14d'
});

const logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.printf(
            ({ timestamp, level, message }) => `${timestamp} [${level.toUpperCase()}]: ${message}`
        )
    ),
    transports: [
        new winston.transports.Console(),
        transport
    ],
});

// ------------------------
// Failed attempts tracking
// ------------------------
const failedAttempts = new Map();
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 min
const ENTRY_TTL = 10 * 60 * 1000;       // 10 min TTL

function canAttempt(ip) {
    const now = Date.now();
    const entry = failedAttempts.get(ip) || { count: 0, lastAttempt: now };
    if (now - entry.lastAttempt > 60000) entry.count = 0;
    entry.count += 1;
    entry.lastAttempt = now;
    failedAttempts.set(ip, entry);
    return entry.count <= 5;
}

function recordFailure(ip) {
    const now = Date.now();
    const entry = failedAttempts.get(ip) || { count: 0, lastAttempt: now };

    if (now - entry.lastAttempt > 60000) entry.count = 0;

    entry.count += 1;
    entry.lastAttempt = now;
    failedAttempts.set(ip, entry);

    return entry.count <= 5;
}

function resetAttempts(ip) {
    failedAttempts.delete(ip);
}

// Periodic cleanup
setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of failedAttempts.entries()) {
        if (now - entry.lastAttempt > ENTRY_TTL) {
            failedAttempts.delete(ip);
            logger.info(`Removed old failedAttempts entry for IP ${ip}`);
        }
    }
}, CLEANUP_INTERVAL);

// ------------------------
// Validate Laravel token
// ------------------------
async function validateToken(token) {
    if (!token) return null;
    try {
        const res = await fetch(`${appUrl}/api/user`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status !== 200) return null;
        return await res.json();
    } catch (err) {
        logger.error(`Token validation error: ${err}`);
        return null;
    }
}

async function validateWsTicket(ticket) {
    if (!ticket) return null;

    try {
        const res = await fetch(`${appUrl}/api/ws-ticket/validate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                "X-Internal-Secret": process.env.WS_INTERNAL_SECRET,
            },
            body: JSON.stringify({ ticket }),
        });

        if (res.status !== 200) return null;

        return await res.json();
    } catch (err) {
        logger.error(`WS ticket validation error: ${err}`);
        return null;
    }
}

const userSettings = new Map();
const userPankti = new Map();
const userNavigatorState = new Map();

// ------------------------
// WebSocket server
// ------------------------
const wss = new WebSocketServer({
  port: 3001,
  host: "127.0.0.1"
});

const wssPublic = new WebSocketServer({
  port: 3002,
  host: "127.0.0.1"
});

// Heartbeat function
function heartbeat() {
    this.isAlive = true;
}

async function validateStream(streamName) {
    if (!streamName) return null;

    try {
        const res = await fetch(`${appUrl}/api/bani-stream/${encodeURIComponent(streamName)}`);
        if (res.status !== 200) return null;
        return await res.json();
    } catch (err) {
        logger.error(`Stream validation error: ${err}`);
        return null;
    }
}

function broadcastPankti(sender, payload) {
    const existing = userNavigatorState.get(sender.user.id) ?? getDefaultNavigatorState();

    const current = payload.c ?? 0;
    const incomingShabadId = payload.s;

    const shabadChanged = existing.shabadId && existing.shabadId !== incomingShabadId;

    const incomingVisited = Array.isArray(payload.visited)
        ? payload.visited
        : [];

    const nextVisited = incomingVisited;

    const nextState = {
        ...existing,
        page: "shabad",
        shabadId: incomingShabadId,
        current,
        home: payload.h ?? 0,
        baniId: payload.b ?? null,
        visited: nextVisited,
    };

    userNavigatorState.set(sender.user.id, nextState);

    userPankti.set(sender.user.id, {
        ...payload,
        visited: nextVisited,
    });

    const message = JSON.stringify({
        type: "pankti",
        s: incomingShabadId,
        c: current,
        h: payload.h ?? 0,
        b: payload.b ?? null,
        visited: nextVisited,
    });

    // Private authenticated clients
    wss.clients.forEach((client) => {
        if (
            client !== sender &&
            client.readyState === 1 &&
            client.isAuthenticated &&
            client.user?.id === sender.user?.id &&
            client.appId !== sender.appId
        ) {
            client.send(message);
        }
    });

    // Public read-only stream listeners
    wssPublic.clients.forEach((client) => {
        if (
            client.readyState === 1 &&
            client.isAuthenticated &&
            client.isReadOnly &&
            client.user?.id === sender.user?.id
        ) {
            client.send(message);
        }
    });
}

function broadcastSettings(userId, settings) {
    const message = JSON.stringify({ type: "settings", settings });

    wssPublic.clients.forEach((client) => {
        if (
            client.readyState === 1 &&
            client.isAuthenticated &&
            client.isReadOnly &&
            client.user?.id === userId
        ) {
            client.send(message);
        }
    });
}

function relayToSameUserOtherApps(sender, payload) {
    const message = JSON.stringify(payload);

    wss.clients.forEach((client) => {
        if (
            client !== sender &&
            client.readyState === 1 &&
            client.isAuthenticated &&
            client.user?.id === sender.user?.id &&
            client.appId !== sender.appId
        ) {
            client.send(message);
        }
    });
}

function getDefaultNavigatorState() {
    return {
        page: "",
        baniId: "",
        shabadId: "",
        current: 0,
        home: 0,
        visited: [],
        speech: {
            running: false,
            paused: false,
            command: "stop",
        },
    };
}

function sendNavigatorState(ws) {
    const state = userNavigatorState.get(ws.user.id);

    if (!state) return;

    ws.send(JSON.stringify({
        type: "navigator_state",
        ...state,
    }));
}

wssPublic.on("connection", async (ws, req) => {
    const ip = req.socket.remoteAddress;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const streamKeyName = url.searchParams.get("stream-key-name");

    // ------------------------
    // READ-ONLY STREAM CONNECTION
    // ------------------------
    if (streamKeyName) {
        const stream = await validateStream(streamKeyName);

        if (!stream) {
            logger.warn(`Invalid stream name '${streamKeyName}' from IP ${ip}`);
            ws.close(1008, "Invalid stream");
            return;
        }

        ws.user = { id: stream.user_id, name: `Stream:${stream.name}` };
        ws.appId = "gurbani-stream";
        ws.isAuthenticated = true;
        ws.isReadOnly = true;
        ws.isAlive = true;
        ws.meta = { streamId: stream.id };

        ws.on("pong", heartbeat);

        logger.info(`Read-only stream listener connected: ${stream.name} from ${ip}`);

        ws.on("message", (msg) => {
            try {
                const data = JSON.parse(msg);

                if (data.type === "settings") {
                    const { settings } = data;
                    if (!settings || typeof settings !== "object") {
                        logger.warn(`Invalid settings message from ${ws.user.name}`);
                        return;
                    }

                    // Persist to server-level map
                    userSettings.set(ws.user.id, settings);
                    logger.info(`Settings updated for user ${ws.user.name}`);

                    // Broadcast to public stream listeners
                    broadcastSettings(ws.user.id, settings);
                    return;
                }

                if (data.type === "get-settings") {
                    const storedSettings = userSettings.get(stream.user_id) ?? null;
                    const storedPankti = userPankti.get(stream.user_id) ?? null;

                    ws.send(JSON.stringify({ type: "settings", settings: storedSettings }));
                    if (storedPankti) {
                        ws.send(JSON.stringify({
                            type: "pankti",
                            s: storedPankti.s,
                            c: storedPankti.c ?? 0,
                            h: storedPankti.h ?? 0,
                            b: storedPankti.b ?? null,
                            visited: storedPankti.visited ?? [],
                        }));
                    }
                    return;
                }

                logger.warn(`Read-only client sent disallowed message type '${data.type}' for stream ${stream.name}`);
                ws.close(1008, "Read-only connection");
            } catch {
                logger.warn(`Read-only client sent invalid message for stream ${stream.name}`);
                ws.close(1008, "Read-only connection");
            }
        });

        ws.send(JSON.stringify({ type: "ready" }));

        ws.on("close", () => {
            logger.info(`Read-only stream listener disconnected: ${stream.name}`);
        });

        return;
    }
});

wss.on("connection", async (ws, req) => {
    const ip = req.socket.remoteAddress;
    const url = new URL(req.url, `http://${req.headers.host}`);
    const token = url.searchParams.get("token");
    const ticket = url.searchParams.get("ticket");
    const appId = url.searchParams.get("appid");

    if ((!token && !ticket) || !appId) {
        if (!recordFailure(ip)) {
            logger.warn(`IP ${ip} blocked due to too many invalid attempts`);
            ws.close();
            return;
        }

        logger.warn(`Missing token/appId from IP ${ip}`);
        ws.close();
        return;
    }

    let user = null;

    if (ticket) {
        user = await validateWsTicket(ticket);
    } else {
        user = await validateToken(token);
    }

    if (!user) {
        if (!recordFailure(ip)) {
            logger.warn(`IP ${ip} blocked due to too many invalid attempts`);
            ws.close();
            return;
        }

        logger.warn(`Invalid token from IP ${ip} [app: ${appId}]`);
        ws.close();
        return;
    }

    resetAttempts(ip);
    ws.user = user;
    ws.appId = appId;
    ws.isAuthenticated = true;
    ws.isAlive = true;
    ws.meta = {};

    ws.on("pong", heartbeat);

    logger.info(`User connected: ${ws.user.name} from IP ${ip} for App ${appId}`);

    // ------------------------
    // MESSAGE HANDLER
    // ------------------------
    ws.on("message", (msg, isBinary) => {
        try {
            // ------------------------
            // SAFETY CHECK
            // ------------------------
            if (!ws.isAuthenticated) {
                logger.warn(`Unauthenticated message attempt from IP ${ip}`);
                ws.close();
                return;
            }

            // ------------------------
            // HANDLE BINARY (AUDIO)
            // ------------------------
            if (isBinary) {
                if (!ws.isAuthenticated) {
                    ws.close();
                    return;
                }

                logger.warn(`Ignoring binary message from ${ws.user?.name}; audio must use WebRTC`);
                return;
            }

            const data = JSON.parse(msg);

            // ------------------------
            // TOKEN EVENT (NOT AUTH)
            // ------------------------
            if (data.type === "token") {
                const { t, pt, ct, st, lid, sid } = data;

                // Validate structure
                if (
                    !st
                ) {
                    logger.warn(`Invalid token message from ${ws.user.name}`);
                    return;
                }

                // Broadcast to other clients with same user id
                wss.clients.forEach((client) => {

                    if (
                        client !== ws &&
                        client.readyState === 1 &&
                        client.isAuthenticated &&
                        client.user?.id === ws.user?.id &&
                        client.appId !== ws.appId
                    ) {
                        client.send(JSON.stringify({
                            type: "token",
                            t,
                            pt,
                            ct,
                            st,
                            lid,
                            sid
                        }));
                    }
                });

                return;
            }

            if (data.type === "page") {
                const { p } = data;

                // Validate structure
                if (
                    !p
                ) {
                    logger.warn(`Invalid page message from ${ws.user.name}`);
                    return;
                }

                const existing = userNavigatorState.get(ws.user.id) ?? getDefaultNavigatorState();

                userNavigatorState.set(ws.user.id, {
                    ...existing,
                    page: p,
                });

                wss.clients.forEach((client) => {
                    if (
                        client.readyState === 1 &&
                        client.isAuthenticated &&
                        client.user?.id === ws.user?.id &&
                        client.appId !== ws.appId
                    ) {
                        client.send(JSON.stringify({
                            type: "page",
                            p
                        }))
                    }
                });

                return;
            }

            if (data.type === "pankti") {
                const { s, c, h, b, visited } = data;

                if (!s && !b) {
                    return;
                }

                broadcastPankti(ws, { s, c, h, b, visited });

                return;
            }

            if (data.type === "search-term") {
                const { s } = data;

                wss.clients.forEach((client) => {
                    if (
                        client.readyState === 1 &&
                        client.isAuthenticated &&
                        client.user?.id === ws.user?.id &&
                        client.appId !== ws.appId
                    ) {
                        client.send(JSON.stringify({
                            type: "search-term",
                            s: s ?? "",
                        }))
                    }
                });

                return;
            }

            if (data.type === "search-p") {
                const { p } = data;

                wss.clients.forEach((client) => {
                    if (
                        client.readyState === 1 &&
                        client.isAuthenticated &&
                        client.user?.id === ws.user?.id &&
                        client.appId !== ws.appId
                    ) {
                        client.send(JSON.stringify({
                            type: "search-p",
                            p: p ?? [],
                        }))
                    }
                });
            }

            if (data.type === "search-select") {
                const { id } = data;
                if (!id) {
                    return;
                }

                wss.clients.forEach((client) => {
                    if (
                        client.readyState === 1 &&
                        client.isAuthenticated &&
                        client.user?.id === ws.user?.id &&
                        client.appId !== ws.appId
                    ) {
                        client.send(JSON.stringify({
                            type: "search-select",
                            id: id
                        }))
                    }
                });
            }

            if (data.type === "speech") {
                const { command } = data;

                const allowedCommands = ["start", "pause", "resume", "stop"];

                if (!allowedCommands.includes(command)) {
                    logger.warn(`Invalid speech command from ${ws.user.name}: ${command}`);
                    return;
                }

                const existing = userNavigatorState.get(ws.user.id) ?? getDefaultNavigatorState();

                const speech =
                    command === "start"
                        ? { running: true, paused: false, command }
                        : command === "pause"
                            ? { running: true, paused: true, command }
                            : command === "resume"
                                ? { running: true, paused: false, command }
                                : { running: false, paused: false, command };

                userNavigatorState.set(ws.user.id, {
                    ...existing,
                    speech,
                });

                wss.clients.forEach((client) => {
                    if (
                        client.readyState === 1 &&
                        client.isAuthenticated &&
                        client.user?.id === ws.user?.id &&
                        client.appId !== ws.appId
                    ) {
                        client.send(JSON.stringify({
                            type: "speech",
                            command
                        }));
                    }
                });

                return;
            }

            // ------------------------
            // NORMAL MESSAGE
            // ------------------------
            if (data.type === "message") {
                wss.clients.forEach((client) => {
                    if (
                        client.readyState === 1 &&
                        client.isAuthenticated &&
                        client.user?.id === ws.user?.id &&
                        client.appId !== ws.appId
                    ) {
                        client.send(JSON.stringify({
                            type: "message",
                            user: ws.user.name,
                            message: data.message,
                            timestamp: Date.now()
                        }));
                    }
                });

                return;
            }

            // ------------------------
            // PING
            // ------------------------
            if (data.type === "ping") {
                ws.send(JSON.stringify({ type: "pong" }));
                return;
            }

            if (data.type === "audio_start") {
                ws.meta.audio = {
                    sampleRate: data.sampleRate,
                    channels: data.channels
                };
                return;
            }

            if (data.type === "audio_end") {
                delete ws.meta.audio;
                return;
            }

            if (data.type === "webrtc_offer") {
                if (!data.sdp || typeof data.sdp !== "string") {
                    logger.warn(`Invalid WebRTC offer from ${ws.user.name}`);
                    return;
                }

                logger.info(`Relaying WebRTC offer from ${ws.appId} for user ${ws.user.id}`);

                relayToSameUserOtherApps(ws, {
                    type: "webrtc_offer",
                    sdp: data.sdp,
                });

                return;
            }

            if (data.type === "webrtc_answer") {
                if (!data.sdp || typeof data.sdp !== "string") {
                    logger.warn(`Invalid WebRTC answer from ${ws.user.name}`);
                    return;
                }

                logger.info(`Relaying WebRTC answer from ${ws.appId} for user ${ws.user.id}`);

                relayToSameUserOtherApps(ws, {
                    type: "webrtc_answer",
                    sdp: data.sdp,
                });

                return;
            }

            if (data.type === "webrtc_receiver_ready") {
                logger.info(`Relaying WebRTC receiver ready from ${ws.appId} for user ${ws.user.id}`);

                relayToSameUserOtherApps(ws, {
                    type: "webrtc_receiver_ready",
                });

                return;
            }

            if (data.type === "webrtc_ice_candidate") {
                logger.info(`Relaying WebRTC ICE candidate from ${ws.appId} for user ${ws.user.id}`);

                relayToSameUserOtherApps(ws, {
                    type: "webrtc_ice_candidate",
                    candidate: data.candidate,
                });

                return;
            }

            if (data.type === "get-navigator-state") {
                logger.info(`Navigator state requested by ${ws.appId} for user ${ws.user.id}`);

                sendNavigatorState(ws);

                return;
            }
        } catch (err) {
            logger.error(`Message error from ${ws.user?.name}: ${err}`);
        }
    });

    ws.send(JSON.stringify({ type: "ready" }));

    ws.on("close", () => {
        logger.info(`User disconnected: ${ws.user?.name || "unknown"}`);
    });
});

// ------------------------
// Ping clients periodically to detect dead connections
// ------------------------
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
            logger.info(`Terminating dead connection for user: ${ws.user?.name || 'unknown'}`);
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000); // ping every 30 seconds

wss.on("close", () => {
    clearInterval(interval);
});

logger.info("WebSocket server running on ws://localhost:3001");