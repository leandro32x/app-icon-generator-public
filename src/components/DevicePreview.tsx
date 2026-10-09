import { useEffect, useRef, useState } from 'react';
import type { IconSource } from '../utils/iconManager';
import { IconTile, type IconTileConfig, type MaskShape } from './IconTile';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { Slider } from './ui/slider';
import { Button } from './ui/button';
import { Circle, Square, Squircle, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface DevicePreviewProps {
  platform: 'android' | 'ios';
  iconUrl: string | null;
  config: IconTileConfig;
  iconSource: IconSource;
  iconStyle: string;
  appName?: string;
}

/**
 * Android adaptive-icon foreground is a 108×108 dp canvas but only the inner
 * 72×72 dp is visible after any OEM mask. The outer 18 dp on each side is
 * reserved for masking and parallax effects. Ratio 108/72 = 1.5.
 * Source: developer.android.com/develop/ui/views/launch/icon_design_adaptive
 */
const ADAPTIVE_OVERSCAN = 108 / 72;

/** Real brand icons via the iconify `logos` collection (full-color SVGs). */
const logo = (slug: string) => `https://api.iconify.design/logos/${slug}.svg`;
/** Single-color brand glyph with white override, rendered on a brand bg. */
const glyph = (slug: string, color = 'white') =>
  `https://api.iconify.design/simple-icons/${slug}.svg?color=${encodeURIComponent(color)}`;

interface AppMock {
  label: string;
  src: string;
  bg: string;
}

// Google's adaptive launcher icons are the product logo on a white layer, so
// every mask (circle, rounded square, square) crops a white tile, never the logo.
const ANDROID_APPS: AppMock[] = [
  { label: 'Chrome', src: logo('chrome'), bg: '#FFFFFF' },
  { label: 'Gmail', src: logo('google-gmail'), bg: '#FFFFFF' },
  { label: 'Calendar', src: logo('google-calendar'), bg: '#FFFFFF' },
  { label: 'Play', src: logo('google-play-icon'), bg: '#FFFFFF' },
];

const IOS_APPS: AppMock[] = [
  { label: 'Discord', src: glyph('discord'), bg: '#5865F2' },
  { label: 'WhatsApp', src: glyph('whatsapp'), bg: '#25D366' },
  { label: 'Spotify', src: glyph('spotify'), bg: '#1DB954' },
  { label: 'Messenger', src: glyph('messenger'), bg: 'linear-gradient(135deg, #00B2FF 0%, #006AFF 40%, #8F00FF 80%, #FF006A 100%)' },
  { label: 'YouTube', src: logo('youtube-icon'), bg: '#FFFFFF' },
  { label: 'Netflix', src: logo('netflix-icon'), bg: '#000000' },
  { label: 'TikTok', src: logo('tiktok-icon'), bg: '#000000' },
  { label: 'Figma', src: logo('figma'), bg: '#FFFFFF' },
  { label: 'Slack', src: logo('slack-icon'), bg: '#FFFFFF' },
];

function AppTile({ size, app, shape }: { size: number; app: AppMock; shape: MaskShape }) {
  const radius =
    shape === 'circle' ? 50 : shape === 'squircle' ? 23 : shape === 'rounded-square' ? 18 : 0;
  const innerPad = Math.round(size * 0.18);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: `${radius}%`,
        background: app.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
        padding: innerPad,
      }}
    >
      <img
        src={app.src}
        alt=""
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          objectFit: 'contain',
        }}
        draggable={false}
      />
    </div>
  );
}

function AppLabel({
  children,
  maxWidth = 60,
  dark = false,
}: {
  children: React.ReactNode;
  maxWidth?: number;
  dark?: boolean;
}) {
  return (
    <span
      style={{
        color: dark ? '#1f1147' : '#FFFFFF',
        fontSize: 10,
        fontWeight: dark ? 600 : 500,
        textShadow: dark
          ? '0 1px 2px rgba(255,255,255,0.55)'
          : '0 1px 2px rgba(0,0,0,0.55)',
        maxWidth,
        textAlign: 'center',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        marginTop: 6,
      }}
    >
      {children}
    </span>
  );
}

function useLiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: false });
}

function AndroidStatusBar() {
  const time = useLiveClock();
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '14px 28px 0',
        color: '#1f1147',
        fontSize: 13,
        fontWeight: 600,
        lineHeight: 1,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', height: 13 }}>{time}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 13 }}>
        <svg width="13" height="11" viewBox="0 0 14 12" fill="currentColor" aria-hidden="true">
          <path d="M7 1 L13 11 L1 11 Z" />
        </svg>
        <svg width="13" height="11" viewBox="0 0 14 12" fill="currentColor" aria-hidden="true">
          <rect x="0" y="7" width="2" height="4" />
          <rect x="4" y="5" width="2" height="6" />
          <rect x="8" y="2" width="2" height="9" />
        </svg>
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>100%</span>
      </div>
    </div>
  );
}

function IOSStatusBar() {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '18px 36px 0',
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: 600,
      }}
    >
      <span>9:41</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor" aria-hidden="true">
          <rect x="0" y="7" width="3" height="4" rx="0.5" />
          <rect x="4" y="5" width="3" height="6" rx="0.5" />
          <rect x="8" y="3" width="3" height="8" rx="0.5" />
          <rect x="12" y="0" width="3" height="11" rx="0.5" />
        </svg>
        <svg width="16" height="11" viewBox="0 0 16 11" fill="currentColor" aria-hidden="true">
          <path d="M8 2.5c2.2 0 4.3.8 5.9 2.3l1.1-1.1A10.4 10.4 0 0 0 8 1 10.4 10.4 0 0 0 1 3.7l1.1 1.1A8.4 8.4 0 0 1 8 2.5zm0 3.3c1.4 0 2.7.5 3.7 1.5l1.1-1.1A7.1 7.1 0 0 0 8 4.5a7.1 7.1 0 0 0-4.8 1.7l1.1 1.1A5.3 5.3 0 0 1 8 5.8zm0 3.3c.7 0 1.3.2 1.8.7l-1.8 1.8-1.8-1.8c.5-.5 1.1-.7 1.8-.7z" />
        </svg>
        <svg width="26" height="11" viewBox="0 0 26 11" aria-hidden="true">
          <rect x="0.5" y="0.5" width="22" height="10" rx="2.5" fill="none" stroke="currentColor" strokeOpacity="0.5" />
          <rect x="23" y="3.5" width="1.5" height="4" rx="0.5" fill="currentColor" fillOpacity="0.5" />
          <rect x="2" y="2" width="18" height="7" rx="1" fill="currentColor" />
        </svg>
      </div>
    </div>
  );
}

function AndroidPreview({
  iconUrl,
  config,
  iconSource,
  iconStyle,
  appName,
}: Omit<DevicePreviewProps, 'platform'>) {
  const [mask, setMask] = useState<MaskShape>('circle');
  const iconSize = 54;
  const frameW = 360;
  const frameH = 740;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Mask selector */}
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Launcher Mask</span>
        <ToggleGroup
          type="single"
          value={mask}
          onValueChange={(v) => v && setMask(v as MaskShape)}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="circle" aria-label="Circle mask">
            <Circle className="w-4 h-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="rounded-square" aria-label="Rounded square mask">
            <Squircle className="w-4 h-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="square" aria-label="Square mask">
            <Square className="w-4 h-4" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Phone frame */}
      <ZoomPanViewport frameW={frameW} frameH={frameH}>
      <div
        style={{
          width: frameW,
          height: frameH,
          borderRadius: 46,
          background: 'linear-gradient(180deg, #1d1d1f 0%, #0c0c0d 100%)',
          padding: 7,
          boxShadow:
            '0 30px 60px -25px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06) inset, 0 0 0 3px rgba(0,0,0,0.7)',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 40,
            overflow: 'hidden',
            position: 'relative',
            background:
              'radial-gradient(ellipse at 25% 15%, #A5B4FC 0%, #C4B5FD 30%, #DDD6FE 55%, #F5D0FE 80%, #FBCFE8 100%)',
          }}
        >
          {/* Camera cutout (Pixel-style center hole punch) */}
          <div
            style={{
              position: 'absolute',
              top: 15,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 11,
              height: 11,
              borderRadius: '50%',
              background: '#000',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.05)',
              zIndex: 5,
            }}
          />

          <AndroidStatusBar />

          {/* At-a-glance / calendar widget */}
          <div style={{ padding: '30px 24px 0', color: '#1f1147' }}>
            <div style={{ fontSize: 19, fontWeight: 500, letterSpacing: -0.2 }}>Lunch with Jane</div>
            <div
              style={{
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginTop: 4,
                opacity: 0.95,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
              <span>4:00 PM – 4:30 PM</span>
            </div>
          </div>

          {/* App row (generated icon in the first slot) */}
          <div
            style={{
              position: 'absolute',
              top: 170,
              left: 0,
              right: 0,
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 4,
              padding: '0 18px',
            }}
          >
            {[
              { custom: true as const },
              { app: ANDROID_APPS[0] },
              { app: ANDROID_APPS[1] },
              { app: ANDROID_APPS[2] },
              { app: ANDROID_APPS[3] },
            ].map((slot, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                {'custom' in slot ? (
                  <IconTile
                    size={iconSize}
                    config={config}
                    iconUrl={iconUrl}
                    iconSource={iconSource}
                    iconStyle={iconStyle}
                    maskShape={mask}
                    overscan={ADAPTIVE_OVERSCAN}
                  />
                ) : (
                  <AppTile size={iconSize} app={slot.app} shape={mask} />
                )}
                <AppLabel dark>{'custom' in slot ? appName || 'App Name' : slot.app.label}</AppLabel>
              </div>
            ))}
          </div>

          {/* Google search pill */}
          <div
            style={{
              position: 'absolute',
              bottom: 28,
              left: 18,
              right: 18,
              height: 46,
              borderRadius: 23,
              background: 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              display: 'flex',
              alignItems: 'center',
              padding: '0 16px',
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                background:
                  'conic-gradient(from 0deg, #EA4335 0 25%, #FBBC05 25% 50%, #34A853 50% 75%, #4285F4 75% 100%)',
                position: 'relative',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  inset: 7,
                  borderRadius: '50%',
                  background: 'rgba(0,0,0,0.55)',
                }}
              />
            </div>
          </div>
        </div>
      </div>
      </ZoomPanViewport>
    </div>
  );
}

function IOSPreview({
  iconUrl,
  config,
  iconSource,
  iconStyle,
  appName,
}: Omit<DevicePreviewProps, 'platform'>) {
  const iconSize = 70;
  const frameW = 360;
  const frameH = 740;

  const gridApps: Array<{ custom?: boolean; app?: AppMock; label: string }> = [
    { custom: true, label: appName || 'App Name' },
    { app: IOS_APPS[0], label: IOS_APPS[0].label },
    { app: IOS_APPS[1], label: IOS_APPS[1].label },
    { app: IOS_APPS[2], label: IOS_APPS[2].label },
    { app: IOS_APPS[3], label: IOS_APPS[3].label },
    { app: IOS_APPS[4], label: IOS_APPS[4].label },
    { app: IOS_APPS[5], label: IOS_APPS[5].label },
    { app: IOS_APPS[6], label: IOS_APPS[6].label },
  ];

  return (
    <div className="flex flex-col items-center gap-5">
      <ZoomPanViewport frameW={frameW} frameH={frameH}>
      <div
        style={{
          width: frameW,
          height: frameH,
          borderRadius: 50,
          background: 'linear-gradient(180deg, #1d1d1f 0%, #0c0c0d 100%)',
          padding: 7,
          boxShadow:
            '0 30px 60px -25px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06) inset, 0 0 0 3px rgba(0,0,0,0.7)',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 44,
            overflow: 'hidden',
            position: 'relative',
            background:
              'linear-gradient(180deg, #1a2a5e 0%, #2d4e8a 35%, #5c8cc9 65%, #a8c3e8 100%)',
          }}
        >
          {/* Dynamic island */}
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              width: 104,
              height: 30,
              borderRadius: 15,
              background: '#000',
              zIndex: 5,
            }}
          />

          <IOSStatusBar />

          {/* App grid */}
          <div
            style={{
              position: 'absolute',
              top: 72,
              left: 0,
              right: 0,
              padding: '16px 20px',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '18px 10px',
            }}
          >
            {gridApps.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                {item.custom ? (
                  <IconTile
                    size={iconSize}
                    config={config}
                    iconUrl={iconUrl}
                    iconSource={iconSource}
                    iconStyle={iconStyle}
                    maskShape="squircle"
                  />
                ) : (
                  <AppTile size={iconSize} app={item.app!} shape="squircle" />
                )}
                <AppLabel>{item.label}</AppLabel>
              </div>
            ))}
          </div>

          {/* Dock */}
          <div
            style={{
              position: 'absolute',
              bottom: 28,
              left: 14,
              right: 14,
              padding: '12px 14px',
              borderRadius: 32,
              background: 'rgba(255,255,255,0.22)',
              backdropFilter: 'blur(22px)',
              WebkitBackdropFilter: 'blur(22px)',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 10,
              justifyItems: 'center',
            }}
          >
            {[IOS_APPS[7], IOS_APPS[8], IOS_APPS[0], IOS_APPS[1]].map((app, idx) => (
              <AppTile key={idx} size={60} app={app} shape="squircle" />
            ))}
          </div>
        </div>
      </div>
      </ZoomPanViewport>
    </div>
  );
}

export function DevicePreview(props: DevicePreviewProps) {
  return props.platform === 'android' ? <AndroidPreview {...props} /> : <IOSPreview {...props} />;
}

/**
 * Pannable, zoomable viewport used by both Android and iOS previews.
 * Keeps the phone frame visually centered while allowing the user to:
 *  - zoom in/out via a slider or +/−/reset buttons
 *  - drag to pan when zoomed (cursor becomes grab/grabbing)
 *  - scroll-wheel zoom over the viewport
 *
 * The pan is reset whenever zoom returns to 1× so the phone snaps back to
 * the center.
 */
function ZoomPanViewport({
  frameW,
  frameH,
  children,
}: {
  frameW: number;
  frameH: number;
  children: React.ReactNode;
}) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 3;

  // Visual scale applied on top of the user's zoom. The phone frame fully fits
  // the viewport at ~90% of its natural size, so we render the default 100%
  // zoom at this factor. Every zoom step then grows/shrinks proportionally.
  const BASE_SCALE = 0.9;

  const clampZoom = (z: number) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));

  const reset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Left button only; also skip when interacting with inputs inside the frame.
    if (e.button !== 0) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pan.x,
      origY: pan.y,
    };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const st = dragState.current;
    if (!st) return;
    setPan({
      x: st.origX + (e.clientX - st.startX),
      y: st.origY + (e.clientY - st.startY),
    });
  };

  const onPointerUp = () => {
    dragState.current = null;
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    // Only zoom when the user explicitly holds Ctrl (mirrors common pan-zoom UX).
    if (!e.ctrlKey) return;
    e.preventDefault();
    const delta = -e.deltaY * 0.002;
    setZoom((z) => clampZoom(z * (1 + delta)));
  };

  // Choose a viewport size slightly smaller than the frame at 1× so the
  // phone remains the hero element; allow overflow hidden for clean clipping.
  const viewportW = frameW + 40;
  const viewportH = frameH;
  const isPanning = dragState.current !== null;

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div
        ref={viewportRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        style={{
          width: viewportW,
          height: viewportH,
          overflow: 'hidden',
          position: 'relative',
          touchAction: 'none',
          cursor: isPanning ? 'grabbing' : zoom > 1 ? 'grab' : 'default',
          borderRadius: 24,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) scale(${zoom * BASE_SCALE})`,
            transformOrigin: 'center center',
            transition: isPanning ? 'none' : 'transform 120ms ease-out',
            willChange: 'transform',
          }}
        >
          {children}
        </div>
      </div>

      {/* Zoom controls */}
      <div className="flex items-center gap-3 w-full max-w-sm px-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => setZoom((z) => clampZoom(z - 0.1))}
          aria-label="Zoom out"
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <Slider
            value={[zoom]}
            onValueChange={([v]: number[]) => setZoom(clampZoom(v))}
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.05}
            aria-label="Zoom"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={() => setZoom((z) => clampZoom(z + 0.1))}
          aria-label="Zoom in"
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <span className="text-xs text-muted-foreground tabular-nums w-12 text-right">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={reset}
          aria-label="Reset zoom and pan"
          title="Reset"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground/80 -mt-1">Drag to pan • Ctrl + scroll to zoom</p>
    </div>
  );
}
