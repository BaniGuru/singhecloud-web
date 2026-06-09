import AppLayout from '@/layouts/app-layout';
import { dashboard } from '@/routes';
import { type BreadcrumbItem } from '@/types';
import { Head, usePage } from '@inertiajs/react';
import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import "../../../css/font.css";
import {
  BookOpen,
  Check,
  Home,
  PauseCircle,
  PlayCircle,
  Search,
  Settings,
  Square,
} from 'lucide-react';

interface SpeechToken {
  final_token: string;
  partial_token: string;
}

interface SearchPankti {
  id: string;
  gurmukhi: string;
  source_page: number;
}

interface Pankti {
  id: string;
  gurmukhi: string;
  translation: string;
}

const breadcrumbs: BreadcrumbItem[] = [
  { title: 'Gurbani Navigator', href: dashboard().url },
];

function getLatestFinal(final: string, maxLength = 100) {
  if (final.length <= maxLength) return final;
  return final.slice(-maxLength);
}

function clearGurmukhi(gurmukhi: string) {
  return gurmukhi.replaceAll(";", "").replaceAll(".", "").replaceAll(",", "");
}

const renderGurbani = (gurmukhi: string) => {
  return gurmukhi.split(" ").map((word, index) => {
    let color = "currentColor";
    let cleanWord = word;

    if (word.endsWith(";")) {
      color = "#e56c00";
      cleanWord = word.slice(0, -1);
    } else if (word.endsWith(",") || word.endsWith(".")) {
      color = "#196fb2ff";
      cleanWord = word.slice(0, -1);
    }

    return (
      <span key={index}>
        <span style={{ color }}>{cleanWord}</span>{" "}
      </span>
    );
  });
};

export default function GurbaniNavigator() {
  const wsRef = useRef<WebSocket | null>(null);

  const peerRef = useRef<RTCPeerConnection | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const [webrtcState, setWebrtcState] = useState("idle");

  const [speechRunning, setSpeechRunning] = useState(false);
  const [speechPaused, setSpeechPaused] = useState(false);

  const [token, setToken] = useState<SpeechToken>({
    final_token: "",
    partial_token: "",
  });

  const [page, setPage] = useState<string>("");
  const [shabadState, setShabadState] = useState<{
    current: number;
    home: number;
    shabadId: string;
    baniId: number | null;
  }>({
    current: 0,
    home: 0,
    shabadId: "",
    baniId: null,
  });

  const [panktis, setPanktis] = useState<Pankti[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);

  const { apiToken, appId, wssServer } = usePage().props;

  const [search, setSearch] = useState("");
  const [searchPanktis, setSearchPanktis] = useState<SearchPankti[]>([]);
  const [lineIds, setLineIds] = useState<string[]>([]);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);
  const [visited, setVisited] = useState<number[]>([]);
  const shabadIdRef = useRef("");

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchResultRefs = useRef<Array<HTMLDivElement | null>>([]);

  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = localStorage.getItem("gurmukhi-font-size");
    return saved ? Number(saved) : 80;
  });

  const [panelHeight, setPanelHeight] = useState<number>(() => {
    const saved = localStorage.getItem("navigator-panel-height");
    return saved ? Number(saved) : 40;
  });

  useEffect(() => {
    localStorage.setItem("navigator-panel-height", String(panelHeight));
  }, [panelHeight]);

  useEffect(() => {
    localStorage.setItem("gurmukhi-font-size", String(fontSize));
  }, [fontSize]);

  useEffect(() => {
    shabadIdRef.current = shabadState.shabadId;
  }, [shabadState.shabadId]);

  async function getTurnIceServers() {
    const res = await fetch("/turn-credentials", {
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json",
      },
    });

    return await res.json();
  }

  const handleWebrtcOffer = useCallback(async (sdp: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    peerRef.current?.close();

    const config = await getTurnIceServers();
    const pc = new RTCPeerConnection(config);

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: "webrtc_ice_candidate",
          candidate: event.candidate,
        }));
      }
    };

    peerRef.current = pc;
    setWebrtcState("connecting");

    pc.ontrack = async (event) => {
      const stream = event.streams?.[0] ?? new MediaStream([event.track]);
      remoteStreamRef.current = stream;

      if (audioElRef.current) {
        audioElRef.current.srcObject = stream;

        try {
          await audioElRef.current.play();
        } catch (err) {
          console.warn("Autoplay blocked. User must click audio button.", err);
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      setWebrtcState(pc.iceConnectionState);

      if (pc.iceConnectionState === "failed") {
        window.setTimeout(() => {
          wsRef.current?.send(JSON.stringify({
            type: "webrtc_receiver_ready",
          }));
        }, 1500);
      }
    };

    pc.onconnectionstatechange = () => {
      setWebrtcState(pc.connectionState);
    };

    await pc.setRemoteDescription({
      type: "offer",
      sdp,
    });

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await new Promise<void>((resolve) => {
      if (pc.iceGatheringState === "complete") {
        resolve();
        return;
      }

      const check = () => {
        if (pc.iceGatheringState === "complete") {
          pc.removeEventListener("icegatheringstatechange", check);
          resolve();
        }
      };

      pc.addEventListener("icegatheringstatechange", check);
    });

    wsRef.current.send(
      JSON.stringify({
        type: "webrtc_answer",
        sdp: pc.localDescription?.sdp,
      })
    );
  }, []);

  async function getWsTicket() {
    const res = await fetch("/ws-ticket", {
      headers: {
        Accept: "application/json",
      },
      credentials: "same-origin",
    });

    if (!res.ok) {
      throw new Error("Failed to get WebSocket ticket");
    }

    return await res.json();
  }

  useEffect(() => {
    if (wsRef.current) return;

    let cancelled = false;

    async function connect() {

      // IMPORTANT:
      // React appId must be different from Rust appId.
      // Server relays only when client.appId !== ws.appId.
      const receiverAppId =
        appId === "gurbani-explorer" ? "gurbani-web-receiver" : appId;

      const { ticket } = await getWsTicket();

      if (cancelled) return;

      const socket = new WebSocket(
        `${wssServer}?ticket=${ticket}&appid=${receiverAppId}`
      );

      socket.onopen = () => {
        console.log("Connected to WSS server");
      };

      socket.onmessage = async (event) => {
        if (event.data instanceof Blob) {
          console.warn("Ignoring binary WebSocket audio. Audio now uses WebRTC.");
          return;
        }

        const data = JSON.parse(event.data);

        if (data.type === "ready") {
          socket.send(JSON.stringify({
            type: "get-navigator-state",
          }));

          socket.send(JSON.stringify({
            type: "webrtc_receiver_ready",
          }));
          return;
        }

        if (data.type === "webrtc_offer") {
          await handleWebrtcOffer(data.sdp);
          return;
        }

        if (data.type === "webrtc_ice_candidate") {
          if (peerRef.current && data.candidate) {
            await peerRef.current.addIceCandidate(data.candidate);
          }
          return;
        }

        if (data.type === "token") {
          setToken((token) => ({
            final_token: token.final_token + data.t,
            partial_token: data.pt,
          }));
        }  else if (data.type === "pankti") {
          const nextShabadId = data.s ?? "";
          const nextCurrent = data.c ?? 0;

          const nextVisited = Array.isArray(data.visited)
            ? data.visited
            : [];

          shabadIdRef.current = nextShabadId;

          setVisited(nextVisited);

          setShabadState({
            current: nextCurrent,
            home: data.h ?? 0,
            shabadId: nextShabadId,
            baniId: data.b ?? null,
          });

          setPage("shabad");
        } else if (data.type === "search-p") {
          setLineIds(data.p);
        } else if (data.type === "page") {
          setPage(data.p);
        }

        if (data.type === "speech") {
          switch (data.command) {
            case "start":
              setSpeechRunning(true);
              setSpeechPaused(false);
              break;

            case "pause":
              setSpeechRunning(true);
              setSpeechPaused(true);
              break;

            case "resume":
              setSpeechRunning(true);
              setSpeechPaused(false);
              break;

            case "stop":
              setSpeechRunning(false);
              setSpeechPaused(false);
              break;
          }

          return;
        }

        if (data.type === "navigator_state") {
          if (data.speech) {
            setSpeechRunning(Boolean(data.speech.running));
            setSpeechPaused(Boolean(data.speech.paused));
          }

          const nextShabadId = data.shabadId ?? "";

          shabadIdRef.current = nextShabadId;

          setVisited(Array.isArray(data.visited) ? data.visited : []);

          setShabadState({
            current: data.current ?? 0,
            home: data.home ?? 0,
            shabadId: nextShabadId,
            baniId: data.baniId ?? null,
          });

          setPage(data.page ?? "");

          return;
        }
      };

      socket.onclose = () => {
        console.log("Disconnected");
        setWebrtcState("disconnected");
      };

      socket.onerror = (err) => {
        console.error("WebSocket error:", err);
      };

      wsRef.current = socket;
    }

    connect();

    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;

      peerRef.current?.close();
      peerRef.current = null;

      if (audioElRef.current) {
        audioElRef.current.srcObject = null;
      }

      remoteStreamRef.current = null;
    };
  }, [appId, wssServer, handleWebrtcOffer]);

  useEffect(() => {
    if (shabadState.baniId !== null) {
      axios.get(`/api/gurbani/bani/${shabadState.baniId}`).then((res) => {
        setPanktis(res.data.panktis);
      });

      return;
    }

    if (shabadState.shabadId === "") return;

    axios.get(`/shabads/${shabadState.shabadId}`).then((res) => {
      setPanktis(res.data.panktis);
    });
  }, [shabadState.shabadId, shabadState.baniId]);

  useEffect(() => {
    if (lineIds.length === 0) return;

    axios.post("/panktis", { lines: lineIds }).then((res) => {
      setSearchPanktis(res.data);
    });
  }, [lineIds]);

  useEffect(() => {
    setSelectedSearchIndex(0);
    searchResultRefs.current = searchResultRefs.current.slice(
      0,
      searchPanktis.length
    );
  }, [searchPanktis]);

  useEffect(() => {
    if (page === "search" && !isMinimized) {
      searchInputRef.current?.focus();
    }
  }, [page, isMinimized]);

  useEffect(() => {
    if (page !== "search") return;

    searchResultRefs.current[selectedSearchIndex]?.scrollIntoView({
      block: "nearest",
    });
  }, [page, selectedSearchIndex]);

  const syncCurrentPankti = useCallback(
    (idx: number) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      let adjustIdx = 0;
      if (shabadState.baniId === 13 && shabadState.current > 7) {
          adjustIdx = 1;
      }
  
      wsRef.current.send(
        JSON.stringify({
          type: "pankti",
          s: shabadState.shabadId,
          c: (idx - adjustIdx),
          h: shabadState.home,
          b: shabadState.baniId,
        })
      );
    },
    [shabadState.shabadId, shabadState.home, shabadState.baniId]
  );

  const syncSearchPankti = useCallback((id: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(
      JSON.stringify({
        type: "search-select",
        id,
      })
    );
  }, []);

  const syncHome = useCallback(
    (home: number) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      wsRef.current.send(
        JSON.stringify({
          type: "pankti",
          s: shabadState.shabadId,
          c: shabadState.current,
          h: home,
          b: shabadState.baniId,
        })
      );

      setShabadState((state) => ({ ...state, home }));
    },
    [shabadState.current, shabadState.shabadId, shabadState.baniId]
  );

  const syncPage = useCallback(
    (navPage: string) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "page",
            p: navPage,
          })
        );
      }

      if (navPage !== page) {
        setPage(navPage);

        if (page === "search") {
          setSearch("");
        }
      }
    },
    [page]
  );

  const goToPankti = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= panktis.length) return;
      syncCurrentPankti(idx);
    },
    [panktis.length, syncCurrentPankti]
  );

  const goToNextUnvisited = useCallback(() => {
    const next = panktis.findIndex(
      (_, index) => index !== shabadState.home && !visited.includes(index)
    );

    if (next !== -1) {
      syncCurrentPankti(next);
    }
  }, [panktis, shabadState.home, visited, syncCurrentPankti]);

  const sendSpeechCommand = useCallback((command: "start" | "pause" | "resume" | "stop") => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    wsRef.current.send(
      JSON.stringify({
        type: "speech",
        command,
      })
    );

    if (command === "start") {
      setSpeechRunning(true);
      setSpeechPaused(false);
    }

    if (command === "pause") {
      setSpeechPaused(true);
    }

    if (command === "resume") {
      setSpeechPaused(false);
    }

    if (command === "stop") {
      setSpeechRunning(false);
      setSpeechPaused(false);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;

      if ((e.ctrlKey || e.metaKey) && e.key === "/") {
        e.preventDefault();
        setIsMinimized(false);
        syncPage("search");
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
        return;
      }

      if (page === "search") {
        if (searchPanktis.length === 0) return;

        const moveSelectedSearchIndex = (direction: 1 | -1) => {
          setSelectedSearchIndex((current) => {
            const next = current + direction;
            return Math.min(Math.max(next, 0), searchPanktis.length - 1);
          });
        };

        if (["ArrowDown", "ArrowRight"].includes(e.key)) {
          e.preventDefault();
          moveSelectedSearchIndex(1);
          return;
        }

        if (["ArrowUp", "ArrowLeft"].includes(e.key)) {
          e.preventDefault();
          moveSelectedSearchIndex(-1);
          return;
        }

        if (e.key === "Enter") {
          e.preventDefault();

          const selectedPankti = searchPanktis[selectedSearchIndex];

          if (selectedPankti) {
            syncSearchPankti(selectedPankti.id);
          }

          return;
        }
      }

      if (page !== "shabad") return;

      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return;
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        goToPankti(shabadState.current + 1);
      }

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goToPankti(shabadState.current - 1);
      }

      if (e.key === " ") {
        e.preventDefault();

        if (shabadState.current === shabadState.home) {
          goToNextUnvisited();
        } else {
          syncCurrentPankti(shabadState.home);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    page,
    searchPanktis,
    selectedSearchIndex,
    shabadState.current,
    shabadState.home,
    goToPankti,
    goToNextUnvisited,
    syncCurrentPankti,
    syncSearchPankti,
    syncPage,
  ]);

  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "search-term",
          s: search,
        })
      );
    }
  }, [search]);

  const currentPankti: Pankti | null = panktis[shabadState.current] ?? null;

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Gurbani Navigator" />

      <audio ref={audioElRef} autoPlay playsInline />

      {currentPankti && (
        <div className="row mt-8 p-4 text-center text-black dark:text-white">
          <div
            className="col-12 shabad-text"
            style={{
              letterSpacing: "-1px",
              fontSize: `${fontSize}px`,
            }}
          >
            {renderGurbani(currentPankti.gurmukhi)}
          </div>

          <div className="col-12">{currentPankti.translation}</div>
        </div>
      )}

      {isMinimized && (
        <div>
        <audio ref={audioElRef} autoPlay playsInline />

        <button
          onClick={() => setIsMinimized(false)}
          className="fixed bottom-4 right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-gray-300 bg-white dark:text-black shadow-lg hover:bg-gray-100"
          title="Open Navigator"
        >
          <BookOpen className="h-5 w-5" />
        </button>
        </div>
      )}

      {!isMinimized && (
      <div
        className={`fixed bottom-2 left-16 right-2 lg:left-auto lg:right-2 lg:w-[40%] rounded-xl bg-gray-50 text-gray-800 transition-all duration-300 border flex flex-col overflow-hidden ${
          isMinimized ? "h-[52px]" : ""
        }`}
        style={!isMinimized ? { height: `${panelHeight}%` } : undefined}
      >
        <div className="flex items-center justify-between border-b border-gray-300 px-4 py-2 flex-none">
          <div className="flex flex-row items-center">
            <div
              title={`Audio Stream: ${webrtcState}`}
              className={`h-3 w-3 mr-2 rounded-full ${
                webrtcState === "connected" ||
                webrtcState === "completed" ||
                webrtcState === "idle"
                  ? "bg-green-600"
                  : webrtcState === "connecting" ||
                      webrtcState === "checking" ||
                      webrtcState === "new"
                    ? "bg-yellow-500 animate-pulse"
                    : "bg-red-500"
              }`}
            />

            {!speechRunning ? (
              <button
                onClick={() => sendSpeechCommand("start")}
                title="Start speech"
                className="text-green-700 hover:text-green-900"
              >
                <PlayCircle />
              </button>
            ) : (
              <>
                {!speechPaused ? (
                  <button
                    onClick={() => sendSpeechCommand("pause")}
                    title="Pause speech"
                    className="text-yellow-700 hover:text-yellow-900"
                  >
                    <PauseCircle />
                  </button>
                ) : (
                  <button
                    onClick={() => sendSpeechCommand("resume")}
                    title="Resume speech"
                    className="text-green-700 hover:text-green-900"
                  >
                    <PlayCircle />
                  </button>
                )}

                <button
                  onClick={() => sendSpeechCommand("stop")}
                  title="Stop speech"
                  className="text-red-700 hover:text-red-900"
                >
                  <Square />
                </button>
              </>
            )}
          </div>

          <span
            className="flex-1 overflow-hidden whitespace-nowrap text-ellipsis text-sm font-semibold tracking-wide"
            style={{
              direction: "rtl",
              textAlign: "left",
            }}
          >
            {getLatestFinal(token.final_token + token.partial_token)}
          </span>

          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="rounded-md px-2 py-1 text-lg hover:bg-gray-200 transition"
          >
            {isMinimized ? "▢" : "—"}
          </button>
        </div>

        {!isMinimized && (
          <>
            {page === "shabad" && (
              <div className="flex-1 overflow-y-auto space-y-2">
                {panktis.map((pankti, index) => (
                  <div
                    key={index}
                    className={`shabad-text border-b border-gray-200 cursor-default font-normal px-2 py-2 ${
                      index === shabadState.current ? "bg-gray-200" : ""
                    }`}
                    style={{ fontSize: `${Math.max(fontSize * 0.25, 18)}px` }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="group w-6 h-6 flex items-center justify-center">
                        {index === shabadState.home ? (
                          <Home />
                        ) : (
                          <>
                            <div className="group-hover:opacity-0 opacity-100 transition-opacity duration-150 text-gray-500">
                              {visited.includes(index) && <Check size={16} />}
                            </div>

                            <div className="absolute opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                              <Home onClick={() => syncHome(index)} />
                            </div>
                          </>
                        )}
                      </div>

                      <div onClick={() => syncCurrentPankti(index)}>
                        {clearGurmukhi(pankti.gurmukhi)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {page === "search" && (
              <div className="flex-1 overflow-y-auto space-y-2">
                <div className="m-2">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="gurmukhi bg-white w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:ring-1 focus:ring-gray-200 focus:border-gray-500"
                    placeholder="Koj..."
                    style={{ fontSize: "18px" }}
                  />
                </div>

                <div>
                  {searchPanktis.map((searchPankti, index) => (
                    <div
                      key={searchPankti.id}
                      ref={(el) => {
                        searchResultRefs.current[index] = el;
                      }}
                      className={`gurmukhi border-b border-gray-200 cursor-default font-normal px-2 py-2 ${
                        index === 0 ? "border-t" : ""
                      } ${
                        index === selectedSearchIndex ? "bg-gray-200" : ""
                      }`}
                      onClick={() => syncSearchPankti(searchPankti.id)}
                      onMouseEnter={() => setSelectedSearchIndex(index)}
                    >
                      {clearGurmukhi(searchPankti.gurmukhi)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {page === "settings" && (
              <div className="flex-1 overflow-y-auto p-4">
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">
                    Gurmukhi Font Size
                  </label>

                  <input
                    type="range"
                    min="40"
                    max="140"
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="w-full"
                  />

                  <div className="mt-2 text-sm text-gray-600">
                    {fontSize}px
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">
                    Panel Height
                  </label>

                  <input
                    type="range"
                    min="20"
                    max="90"
                    value={panelHeight}
                    onChange={(e) => setPanelHeight(Number(e.target.value))}
                    className="w-full"
                  />

                  <div className="mt-2 text-sm text-gray-600">
                    {panelHeight}%
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center border-t border-gray-300 flex-none">
              <button
                className={`flex flex-col items-center text-xs text-gray-600 px-4 py-3 hover:text-black ${
                  page === "search" ? " bg-gray-300 text-gray-800" : ""
                }`}
                onClick={() => syncPage("search")}
              >
                <Search className="h-5 w-5" />
              </button>

              <button
                className={`flex flex-col items-center text-xs text-gray-600 px-4 py-3 hover:text-black ${
                  page === "shabad" ? " bg-gray-300 text-gray-800" : ""
                }`}
                onClick={() => syncPage("shabad")}
              >
                <BookOpen className="h-5 w-5" />
              </button>

              <button
                className={`flex flex-col items-center text-xs text-gray-600 px-4 py-3 hover:text-black ${
                  page === "settings" ? " bg-gray-300 text-gray-800" : ""
                }`}
                onClick={() => syncPage("settings")}
              >
                <Settings className="h-5 w-5" />
              </button>
            </div>
          </>
        )}
      </div>
      )}
    </AppLayout>
  );
}