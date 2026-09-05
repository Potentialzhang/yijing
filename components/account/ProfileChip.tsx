"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Profile = { email: string; display_name: string };

export function ProfileChip() {
  const [profile, setProfile] = useState<Profile | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    void fetch("/api/auth/me", { cache: "no-store", signal: controller.signal })
      .then((response) => response.json())
      .then((data) => { if (active) setProfile(data.user ?? null); })
      .catch(() => undefined)
      .finally(() => window.clearTimeout(timeout));
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, []);
  const name = profile?.display_name?.trim() || profile?.email?.split("@")[0] || "学习者";
  return <Link className="profile-chip" href="/account" aria-label={`账户：${name}`}><span className="profile-avatar">{name.slice(0, 1).toUpperCase()}</span><span>{name}</span><span className="chevron" aria-hidden="true">⌄</span></Link>;
}
