import { ImageResponse } from "next/og";

const ICON_SIZES = {
  large: 512,
  medium: 192,
  small: 32,
} as const;

export function generateImageMetadata() {
  return Object.entries(ICON_SIZES).map(([id, iconSize]) => ({
    alt: "2026 Tasks",
    contentType: "image/png",
    id,
    size: {
      height: iconSize,
      width: iconSize,
    },
  }));
}

export default async function Icon({ id }: { id: Promise<string | number> }) {
  const iconId = String(await id);
  const iconSize = ICON_SIZES[iconId as keyof typeof ICON_SIZES] ?? ICON_SIZES.small;
  const compact = iconSize <= ICON_SIZES.small;

  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "linear-gradient(135deg, #020617 0%, #0f766e 100%)",
          borderRadius: compact ? 0 : 108,
          color: "#f8fafc",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "center",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            background: "rgba(255,255,255,0.14)",
            border: compact ? "0" : "3px solid rgba(255,255,255,0.5)",
            borderRadius: compact ? 0 : 64,
            display: "flex",
            height: compact ? "100%" : "54%",
            justifyContent: "center",
            width: compact ? "100%" : "54%",
          }}
        >
          <span
            style={{
              fontSize: compact ? 20 : Math.round(iconSize * 0.2),
              fontWeight: 900,
              letterSpacing: 0,
              lineHeight: 1,
            }}
          >
            {compact ? "T" : "26"}
          </span>
        </div>
        {compact ? null : (
          <span
            style={{
              color: "#ccfbf1",
              fontSize: Math.round(iconSize * 0.085),
              fontWeight: 900,
              letterSpacing: 0,
              marginTop: Math.round(iconSize * 0.045),
            }}
          >
            TASKS
          </span>
        )}
      </div>
    ),
    {
      height: iconSize,
      width: iconSize,
    },
  );
}
