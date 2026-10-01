import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sends prescriptions to pharmacies (lib/mail.ts); a Node library, loaded as-is on the server.
  serverExternalPackages: ["nodemailer"],
};

export default nextConfig;
