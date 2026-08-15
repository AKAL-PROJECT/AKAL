"use client";
import { GoogleOAuthProvider } from "@react-oauth/google";

export default function GoogleAuthProviderWrapper({ children }: { children: React.ReactNode }) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    console.error("Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID");
    return <>{children}</>;
  }
  return <GoogleOAuthProvider clientId={clientId}>{children}</GoogleOAuthProvider>;
}
