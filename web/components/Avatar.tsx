"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function Avatar({
  name,
  gradient,
  src,
  size = 48,
  className,
  ring,
}: {
  name: string;
  gradient: [string, string];
  src?: string;
  size?: number;
  className?: string;
  ring?: boolean;
}) {
  const [ok, setOk] = useState(true);
  return (
    <div
      className={cn(
        "relative grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold text-white select-none",
        ring && "ring-2 ring-white/15",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        backgroundImage: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
      }}
    >
      {src && ok ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setOk(false)}
        />
      ) : (
        initials(name)
      )}
    </div>
  );
}
