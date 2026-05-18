import { usePage } from "@inertiajs/react";
import axios from "axios";
import { CheckSquare2, Eye, EyeOff, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import "../../../css/font.css";
import "../../../css/sync.css";

interface Pankti {
    id: string;
    gurmukhi: string;
    punjabi_translation: string;
    english_translation: string;
}

interface DisplaySettings {
    xPadding: number;
    yPadding: number;
    gurmukhiFontSize: number;
    punjabiFontSize: number;
    englishFontSize: number;
    showPunjabi: boolean;
    showEnglish: boolean;
    gapAfterGurmukhi: number;
    gapAfterPunjabi: number;
    backgroundColor: string;
    backgroundOpacity: number;
    gurmukhiFontClass: string;
    gurmukhiColor: string;
    punjabiColor: string;
    englishColor: string;
    theme: string;
    shabadView: boolean;
}

const GURMUKHI_FONT_OPTIONS: { label: string; className: string }[] = [
    { label: "Gurbani Web Thick", className: "gurmukhi-gurbani-web-thick" },
    { label: "Open Gurbani Akhar Black", className: "gurmukhi-open-gurbani-akhar-black" },
    { label: "Open Gurbani Akhar Bold", className: "gurmukhi-open-gurbani-akhar-bold" },
    { label: "Open Gurbani Akhar Regular", className: "gurmukhi-open-gurbani-akhar-regular" },
    { label: "Riyasti Naveen", className: "gurmukhi-riyasti-naveen" },
    { label: "Raaj 1", className: "gurmukhi-raaj1" },
    { label: "Raaj 2", className: "gurmukhi-raaj2" },
    { label: "Raaj 3", className: "gurmukhi-raaj3" },
    { label: "Raaj 4", className: "gurmukhi-raaj4" },
    { label: "Raaj 5", className: "gurmukhi-raaj5" },
    { label: "Raaj 6", className: "gurmukhi-raaj6" },
    { label: "prabhki", className: "gurmukhi-prabhki" },
];

const BACKGROUND_COLOR_OPTIONS = [
    { label: "Black", value: "#000000" },
    { label: "White", value: "#ffffff" },
    { label: "Navy", value: "#0f172a" },
    { label: "Dark Blue", value: "#1e3a5f" },
    { label: "Deep Purple", value: "#1e0a3c" },
    { label: "Forest Green", value: "#14532d" },
    { label: "Maroon", value: "#4a0000" },
];

const hexToRgba = (hex: string, opacity: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`;
};

interface ColorRowProps {
    label: string;
    value: string;
    onChange: (val: string) => void;
}

function ColorRow({ label, value, onChange }: ColorRowProps) {
    return (
        <div className="flex items-center justify-between gap-2">
            <span className="text-sm">{label}</span>
            <input
                type="color"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-7 w-10 cursor-pointer rounded border p-0.5"
                title={`${label} color`}
            />
        </div>
    );
}

const baniThemes: any = {
  parchment: {
    wrapper: "bg-[#F5E9D8] text-center min-h-screen flex flex-col items-center justify-center",
    gurmukhi: "text-[#7A1E1E]",
    punjabi: "text-[#2F2F2F]",
    english: "text-[#5C4632]",
  },

  darkDivine: {
    wrapper: "bg-gradient-to-b from-[#0B1A2B] to-[#142C46] text-center min-h-screen flex flex-col items-center justify-center",
    gurmukhi: "text-[#F4AF37]",
    punjabi: "text-[#EAEAEA]",
    english: "text-[#EAEAEA]",
  },

  softPastel: {
    wrapper: "bg-gradient-to-b from-[#F8EAEA] to-[#F2DCDC] text-center min-h-screen flex flex-col items-center justify-center",
    gurmukhi: "text-[#8B1E1E]",
    punjabi: "text-[#374151]",
    english: "text-[#6B7280]",
  },

  minimalClean: {
    wrapper: "bg-[#FFFFFF] text-center min-h-screen flex flex-col items-center justify-center",
    gurmukhi: "text-[#7F1D1D] font-semibold",
    punjabi: "text-[#111827]",
    english: "text-[#6B7280]",
  },
};

const baniThemeOptions = [
  { label: "Parchment", value: "parchment" },
  { label: "Dark Divine", value: "darkDivine" },
  { label: "Soft Pastel", value: "softPastel" },
  { label: "Minimal Clean", value: "minimalClean" },
];

const renderGurmukhi = (text: string) => {
    return text.split(/(\s+)/).map((part, index) => {
        const match = part.match(/^(.+?)([;,.])$/);

        if (!match) {
            return <span key={index}>{part}</span>;
        }

        const [, word, marker] = match;

        const colorClass =
            marker === ";"
                ? "text-amber-500"
                : "text-sky-500";

        return (
            <span key={index} className={colorClass}>
                {word}
            </span>
        );
    });
};

function AutoFitText({
    text,
    className,
    baseFontSize,
    minFontSize,
}: {
    text: string;
    className: string;
    baseFontSize: number;
    minFontSize: number;
}) {
    const ref = useRef<HTMLDivElement | null>(null);
    const [fontSize, setFontSize] = useState(baseFontSize);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        let nextFontSize = baseFontSize;
        el.style.fontSize = `${nextFontSize}px`;

        requestAnimationFrame(() => {
            const fits = () => {
                const lineHeight = nextFontSize * 1.35;
                return el.scrollHeight <= lineHeight * 2 + 2;
            };

            while (nextFontSize > minFontSize && !fits()) {
                nextFontSize -= 1;
                el.style.fontSize = `${nextFontSize}px`;
            }

            setFontSize(nextFontSize);
        });
    }, [text, baseFontSize, minFontSize]);

    useEffect(() => {
        const HARD_REFRESH_INTERVAL = 10 * 60 * 1000; // 10 minutes

        const safeHardRefresh = async () => {
            try {
                // verify backend is alive first
                const response = await axios.get("/api/health", {
                    timeout: 5000,
                });

                if (response.status === 200) {
                    console.log("Site healthy. Performing hard refresh...");

                    // cache-busting hard refresh
                    const url = new URL(window.location.href);
                    url.searchParams.set("_refresh", Date.now().toString());

                    window.location.href = url.toString();
                }
            } catch (error) {
                console.error(
                    "Health check failed. Skipping hard refresh.",
                    error
                );
            }
        };

        // start interval
        const interval = setInterval(
            safeHardRefresh,
            HARD_REFRESH_INTERVAL
        );

        return () => clearInterval(interval);
    }, []);

    return (
        <div
            ref={ref}
            className={`
                ${className}
                overflow-hidden
                text-ellipsis
                [display:-webkit-box]
                [-webkit-line-clamp:2]
                [-webkit-box-orient:vertical]
            `}
            style={{
                fontSize: `${fontSize}px`,
                lineHeight: 1.35,
            }}
        >
            {text}
        </div>
    );
};

function GurmukhiText({
    text,
    className,
    baseFontSize,
}: {
    text: string;
    className: string;
    baseFontSize: number;
}) {
    const visibleRef = useRef<HTMLDivElement | null>(null);
    const measureRef = useRef<HTMLDivElement | null>(null);

    const [fontSize, setFontSize] = useState(Math.max(baseFontSize, 60));
    const [useVishraamSplit, setUseVishraamSplit] = useState(false);

    const minFontSize = 70;
    const lineHeightRatio = 1.4;
    const maxLines = 2;

    const splitOnVishraam = (value: string) => {
        const index = value.indexOf(";");

        if (index === -1) return null;

        return [
            value.slice(0, index + 1).trim(),
            value.slice(index + 1).trim(),
        ];
    };

    useEffect(() => {
        const measureEl = measureRef.current;
        const visibleEl = visibleRef.current;

        if (!measureEl || !visibleEl) return;

        const hasVishraam = text.includes(";");
        const maxFontSize = Math.max(baseFontSize, minFontSize);

        let nextFontSize = maxFontSize;

        const fitsInTwoLines = () => {
            measureEl.style.fontSize = `${nextFontSize}px`;
            measureEl.style.lineHeight = `${nextFontSize * lineHeightRatio}px`;

            const maxHeight = nextFontSize * lineHeightRatio * maxLines;

            return measureEl.scrollHeight <= maxHeight + 2;
        };

        while (nextFontSize > minFontSize && !fitsInTwoLines()) {
            nextFontSize -= 1;
        }

        setFontSize(Math.max(nextFontSize, minFontSize));
        setUseVishraamSplit(hasVishraam);
    }, [text, baseFontSize]);

    const parts = useVishraamSplit ? splitOnVishraam(text) : null;

    const content = parts ? (
        <>
            <div>{renderGurmukhi(parts[0])}</div>
            <div>{renderGurmukhi(parts[1])}</div>
        </>
    ) : (
        renderGurmukhi(text)
    );

    return (
        <>
            {/* Hidden measuring div */}
            <div
                ref={measureRef}
                className={className}
                aria-hidden="true"
                style={{
                    position: "absolute",
                    visibility: "hidden",
                    pointerEvents: "none",
                    zIndex: -1,
                    width: "95vw",
                    maxWidth: "95vw",
                    fontSize: `${Math.max(baseFontSize, minFontSize)}px`,
                    lineHeight: `${Math.max(baseFontSize, minFontSize) * lineHeightRatio}px`,
                    letterSpacing: "-1px",
                    wordBreak: "break-word",
                    overflowWrap: "anywhere",
                    whiteSpace: "normal",
                }}
            >
                {content}
            </div>

            {/* Actual visible text */}
            <div
                ref={visibleRef}
                className={className}
                style={{
                    fontSize: `${fontSize}px`,
                    lineHeight: lineHeightRatio,
                    letterSpacing: "-1px",
                    maxWidth: "95vw",
                    wordBreak: "break-word",
                    overflowWrap: "anywhere",
                    overflow: "hidden",
                }}
            >
                {content}
            </div>
        </>
    );
}

export default function Sync() {
    const wsRef = useRef<WebSocket | null>(null);
    const wsConnecting = useRef<boolean>(false);
    const { wssServer, streamKeyName, showSettings }: any = usePage().props;

    const [panktis, setPanktis] = useState<Pankti[]>([]);
    const [shabadState, setShabadState] = useState<{
        panktis: Pankti[];
        current: number | null;
        shabadId: string | null;
        banidId: string | null;
    }>({
        banidId: null,
        shabadId: null,
        panktis: [],
        current: null,
    });

    const [settings, setSettings] = useState<DisplaySettings>({
        xPadding: 4,
        yPadding: 4,
        gurmukhiFontSize: 30,
        punjabiFontSize: 24,
        englishFontSize: 22,
        showPunjabi: true,
        showEnglish: true,
        gapAfterGurmukhi: 16,
        gapAfterPunjabi: 16,
        backgroundColor: "#ffffff",
        backgroundOpacity: 0,
        gurmukhiFontClass: "gurmukhi-gurbani-web-thick",
        gurmukhiColor: "#000000",
        punjabiColor: "#000000",
        englishColor: "#000000",
        theme: "parchment",
        shabadView: false,
    });

    useEffect(() => {
        if (wsRef.current || wsConnecting.current) return;

        wsConnecting.current = true;
        const socket = new WebSocket(
            `${wssServer}?stream-key-name=${encodeURIComponent(streamKeyName)}`
        );

        socket.onopen = () => {
            wsRef.current = socket;
            console.log("Connected to public stream");
        };

        socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                switch (data.type) {
                    case "ready":
                        socket.send(JSON.stringify({ type: "get-settings" }));
                        break;

                    case "pankti":
                        setShabadState({
                            panktis: [],
                            current: data?.c,
                            shabadId: data?.s,
                            banidId: data?.b,
                        });
                        break;
                    case "settings":
                        if (data.settings) setSettings(data.settings);
                        break;
                    case "pong":
                        console.log("Pong received");
                        break;
                }
            } catch (error) {
                console.error("Failed to parse WebSocket message:", error);
            }
        };

        socket.onerror = (error) => console.error("WebSocket error:", error);

        socket.onclose = (event) => {
            console.log(`Disconnected (code: ${event.code}, reason: ${event.reason})`);
            wsRef.current = null;
            wsConnecting.current = false;
        };

        wsConnecting.current = false;

        return () => {
            socket.close();
            wsRef.current = null;
            wsConnecting.current = false;
        };
    }, [wssServer, streamKeyName]);

    useEffect(() => {
        if (!shabadState.shabadId || shabadState.banidId) return;
        axios.get(`/api/gurbani/shabad/${shabadState.shabadId}`).then((res) => {
            setPanktis(res.data.panktis);
        });
    }, [shabadState.shabadId, shabadState.banidId]);

    useEffect(() => {
        if (!shabadState.banidId) return;

        axios.get(`/api/gurbani/bani/${shabadState.banidId}`).then((res) => {
            setPanktis(res.data.panktis);
        });
    }, [shabadState.shabadId, shabadState.banidId]);

    const currentIndex = shabadState.current;
    const activePankti = currentIndex !== null ? panktis[currentIndex] : undefined;

    const currentPankti = {
        gurmukhi:
            activePankti?.gurmukhi ?? '',
        punjabi: activePankti?.punjabi_translation ?? "",
        english: activePankti?.english_translation ?? "",
    };

    let showPanktis:any = [currentPankti];
    if (settings.shabadView) {
        showPanktis = panktis.map(pankti => {
            return {
                gurmukhi: pankti.gurmukhi,
                punjabi: pankti.punjabi_translation,
                english: pankti.english_translation,
            };
        });
    }

    const updateSetting = <K extends keyof DisplaySettings>(
        key: K,
        value: DisplaySettings[K]
    ) => {
        setSettings((prev) => {
            const next = { ...prev, [key]: value };

            console.log('saving: ', wsRef.current);
            if (showSettings && wsRef.current?.readyState === WebSocket.OPEN) {
                console.log('saving settings');
                wsRef.current.send(
                    JSON.stringify({ type: "settings", settings: next })
                );
            }

            return next;
        });
    };

    const baniTheme = baniThemes[settings.theme ?? 'parchment'];

    return (
        <div className="relative flex w-full max-w-full overflow-x-hidden overflow-y-hidden h-screen" style={{background: 'none'}}>
            {/* Settings Panel — only rendered when showSettings prop is true */}
            {showSettings && (
                <div className="fixed top-0 left-0 z-10 bg-white h-screen rounded-2xl border p-4 shadow-sm overflow-y-auto space-y-5 w-64">
                    <h3 className="text-lg font-semibold">Display Settings</h3>

                    <div className="flex">
                        <span className="text-sm font-medium flex-1">Shabad View</span>
                        <div className="mr-2" onClick={() => updateSetting('shabadView', !settings.shabadView)}>
                            {
                                !settings.shabadView &&
                                <Square />
                            }
                            {
                                settings.shabadView &&
                                <CheckSquare2 />
                            }
                        </div>
                    </div>

                    <div>
                        <span className="text-sm font-medium">Theme</span>
                        <select
                            value={settings.theme}
                            onChange={(e) => updateSetting("theme", e.target.value)}
                            className="w-full rounded border px-2 py-1 text-sm"
                        >
                            {baniThemeOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Gurmukhi Font Type */}
                    <div className="space-y-1.5">
                        <span className="text-sm font-medium">Gurmukhi Font</span>
                        <select
                            value={settings.gurmukhiFontClass}
                            onChange={(e) => updateSetting("gurmukhiFontClass", e.target.value)}
                            className="w-full rounded border px-2 py-1 text-sm"
                        >
                            {GURMUKHI_FONT_OPTIONS.map((opt) => (
                                <option key={opt.className} value={opt.className}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Font Sizes + Colors */}
                    <div className="space-y-4">
                        {/* Gurmukhi */}
                        <div className="space-y-1.5">
                            <ColorRow
                                label={`Gurmukhi (${settings.gurmukhiFontSize}px)`}
                                value={settings.gurmukhiColor}
                                onChange={(val) => updateSetting("gurmukhiColor", val)}
                            />
                            <input
                                type="range"
                                min="10"
                                max="150"
                                value={settings.gurmukhiFontSize}
                                onChange={(e) => updateSetting("gurmukhiFontSize", Number(e.target.value))}
                                className="w-full"
                            />
                        </div>

                        {/* Punjabi */}
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                                <button
                                    type="button"
                                    onClick={() => updateSetting("showPunjabi", !settings.showPunjabi)}
                                    className="flex items-center gap-1.5 text-sm"
                                >
                                    {settings.showPunjabi
                                        ? <Eye className="h-4 w-4" />
                                        : <EyeOff className="h-4 w-4" />}
                                    <span>Punjabi ({settings.punjabiFontSize}px)</span>
                                </button>
                                <input
                                    type="color"
                                    value={settings.punjabiColor}
                                    onChange={(e) => updateSetting("punjabiColor", e.target.value)}
                                    className="h-7 w-10 cursor-pointer rounded border p-0.5"
                                    title="Punjabi color"
                                />
                            </div>
                            <input
                                type="range"
                                min="1"
                                max="100"
                                value={settings.punjabiFontSize}
                                onChange={(e) => updateSetting("punjabiFontSize", Number(e.target.value))}
                                className="w-full"
                            />
                        </div>

                        {/* English */}
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                                <button
                                    type="button"
                                    onClick={() => updateSetting("showEnglish", !settings.showEnglish)}
                                    className="flex items-center gap-1.5 text-sm"
                                >
                                    {settings.showEnglish
                                        ? <Eye className="h-4 w-4" />
                                        : <EyeOff className="h-4 w-4" />}
                                    <span>English ({settings.englishFontSize}px)</span>
                                </button>
                                <input
                                    type="color"
                                    value={settings.englishColor}
                                    onChange={(e) => updateSetting("englishColor", e.target.value)}
                                    className="h-7 w-10 cursor-pointer rounded border p-0.5"
                                    title="English color"
                                />
                            </div>
                            <input
                                type="range"
                                min="1"
                                max="100"
                                value={settings.englishFontSize}
                                onChange={(e) => updateSetting("englishFontSize", Number(e.target.value))}
                                className="w-full"
                            />
                        </div>
                    </div>

                    {/* Gap Settings */}
                    <div className="space-y-3">
                        <label className="flex flex-col gap-1">
                            <span className="text-sm font-medium">Gap after Gurmukhi ({settings.gapAfterGurmukhi}px)</span>
                            <input
                                type="range"
                                min="-20"
                                max="100"
                                value={settings.gapAfterGurmukhi}
                                onChange={(e) => updateSetting("gapAfterGurmukhi", Number(e.target.value))}
                                className="w-full"
                            />
                        </label>

                        <label className="flex flex-col gap-1">
                            <span className="text-sm font-medium">Gap after Punjabi ({settings.gapAfterPunjabi}px)</span>
                            <input
                                type="range"
                                min="-20"
                                max="100"
                                value={settings.gapAfterPunjabi}
                                onChange={(e) => updateSetting("gapAfterPunjabi", Number(e.target.value))}
                                className="w-full"
                            />
                        </label>
                    </div>

                    {/* Padding Settings */}
                    <div className="space-y-3">
                        <label className="flex flex-col gap-1">
                            <span className="text-sm font-medium">Padding Horizontal ({settings.xPadding}px)</span>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={settings.xPadding}
                                onChange={(e) => updateSetting("xPadding", Number(e.target.value))}
                                className="w-full"
                            />
                        </label>

                        <label className="flex flex-col gap-1">
                            <span className="text-sm font-medium">Padding Vertical ({settings.yPadding}px)</span>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={settings.yPadding}
                                onChange={(e) => updateSetting("yPadding", Number(e.target.value))}
                                className="w-full"
                            />
                        </label>
                    </div>

                    {/* Background Color */}
                    <div className="space-y-2">
                        <span className="text-sm font-medium">Background Color</span>
                        <div className="flex flex-wrap gap-2">
                            {BACKGROUND_COLOR_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    title={opt.label}
                                    onClick={() => updateSetting("backgroundColor", opt.value)}
                                    className="h-6 w-6 rounded-full border-2"
                                    style={{
                                        backgroundColor: opt.value,
                                        borderColor: settings.backgroundColor === opt.value ? "#3b82f6" : "#d1d5db",
                                    }}
                                />
                            ))}
                            <div style={{ position: "relative", zIndex: 9999 }}>
                            <input
                                type="color"
                                value={settings.backgroundColor}
                                onChange={(e) => updateSetting("backgroundColor", e.target.value)}
                                className="h-6 w-6 cursor-pointer rounded border"
                                title="Custom color"
                            />
                            </div>
                        </div>
                    </div>

                    {/* Background Opacity */}
                    <label className="flex flex-col gap-1">
                        <span className="text-sm font-medium">Background Opacity ({settings.backgroundOpacity}%)</span>
                        <input
                            type="range"
                            min="0"
                            max="100"
                            value={settings.backgroundOpacity}
                            onChange={(e) => updateSetting("backgroundOpacity", Number(e.target.value))}
                            className="w-full"
                        />
                    </label>
                </div>
            )}

            <div
                className={`
                    flex flex-col items-center
                    justify-start
                    flex-1 min-w-0 max-w-full h-full overflow-hidden
                    box-border
                    ${baniTheme.wrapper}
                `}
                style={{
                    paddingLeft: `${settings.xPadding}px`,
                    paddingRight: `${settings.xPadding}px`,
                    paddingTop: `${settings.yPadding}px`,
                    paddingBottom: `${settings.yPadding}px`,
                }}
            >
                {showPanktis.map((showPankti: any) => (
                <div className="flex flex-col">

                <div style={{ marginBottom: `${settings.gapAfterGurmukhi}px` }}>
                    <GurmukhiText
                        text={showPankti.gurmukhi}
                        baseFontSize={settings.gurmukhiFontSize}
                        className={`
                            ${settings.gurmukhiFontClass}
                            ${baniTheme.gurmukhi}
                            text-center
                            w-full
                            max-w-full
                            min-w-0
                            whitespace-normal
                            break-words
                            [overflow-wrap:anywhere]
                            overflow-hidden
                            mt-5
                        `}
                    />
                </div>    

                {/* Punjabi — single line with ellipsis */}
                {settings.showPunjabi && (
                    <div style={{ marginBottom: `${settings.gapAfterPunjabi}px` }}>
                        <AutoFitText
                            text={showPankti.punjabi}
                            baseFontSize={settings.punjabiFontSize}
                            minFontSize={Math.max(settings.punjabiFontSize * 0.75, 16)}
                            className={`
                                gurmukhi-open-gurbani-akhar-black
                                ${baniTheme.punjabi}
                                w-full
                                max-w-full
                                min-w-0
                                text-center
                                whitespace-normal
                                break-words
                                [overflow-wrap:anywhere]
                            `}
                        />
                    </div>
                )}

                {/* English — single line with ellipsis */}
                {settings.showEnglish && (
                    <AutoFitText
                        text={showPankti.english}
                        baseFontSize={settings.englishFontSize}
                        minFontSize={Math.max(settings.englishFontSize * 0.75, 14)}
                        className={`
                            ${baniTheme.english}
                            w-full
                            max-w-full
                            min-w-0
                            text-center
                            whitespace-normal
                            break-words
                            [overflow-wrap:anywhere]
                        `}
                    />
                )}
                </div>
                 
                ))}
            </div>
        </div>
    );
}