"use client";

import { cn } from "@/lib/cn";

/* Living "wall of characters" background built from /public/collage/cNN.png.
   Columns drift slowly in alternating directions; a bordeaux/black scrim on
   top keeps foreground text readable. Pure CSS animation for performance. */

const IMAGES = Array.from({ length: 7 }, (_, i) => `/collage/c0${i + 1}.png`);
const COLUMNS = 7;
const PER_COLUMN = 4;

function columnImages(col: number): string[] {
  return Array.from(
    { length: PER_COLUMN },
    (_, i) => IMAGES[(col * 2 + i) % IMAGES.length],
  );
}

export function CollageBackground({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
    >
      {/* drifting columns */}
      <div className="absolute inset-0 flex gap-2 opacity-[0.26] blur-[1.5px]">
        {Array.from({ length: COLUMNS }).map((_, c) => {
          const imgs = columnImages(c);
          const up = c % 2 === 0;
          const duration = 42 + (c % 3) * 12;
          return (
            <div key={c} className="min-w-0 flex-1">
              <div
                data-collage-col
                className="flex flex-col will-change-transform"
                style={{
                  animation: `${up ? "collage-up" : "collage-down"} ${duration}s linear infinite`,
                }}
              >
                {[...imgs, ...imgs].map((src, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={src}
                    alt=""
                    loading="lazy"
                    className="mb-3 aspect-[3/4] w-full rounded-2xl object-cover"
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* scrims: bordeaux glow up top, fade to bg, edge vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(60rem 38rem at 50% -8%, rgba(160,27,46,0.4), transparent 60%)",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-bg/70 via-bg/45 to-bg" />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(75% 75% at 50% 40%, transparent 35%, var(--color-bg) 100%)",
        }}
      />
    </div>
  );
}
