import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep native/font-data packages external so runtime file paths resolve.
  serverExternalPackages: [
    "pdf-parse",
    "@napi-rs/canvas",
    "pdfkit",
    "fontkit",
    "@react-pdf/renderer",
  ],
};

export default nextConfig;
