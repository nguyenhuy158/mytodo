import { ImageResponse } from "next/og";

export const size = {
  width: 32,
  height: 32,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#020617",
          color: "#f8fafc",
          display: "flex",
          fontSize: 18,
          fontWeight: 900,
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        T
      </div>
    ),
    {
      ...size,
    },
  );
}
