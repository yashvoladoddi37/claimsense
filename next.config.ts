import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {},
  // Mark native/heavy packages as external so they aren't bundled
  serverExternalPackages: ['tesseract.js', '@huggingface/transformers', 'onnxruntime-node', 'unpdf', 'sharp'],
};

export default nextConfig;
