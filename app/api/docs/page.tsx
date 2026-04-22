"use client";

import { useEffect, useRef } from "react";

export default function ApiDocsPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Load Swagger UI from CDN
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/swagger-ui-dist@5/swagger-ui.css";
    document.head.appendChild(link);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js";
    script.onload = () => {
      if (containerRef.current && (window as any).SwaggerUIBundle) {
        (window as any).SwaggerUIBundle({
          url: "/api/openapi.json",
          dom_id: "#swagger-ui",
          presets: [(window as any).SwaggerUIBundle.presets.apis],
          layout: "BaseLayout",
        });
      }
    };
    document.body.appendChild(script);

    return () => {
      document.head.removeChild(link);
      document.body.removeChild(script);
    };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <div id="swagger-ui" ref={containerRef} />
    </div>
  );
}
