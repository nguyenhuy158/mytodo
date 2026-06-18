import { ImageResponse } from "next/og";

export const size = {
  height: 180,
  width: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "linear-gradient(135deg, #020617 0%, #0f766e 100%)",
          color: "#f8fafc",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            background: "rgba(255,255,255,0.14)",
            border: "2px solid rgba(255,255,255,0.55)",
            borderRadius: 38,
            display: "flex",
            height: 94,
            justifyContent: "center",
            width: 94,
          }}
        >
          <span
            style={{
              fontSize: 36,
              fontWeight: 900,
              letterSpacing: 0,
              lineHeight: 1,
            }}
          >
            26
          </span>
        </div>
        <span
          style={{
            color: "#ccfbf1",
            fontSize: 16,
            fontWeight: 900,
            letterSpacing: 0,
            marginTop: 10,
          }}
        >
          TASKS
        </span>
      </div>
    ),
    {
      ...size,
    },
  );
}
