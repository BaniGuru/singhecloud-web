import AppLayout from '@/layouts/app-layout';
import { dashboard } from '@/routes';
import { type BreadcrumbItem } from '@/types';
import { Head, usePage } from '@inertiajs/react';
import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import "../../../css/font.css";
import { BookOpen, Check, FastForward, Home, Mic, MicOff, Search, Settings } from 'lucide-react';

interface SpeechToken {
  final_token: string;
  partial_token: string;
}

interface SearchPankti {
  id: string;
  gurmukhi: string;
  source_page: number;
}

const breadcrumbs: BreadcrumbItem[] = [
  { title: 'Gurbani Navigator', href: dashboard().url },
];

function getLatestFinal(final: string, maxLength = 100) {
  if (final.length <= maxLength) return final;
  return final.slice(-maxLength);
}

function clearGurmukhi(gurmukhi: string) {
  return gurmukhi
    .replaceAll(";", "")
    .replaceAll(".", "")
    .replaceAll(",", "")
}

const renderGurbani = (gurmukhi: string) => {
    return gurmukhi.split(" ").map((word, index) => {
      let color = "#000000ff";
      let cleanWord = word;
      let isFullVishraam = false;

      if (word.endsWith(";")) {
        color = "#e56c00";
        cleanWord = word.slice(0, -1);
        isFullVishraam = true;
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

interface Pankti {
  id: string,
  gurmukhi: string,
  translation: string,
};

export default function GurbaniNavigator() {
  const wsRef = useRef<WebSocket|null>(null);
  const [token, setToken] = useState<SpeechToken>({final_token: "", partial_token: ""});
  const [page, setPage] = useState<string>("");
  const [shabadState, setShabadState] = useState<{current: number, home: number, shabadId: string}>({current: 0, home: 0, shabadId: ""});
  const [panktis, setPanktis] = useState<Pankti[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const { apiToken, appId, wssServer } = usePage().props;
  const [search, setSearch] = useState("");
  const [searchPanktis, setSearchPanktis] = useState<SearchPankti[]>([]);
  const [lineIds, setLineIds] = useState<string[]>([]);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);
  const [visited, setVisited] = useState<number[]>([]);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchResultRefs = useRef<Array<HTMLDivElement | null>>([]);
  const audioQueueRef = useRef<Uint8Array[]>([]);
  const processingRef = useRef(false);

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

  // =========================
  // AUDIO (RAW PCM 8kHz i16)
  // =========================

  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);

  // Init AudioContext (must match backend sample rate)
  useEffect(() => {
    const ctx = new AudioContext({ sampleRate: 8000 });
    audioCtxRef.current = ctx;

    return () => {
      ctx.close();
    };
  }, []);

  const TARGET_LATENCY = 0.06;
  const MAX_LATENCY = 0.20;
  const MAX_QUEUE_FRAMES = 4;

  const [audioLagMs, setAudioLagMs] = useState(0);
  const lastLagUpdateRef = useRef(0);
  const smoothedLagRef = useRef(0);

  // Decode i16 PCM → Float32
  function decodePCM16(buffer: ArrayBuffer) {
    const view = new DataView(buffer);
    const samples = new Float32Array(buffer.byteLength / 2);

    for (let i = 0; i < samples.length; i++) {
      samples[i] = view.getInt16(i * 2, true) / 32768;
    }

    return samples;
  }

  const processAudioQueue = async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    try {
      const audioCtx = audioCtxRef.current!;
      const queue = audioQueueRef.current;

      while (queue.length > 0) {

        const chunk: any = queue.shift()!;
        const samples = decodePCM16(chunk.buffer);

        const buffer = audioCtx.createBuffer(1, samples.length, 8000);
        buffer.copyToChannel(samples, 0);

        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);

        const now = audioCtx.currentTime;
        const lagMs = Math.max(0, (nextPlayTimeRef.current - now) * 1000);
        const nowMs = performance.now();

        // smooth the value
        smoothedLagRef.current =
          smoothedLagRef.current * 0.85 + lagMs * 0.15;

        // update UI only 4 times/sec
        if (nowMs - lastLagUpdateRef.current > 250) {
          lastLagUpdateRef.current = nowMs;
          setAudioLagMs(Math.round(smoothedLagRef.current));
        }

        const queuedLatency = nextPlayTimeRef.current - now;

        if (queuedLatency > MAX_LATENCY) {
          nextPlayTimeRef.current = now + TARGET_LATENCY;

          while (queue.length > 2) {
            queue.shift(); // skip old packets
          }
        }

        if (nextPlayTimeRef.current < now) {
          nextPlayTimeRef.current = now + TARGET_LATENCY;
        }

        source.start(nextPlayTimeRef.current);
        nextPlayTimeRef.current += buffer.duration;
      }

    } finally {
      processingRef.current = false;
    }
  };

  const jumpToLive = () => {
    const audioCtx = audioCtxRef.current;

    if (!audioCtx) return;

    audioQueueRef.current = [];
    nextPlayTimeRef.current = audioCtx.currentTime + TARGET_LATENCY;
  };

  const toggleAudio = async () => {
    const audioCtx = audioCtxRef.current;

    if (!audioCtx) return;

    if (audioCtx.state === "running") {
      await audioCtx.suspend();
      return;
    }

    audioQueueRef.current = [];
    nextPlayTimeRef.current = 0;
    await audioCtx.resume();
    nextPlayTimeRef.current = audioCtx.currentTime + TARGET_LATENCY;
  };

  useEffect(() => {
    if (!wsRef.current) {
      const socket = new WebSocket(`${wssServer}?token=${apiToken}&appid=${appId}`);
      
      socket.onopen = () => console.log("Connected to WSS server");
      socket.onmessage = async (event) => {
        // ------------------------
        // HANDLE BINARY (AUDIO)
        // ------------------------
        if (event.data instanceof Blob) {
          event.data.arrayBuffer().then((buf) => {
            while (audioQueueRef.current.length >= MAX_QUEUE_FRAMES) {
              audioQueueRef.current.shift(); // drop old audio
            }

            audioQueueRef.current.push(new Uint8Array(buf));
            processAudioQueue(); // trigger async processor
          });

          return;
        }

        const data = JSON.parse(event.data);
        if (data.type === "token") {
          setToken(token => {return {final_token: token.final_token + data.t, partial_token: data.pt}});
        } else if (data.type === "pankti") {
          setVisited(visited =>
            visited.includes(data.c)
              ? visited
              : [...visited, data.c]
          );
          setShabadState({current: data.c ?? 0, home: data.h ?? 0, shabadId: data.s ?? ""});
          setPage('shabad');
        } else if (data.type === "search-p") {
          setLineIds(data.p);
        } else if (data.type === "page") {
          setPage(data.p);
        }
      };
      socket.onclose = () => console.log("Disconnected");

      wsRef.current = socket;
    }

    return () => {
      wsRef.current?.close();
      wsRef.current = null;
    }
  }, [appId, apiToken, wssServer]);

  useEffect(() => {
    if (shabadState.shabadId === "") {
      return;
    }

    setVisited([]);
    axios.get(`/shabads/${shabadState.shabadId}`)
      .then(res => {
        setPanktis(res.data.panktis)
      });
  }, [shabadState.shabadId]);

  useEffect(() => {
    if (lineIds.length === 0) {
      return;
    }

    axios.post('/panktis', {
      lines: lineIds
    }).then(res => setSearchPanktis(res.data));
  }, [lineIds, setSearchPanktis])

  useEffect(() => {
    setSelectedSearchIndex(0);
    searchResultRefs.current = searchResultRefs.current.slice(0, searchPanktis.length);
  }, [searchPanktis]);

  useEffect(() => {
    if (page === 'search' && !isMinimized) {
      searchInputRef.current?.focus();
    }
  }, [page, isMinimized]);

  useEffect(() => {
    if (page !== 'search') return;

    searchResultRefs.current[selectedSearchIndex]?.scrollIntoView({
      block: 'nearest',
    });
  }, [page, selectedSearchIndex]);

  const syncCurrentPankti = useCallback((idx: number) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    wsRef.current.send(
      JSON.stringify({
        type: 'pankti',
        s: shabadState.shabadId,
        c: idx,
        h: shabadState.home,
        b: null,
      })
    );
  }, [shabadState.shabadId, shabadState.home]);

  const syncSearchPankti = useCallback((id: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    wsRef.current.send(
      JSON.stringify({
        type: 'search-select',
        id: id
      })
    );
  }, []);

  const syncHome = useCallback((home: number) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      return;
    }

    wsRef.current.send(
      JSON.stringify({
        type: 'pankti',
        s: shabadState.shabadId,
        c: shabadState.current,
        h: home,
        b: null,
      })
    );

    setShabadState(state => {return {...state, home: home}});
  }, [shabadState.current, shabadState.shabadId])

  const syncPage = useCallback((navPage: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(

      JSON.stringify({
          type: 'page',
          p: navPage
        })
      )
    }

    if (navPage !== page) {
      setPage(navPage);
      if (page === 'search') {
        setSearch("");
      }
    }
  }, [page]);

  const goToPankti = useCallback((idx: number) => {
    if (idx < 0 || idx >= panktis.length) return;
    syncCurrentPankti(idx);
  }, [panktis.length, syncCurrentPankti]);

  const goToNextUnvisited = useCallback(() => {
    const next = panktis.findIndex((_, index) =>
      index !== shabadState.home && !visited.includes(index)
    );

    if (next !== -1) {
      syncCurrentPankti(next);
    }
  }, [panktis, shabadState.home, visited, syncCurrentPankti]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;

      if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setIsMinimized(false);
        syncPage('search');
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
        return;
      }

      if (page === 'search') {
        if (searchPanktis.length === 0) return;

        const moveSelectedSearchIndex = (direction: 1 | -1) => {
          setSelectedSearchIndex(current => {
            const next = current + direction;
            return Math.min(Math.max(next, 0), searchPanktis.length - 1);
          });
        };

        if (['ArrowDown', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          moveSelectedSearchIndex(1);
          return;
        }

        if (['ArrowUp', 'ArrowLeft'].includes(e.key)) {
          e.preventDefault();
          moveSelectedSearchIndex(-1);
          return;
        }

        if (e.key === 'Enter') {
          e.preventDefault();
          const selectedPankti = searchPanktis[selectedSearchIndex];

          if (selectedPankti) {
            syncSearchPankti(selectedPankti.id);
          }
          return;
        }
      }

      if (page !== 'shabad') return;

      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToPankti(shabadState.current + 1);
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPankti(shabadState.current - 1);
      }

      if (e.key === ' ') {
        e.preventDefault();

        if (shabadState.current === shabadState.home) {
          goToNextUnvisited();
        } else {
          syncCurrentPankti(shabadState.home);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
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
          type: 'search-term',
          s: search
        })
      )
    }
  }, [search]);

  const currentPankti: Pankti|null = panktis[shabadState.current] ?? null;

  return (
    <AppLayout breadcrumbs={breadcrumbs}>
      <Head title="Gurbani Navigator" />

      {currentPankti &&
          <div className='row mt-8 p-4 text-center'>
            <div className='col-12 shabad-text'
              style={{
                letterSpacing: '-1px',
                fontSize: `${fontSize}px`
              }}
            >
              {renderGurbani(currentPankti.gurmukhi)}
            </div>
            <div className='col-12'>
              {currentPankti.translation}
            </div>
        </div>
      }

     <div
        className={`fixed bottom-2 left-16 right-2 lg:left-auto lg:right-2 lg:w-[40%] rounded-xl bg-gray-50 text-gray-800 transition-all duration-300 border flex flex-col overflow-hidden ${
          isMinimized ? "h-[52px]" : ""
        }`}
        style={!isMinimized ? { height: `${panelHeight}%` } : undefined}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-300 px-4 py-2 flex-none">
          <div className='flex flex-row'>
            <button onClick={toggleAudio}>
              {audioCtxRef.current?.state !== "running" ? (
                <MicOff />
              ) : (
                <Mic />
              )}
            </button>
            <div className="w-16 ml-2 mt-2">
              <div className="relative h-2 w-full rounded bg-gray-200 overflow-hidden">
                <div
                  className={`absolute left-0 top-0 h-full transition-all duration-200 ${
                    audioLagMs < 120
                      ? "bg-green-500"
                      : audioLagMs < 300
                      ? "bg-yellow-500"
                      : "bg-red-500"
                  }`}
                  style={{
                    width: `${Math.min(100, (audioLagMs / 500) * 100)}%`,
                  }}
                />
              </div>
            </div>
            {audioLagMs > 50 && (
              <button
                onClick={jumpToLive}
                className="text-gray-600 hover:text-gray-900 transition ml-2"
              >
                <FastForward size={16} />
              </button>
            )}
          </div>
          <span className="text-sm font-semibold tracking-wide">
            {getLatestFinal(token.final_token + token.partial_token)}
          </span>

          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="rounded-md px-2 py-1 text-lg hover:bg-gray-200 transition"
          >
            {isMinimized ? "▢" : "—"}
          </button>
        </div>

        {/* Body */}
        {!isMinimized && (
          <>
            {page === 'shabad' &&
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
            }

            {
              page === 'search' &&
              <div className="flex-1 overflow-y-auto space-y-2">
                <div className='m-2'>
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="gurmukhi bg-white w-full px-3 py-2 border border-gray-300 text-sm focus:outline-none focus:ring-1 focus:ring-gray-200 focus:border-gray-500"
                    placeholder="Koj..."
                    style={{
                      fontSize: '18px'
                    }}
                  />
                </div>
                <div>
                  {searchPanktis.map((searchPankti: SearchPankti, index) => (
                    <div
                      key={searchPankti.id}
                      ref={(el) => { searchResultRefs.current[index] = el; }}
                      className={`gurmukhi border-b border-gray-200 cursor-default font-normal px-2 py-2 ${
                        index === 0 ? 'border-t' : ''
                      } ${
                        index === selectedSearchIndex ? 'bg-gray-200' : ''
                      }`}
                      onClick={() => syncSearchPankti(searchPankti.id)}
                      onMouseEnter={() => setSelectedSearchIndex(index)}
                    >
                      {clearGurmukhi(searchPankti.gurmukhi)}
                    </div>
                  ))}
                </div>
              </div>
            }

            {
              page === 'settings' &&
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
            }

            {/* Tabs */}
            <div className="flex items-center border-t border-gray-300 flex-none">
              <button
                className={`flex flex-col items-center text-xs text-gray-600 px-4 py-2 hover:text-black ${page === 'search' ? ' bg-gray-300 text-gray-800' : ''}`}
                onClick={() => syncPage('search')}
              >
                <Search className="h-5 w-5" />
              </button>

              <button
                className={`flex flex-col items-center text-xs text-gray-600 px-4 py-2 hover:text-black ${page === 'shabad' ? ' bg-gray-300 text-gray-800' : ''}`}
                onClick={() => syncPage('shabad')}
              >
                <BookOpen className="h-5 w-5" />
              </button>

              <button
                className={`flex flex-col items-center text-xs text-gray-600 px-4 py-2 hover:text-black ${
                  page === 'settings' ? ' bg-gray-300 text-gray-800' : ''
                }`}
                onClick={() => syncPage('settings')}
              >
                <Settings className="h-5 w-5" />
              </button>
            </div>

          </>
        )}
      </div>
    </AppLayout>
  );
}